// Supabase Edge Function: "notify" — phone reminders for plans and prayers.
//
// Called every minute by the database (pg_cron, see migrations/008_reminders.sql) with {"action":"tick"}.
// The app also calls it to get the public key ("vapid"), to send a test ("test"),
// and the notification buttons call it for Done / Postpone / On time / Late ("act").
//
// Deploy with "Verify JWT" OFF. Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'npm:adhan@4.4.3'

/* ============================ Web Push (built-in crypto only) ============================ */
// Web Push for Supabase Edge Functions, using only the built-in Web Crypto API (no npm packages).
//  - VAPID (RFC 8292): an ES256-signed token that proves the message comes from this app
//  - Message encryption (RFC 8291, "aes128gcm"): only the phone that subscribed can read it

const enc = new TextEncoder()

const b64u = {
  enc(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  dec(str: string): Uint8Array {
    const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}
// HKDF in two steps, as written in the RFCs
const hkdfExtract = (salt: Uint8Array, ikm: Uint8Array) => hmac(salt, ikm)
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number) {
  const t = await hmac(prk, concat(info, new Uint8Array([1])))
  return t.slice(0, len)
}

/** A new VAPID key pair: { publicKey (base64url, 65-byte raw point), privateJwk } */
async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  return { publicKey: b64u.enc(raw), privateJwk }
}

/** "vapid t=<jwt>, k=<public key>" for the Authorization header. */
async function vapidHeader(endpoint: string, publicKey: string, privateJwk: JsonWebKey, subject: string) {
  const aud = new URL(endpoint).origin
  const header = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${publicKey}`
}

/** Encrypts one message for one subscription (RFC 8291 aes128gcm). Returns the request body. */
async function encryptPayload(p256dh: string, auth: string, payload: Uint8Array, saltIn?: Uint8Array, localKeys?: CryptoKeyPair) {
  const uaPublic = b64u.dec(p256dh)
  const authSecret = b64u.dec(auth)
  const salt = saltIn ?? crypto.getRandomValues(new Uint8Array(16))

  const local = localKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  // IKM = HKDF(auth, shared, "WebPush: info" || 0 || ua_public || as_public)
  const prkKey = await hkdfExtract(authSecret, shared)
  const ikm = await hkdfExpand(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const prk = await hkdfExtract(salt, ikm)
  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\0'), 12)

  const plain = concat(payload, new Uint8Array([2])) // last (only) record delimiter
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, plain))

  // header: salt(16) | record size(4) | key id length(1) | key id (our public key, 65)
  const rs = new Uint8Array([0, 0, 16, 0]) // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher)
}

type Subscription = { endpoint: string; p256dh: string; auth: string }

/** Sends one notification. Returns the push service's HTTP status (201 = sent, 404/410 = subscription is gone) and its error text. */
async function sendPush(sub: Subscription, data: unknown, vapid: { publicKey: string; privateJwk: JsonWebKey; subject: string }, ttl = 3600, urgency = 'high') {
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(data)))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, vapid.publicKey, vapid.privateJwk, vapid.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  })
  const text = res.status < 300 ? '' : (await res.text().catch(() => '')).slice(0, 300)
  return { status: res.status, text }
}

/* ================================ the reminder server ================================ */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MIN = 60_000
// How often an unanswered reminder rings again: the user's choice (Reminders page, "Ring again"),
// for the first hour; after that at most every 15 minutes so the phone isn't ringing all night.
function ringGap(setting: Any, fallbackMin: number, sinceFirst: number) {
  const chosen = Number(setting?.ring_every) || fallbackMin
  return (sinceFirst > 60 * MIN ? Math.max(chosen, 15) : chosen) * MIN
}
const PRAYERS = [
  ['fajr', 'Fajr'],
  ['dhuhr', 'Dhuhr'],
  ['asr', 'Asr'],
  ['maghrib', 'Maghrib'],
  ['isha', 'Isha'],
] as const

// deno-lint-ignore no-explicit-any
type Any = any

/* ------------------------------ sounds ------------------------------ */
// The sound and "ring until I answer / once" for each kind of reminder (Reminders page). Keep in sync with src/lib/sounds.js.
const DEFAULT_SOUNDS: Record<string, { sound: string; ring: boolean }> = {
  plan: { sound: 'chime', ring: false },
  important: { sound: 'alarm', ring: true },
  task: { sound: 'marimba', ring: false },
  prayer: { sound: 'adhan', ring: true },
}
function soundFor(setting: Any, kind: string) {
  const saved = setting?.sounds?.[kind]
  const out = { ...DEFAULT_SOUNDS[kind], ...(saved || {}) }
  // before sounds existed, prayers used "Keep reminding until I mark it"
  if (kind === 'prayer' && !saved && setting && 'prayer_repeat' in setting) out.ring = setting.prayer_repeat !== false
  return out
}

/* ------------------------------ time zones ------------------------------ */

/** Minutes the zone is ahead of UTC at that moment. */
function tzOffset(at: number, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value])
  )
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return (asUtc - at) / MIN
}
/** "2026-10-16" + "15:40" in Europe/London → the exact moment. */
function zonedToUtc(day: string, time: string, tz: string) {
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let t = guess - tzOffset(guess, tz) * MIN
  t = guess - tzOffset(t, tz) * MIN // again, in case the clocks change that day
  return t
}
function localDay(at: number, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
}
const clock = (at: number, tz: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(at))
const safeTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return 'Europe/London'
  }
}

/* -------------------------------- server -------------------------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')
  if (!key) return json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, 500)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  let body: Any = {}
  try {
    body = await req.json()
  } catch {
    /* empty */
  }

  try {
    const cfg = await config(db)
    switch (body.action) {
      case 'vapid':
        return json({ publicKey: cfg.public_key })
      case 'tick':
        if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'not allowed' }, 401)
        return json(await tick(db, cfg))
      case 'test': {
        const user = await signedInUser(db, req)
        if (!user) return json({ error: 'Please sign in again.' }, 401)
        const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', user)
        const problems: string[] = []
        const { data: mySet } = await db.from('user_settings').select('*').eq('user_id', user).maybeSingle()
        const kind = DEFAULT_SOUNDS[body.kind] ? body.kind : 'important'
        const snd = soundFor(mySet, kind)
        const sent = await sendToUser(db, cfg, user, (sub) => ({
          title: '🔔 Reminders are on',
          body: 'This is how your reminders will look. Tap Done to try the button.',
          tag: 'test',
          renotify: true,
          requireInteraction: false,
          sound: snd.sound,
          ring: false,
          actions: [{ action: 'done', title: '✓ Done' }],
          data: { kind: 'test', secret: sub.secret, url: '/#/reminders', api: API() },
        }), subs ?? [], problems)
        return json({ sent, devices: (subs ?? []).length, problems, publicKey: cfg.public_key })
      }
      case 'act':
        return json(await act(db, body))
      default:
        return json({ error: 'Unknown request.' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

async function signedInUser(db: Any, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await db.auth.getUser(token)
  return data?.user?.id ?? null
}

/** The server's VAPID keys, made the first time they are needed. */
async function config(db: Any) {
  const { data, error } = await db.from('push_config').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(/push_config/.test(error.message) ? 'Run supabase/migrations/008_reminders.sql first.' : error.message)
  if (data?.public_key && data?.private_jwk) return data
  // only fill the keys if nobody else did at the same moment (two keys would break every phone's subscription)
  const keys = await generateVapidKeys()
  const { error: e2 } = await db.from('push_config').update({ public_key: keys.publicKey, private_jwk: keys.privateJwk }).eq('id', 1).is('public_key', null)
  if (e2) throw new Error(e2.message)
  const { data: saved, error: e3 } = await db.from('push_config').select('*').eq('id', 1).single()
  if (e3) throw new Error(e3.message)
  return saved
}

const API = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
const vapidOf = (cfg: Any) => ({ publicKey: cfg.public_key, privateJwk: cfg.private_jwk, subject: 'mailto:reminders@personal-tracker.app' })

/** Sends to every phone/browser of one user. Removes subscriptions the push service says are gone. */
async function sendToUser(db: Any, cfg: Any, userId: string, build: (sub: Any) => unknown, subsIn?: Any[], problems?: string[]) {
  const subs = subsIn ?? (await db.from('push_subscriptions').select('*').eq('user_id', userId)).data ?? []
  let sent = 0
  for (const sub of subs) {
    try {
      const { status, text } = await sendPush(sub as Subscription, build(sub), vapidOf(cfg))
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', sub.id)
      if (status < 300) sent++
      else problems?.push(`${new URL(sub.endpoint).host} said ${status}${text ? ': ' + text : ''}`)
    } catch (e) {
      // one phone failing must not stop the others
      problems?.push(`Could not send: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return sent
}

/* --------------------------------- tick --------------------------------- */

async function tick(db: Any, cfg: Any) {
  const now = Date.now()
  const { data: subs } = await db.from('push_subscriptions').select('*')
  if (!subs?.length) return { users: 0, sent: 0 }
  const byUser = new Map<string, Any[]>()
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  const users = [...byUser.keys()]
  const { data: settings } = await db.from('user_settings').select('*').in('user_id', users)
  const setOf = new Map<string, Any>((settings ?? []).map((s: Any) => [s.user_id, s]))
  let sent = 0

  // ---- plans with a time ----
  const from = new Date(now - 2 * 864e5).toISOString().slice(0, 10)
  const to = new Date(now + 3 * 864e5).toISOString().slice(0, 10)
  const { data: plans } = await db
    .from('plans')
    .select('*')
    .in('user_id', users)
    .eq('done', false)
    .not('plan_time', 'is', null)
    .gte('plan_date', from)
    .lte('plan_date', to)
  for (const p of plans ?? []) {
    const tz = safeTz(setOf.get(p.user_id)?.tz || 'Europe/London')
    const due = zonedToUtc(p.plan_date, String(p.plan_time).slice(0, 5), tz)
    const remindAt = due - (p.remind_before || 0) * MIN
    if (now < remindAt) continue
    if (p.snoozed_until && now < Date.parse(p.snoozed_until)) continue
    const last = p.last_notified ? Date.parse(p.last_notified) : 0
    const count = p.notify_count || 0
    let why = ''
    if (count === 0 && now - remindAt < 6 * 3600 * 1000) why = now < due ? 'early' : 'now'
    else if (count > 0 && p.remind_before > 0 && now >= due && last < due) why = 'now' // the early one was sent; now it's time
    else if (soundFor(setOf.get(p.user_id), p.important ? 'important' : 'plan').ring && now >= due && now - last >= ringGap(setOf.get(p.user_id), 5, now - due) - 20_000 && now - due < 12 * 3600 * 1000) why = 'again'
    if (!why) continue
    const snd = soundFor(setOf.get(p.user_id), p.important ? 'important' : 'plan')

    const at = clock(due, tz)
    const dueDay = localDay(due, tz)
    const dayWord =
      dueDay === localDay(now, tz)
        ? 'today'
        : dueDay === localDay(now + 864e5, tz)
          ? 'tomorrow'
          : 'on ' + new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long' }).format(new Date(due))
    const left = Math.round((due - now) / MIN)
    const inWords = left >= 120 ? `In ${Math.round(left / 60)} hours` : left >= 60 ? 'In 1 hour' : `In ${left} min`
    const body =
      why === 'early'
        ? left >= 6 * 60
          ? `Reminder · ${dayWord} at ${at}`
          : `${inWords} · ${dayWord} at ${at}`
        : why === 'again'
          ? `Still not done (was due at ${at}). Tap Done or Postpone.`
          : `Now · ${at}${p.important ? ' · important' : ''}`
    sent += await sendToUser(
      db,
      cfg,
      p.user_id,
      (sub) => ({
        title: `${p.important ? '❗ ' : '⏰ '}${p.title}`,
        body,
        tag: `plan-${p.id}`,
        renotify: true,
        requireInteraction: snd.ring || !!p.important,
        sound: snd.sound,
        ring: snd.ring && why !== 'early',
        actions: [
          { action: 'done', title: '✓ Done' },
          { action: 'snooze', title: 'Postpone 1 h' },
        ],
        data: { kind: 'plan', id: p.id, secret: sub.secret, url: '/#/plan', api: API() },
      }),
      byUser.get(p.user_id)
    )
    await db.from('plans').update({ notify_count: count + 1, last_notified: new Date(now).toISOString() }).eq('id', p.id)
  }

  // ---- tasks with "Remind me" ----
  const { data: tasks } = await db
    .from('tasks')
    .select('*')
    .in('user_id', users)
    .neq('status', 'done')
    .not('remind_at', 'is', null)
    .lte('remind_at', new Date(now).toISOString())
    .gte('remind_at', new Date(now - 12 * 3600 * 1000).toISOString())
  for (const t of tasks ?? []) {
    const set = setOf.get(t.user_id)
    const tz = safeTz(set?.tz || 'Europe/London')
    const due = Date.parse(t.remind_at)
    if (t.snoozed_until && now < Date.parse(t.snoozed_until)) continue
    const last = t.last_notified ? Date.parse(t.last_notified) : 0
    const count = t.notify_count || 0
    const snd = soundFor(set, 'task')
    const first = count === 0
    const again = !first && snd.ring && now - last >= ringGap(set, 5, now - due) - 20_000
    if (!first && !again) continue
    sent += await sendToUser(
      db,
      cfg,
      t.user_id,
      (sub) => ({
        title: `${t.priority === 'important' ? '❗' : '📝'} ${t.title}`,
        body: first ? `Task · ${clock(due, tz)}` : `Still not done (since ${clock(due, tz)}). Tap Done or Postpone.`,
        tag: `task-${t.id}`,
        renotify: true,
        requireInteraction: snd.ring,
        sound: snd.sound,
        ring: snd.ring,
        actions: [
          { action: 'done', title: '✓ Done' },
          { action: 'snooze', title: 'Postpone 1 h' },
        ],
        data: { kind: 'task', id: t.id, secret: sub.secret, url: '/#/tasks', api: API() },
      }),
      byUser.get(t.user_id)
    )
    await db.from('tasks').update({ notify_count: count + 1, last_notified: new Date(now).toISOString() }).eq('id', t.id)
  }

  // ---- prayers ----
  for (const s of settings ?? []) {
    const place = s.prayer_place
    if (!s.prayer_notify || !place?.lat || !place?.lon) continue
    const tz = safeTz(place.tz || s.tz || 'Europe/London')
    const day = localDay(now, tz)
    const times = prayerTimes(place, day)
    const { data: logged } = await db.from('prayer_logs').select('prayer').eq('user_id', s.user_id).eq('day', day)
    const done = new Set((logged ?? []).map((l: Any) => l.prayer))
    const { data: alerts } = await db.from('prayer_alerts').select('*').eq('user_id', s.user_id).eq('day', day)
    const alertOf = new Map((alerts ?? []).map((a: Any) => [a.prayer, a]))

    for (let i = 0; i < PRAYERS.length; i++) {
      const [key, name] = PRAYERS[i]
      const start = times[key]
      const end = i < PRAYERS.length - 1 ? times[PRAYERS[i + 1][0]] : start + 4 * 3600 * 1000
      if (now < start || now >= end || done.has(key)) continue
      const a: Any = alertOf.get(key) ?? { count: 0 }
      if (a.snoozed_until && now < Date.parse(a.snoozed_until)) continue
      const last = a.last_at ? Date.parse(a.last_at) : 0
      const first = a.count === 0 && now - start < 60 * MIN
      const snd = soundFor(s, 'prayer')
      const again = a.count > 0 && snd.ring && now - last >= ringGap(s, 10, now - start) - 20_000
      if (!first && !again) continue
      sent += await sendToUser(
        db,
        cfg,
        s.user_id,
        (sub) => ({
          title: `🕌 ${name} · ${clock(start, tz)}`,
          body: first ? `Time for ${name}${place.name ? ` (${place.name})` : ''}` : `${name} isn't marked yet. Did you pray?`,
          tag: `prayer-${day}-${key}`,
          renotify: true,
          requireInteraction: snd.ring,
          sound: snd.sound,
          ring: snd.ring,
          actions: [
            { action: 'ontime', title: '✓ Prayed' },
            { action: 'snooze', title: 'Remind in 10 min' },
          ],
          data: { kind: 'prayer', day, prayer: key, secret: sub.secret, url: '/#/commit', api: API() },
        }),
        byUser.get(s.user_id)
      )
      await db.from('prayer_alerts').upsert({ user_id: s.user_id, day, prayer: key, count: (a.count || 0) + 1, last_at: new Date(now).toISOString(), snoozed_until: null })
    }
  }
  return { users: users.length, sent }
}

function prayerTimes(place: Any, day: string) {
  const [y, m, d] = day.split('-').map(Number)
  const coords = new Coordinates(Number(place.lat), Number(place.lon))
  const make = (CalculationMethod as Any)[place.method] || CalculationMethod.MoonsightingCommittee
  const params = make()
  params.madhab = place.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi
  params.highLatitudeRule = HighLatitudeRule.recommended(coords)
  const t = new PrayerTimes(coords, new Date(y, m - 1, d), params)
  return { fajr: +t.fajr, dhuhr: +t.dhuhr, asr: +t.asr, maghrib: +t.maghrib, isha: +t.isha } as Record<string, number>
}

/* --------------------- buttons on the notification ---------------------- */

async function act(db: Any, b: Any) {
  const secret = String(b.secret ?? '')
  if (secret.length < 20) return { error: 'not allowed' }
  const { data: sub } = await db.from('push_subscriptions').select('user_id').eq('secret', secret).maybeSingle()
  if (!sub) return { error: 'not allowed' }
  const user = sub.user_id
  const now = Date.now()

  if (b.kind === 'task' && b.id) {
    if (b.what === 'done') await db.from('tasks').update({ status: 'done' }).eq('id', b.id).eq('user_id', user)
    if (b.what === 'snooze') await db.from('tasks').update({ snoozed_until: new Date(now + 60 * MIN).toISOString(), last_notified: new Date(now).toISOString() }).eq('id', b.id).eq('user_id', user)
    return { ok: true }
  }
  if (b.kind === 'plan' && b.id) {
    if (b.what === 'done') await db.from('plans').update({ done: true }).eq('id', b.id).eq('user_id', user)
    if (b.what === 'snooze') await db.from('plans').update({ snoozed_until: new Date(now + 60 * MIN).toISOString(), last_notified: new Date(now).toISOString() }).eq('id', b.id).eq('user_id', user)
    return { ok: true }
  }
  if (b.kind === 'prayer' && b.day && PRAYERS.some(([k]) => k === b.prayer)) {
    if (b.what === 'ontime' || b.what === 'late')
      await db.from('prayer_logs').upsert({ user_id: user, day: b.day, prayer: b.prayer, late: b.what === 'late' }, { onConflict: 'user_id,day,prayer' })
    if (b.what === 'snooze')
      await db.from('prayer_alerts').upsert({ user_id: user, day: b.day, prayer: b.prayer, snoozed_until: new Date(now + 10 * MIN).toISOString(), last_at: new Date(now).toISOString(), count: 1 })
    return { ok: true }
  }
  return { ok: true }
}
