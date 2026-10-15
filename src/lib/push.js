import { supabase } from './supabase'
import { T } from './i18n'

/** Phone notifications (Web Push). Works in Chrome on Android, desktop browsers, and iPhone when added to the Home Screen. */

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function registerWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  return navigator.serviceWorker.register('/sw.js').catch(() => null)
}

const toBytes = (b64) => {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}
const sameKey = (buf, b64) => {
  if (!buf) return true // browser doesn't tell us: assume it's fine
  const a = new Uint8Array(buf)
  const b = toBytes(b64)
  return a.length === b.length && a.every((x, i) => x === b[i])
}
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')

async function call(body) {
  const { data, error } = await supabase.functions.invoke('notify', { body })
  if (error) {
    let msg = error.message
    try {
      const j = await error.context?.json?.()
      if (j?.error) msg = j.error
    } catch {}
    if (error.context?.status === 404 || /Failed to send/i.test(msg)) msg = T('The “notify” function isn’t deployed yet (see the steps on this page).')
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/** How to allow notifications, for where you are (installed app or browser tab). */
export function blockedHelp(perm = Notification.permission) {
  const app = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (perm === 'default') return T(
    "You closed the question without choosing. Tap “Turn on reminders” again and choose Allow."
  );
  if (iphone) return T(
    "Notifications are off for Tracker. Open iPhone Settings → Notifications → Tracker → turn on Allow Notifications, then come back and tap Turn on reminders."
  );
  if (app)
    return T(
      "Notifications are off for the Tracker app. Open phone Settings → Apps → Tracker → Notifications → turn on, then come back and tap Turn on reminders."
    );
  return T(
    "Notifications are blocked for this site. Tap the icon left of the web address → Permissions (or Site settings) → Notifications → Allow, then reload and tap Turn on reminders."
  );
}

/** Is this phone/browser already getting reminders? */
export async function currentStatus() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Ask permission, subscribe this phone, and save it. */
export async function enablePush() {
  if (!pushSupported()) throw new Error(T(
    "This browser can’t show notifications. On iPhone, add Tracker to your Home Screen first."
  ))
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(blockedHelp(perm))
  const reg = (await registerWorker()) || (await navigator.serviceWorker.ready)
  await navigator.serviceWorker.ready
  const { publicKey } = await call({ action: 'vapid' })
  let sub = await reg.pushManager.getSubscription()
  // a subscription made with an older server key can never receive anything: replace it
  if (sub && !sameKey(sub.options?.applicationServerKey, publicKey)) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => {})
    sub = null
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) })
  const j = sub.toJSON()
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: u.user.id,
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      secret: randomSecret(),
      device: navigator.userAgent.slice(0, 160),
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw new Error(/push_subscriptions/.test(error.message) ? T("Run supabase/migrations/008_reminders.sql in Supabase first.") : error.message)
  await saveSettings({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

/** Sends a test. If nothing arrives, re-saves this phone once and tries again, then explains what went wrong. */
export async function sendTest() {
  let r = await call({ action: 'test' })
  if (r?.sent) return r
  // fix the usual causes (phone not saved, or saved with an old key) and try once more
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub && r?.problems?.some((p) => / (400|401|403) /.test(p + ' '))) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => {})
  }
  await enablePush()
  r = await call({ action: 'test' })
  if (r?.sent) return r
  const why = r?.problems?.length
    ? r.problems.join(' · ')
    : r?.devices === 0
      ? T('This phone is not saved on the server.')
      : T('Unknown reason.')
  throw new Error(T("Nothing was delivered. {0}", [why]))
}

/** Reminder settings live in user_settings (time zone, prayer reminders). */
export async function saveSettings(patch) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('user_settings').upsert({ user_id: u.user.id, ...patch, updated_at: new Date().toISOString() })
  if (error) throw new Error(/sounds|ring_every/.test(error.message) ? T("Run supabase/migrations/010_sounds.sql in Supabase first.") : /column|prayer_|tz/.test(error.message) ? T("Run supabase/migrations/008_reminders.sql in Supabase first.") : error.message)
}

export async function loadSettings() {
  const { data, error } = await supabase.from('user_settings').select('*').maybeSingle()
  if (error) return { needsUpdate: true }
  if (data && !('prayer_notify' in data)) return { ...data, needsUpdate: true }
  return { ring_every: 2, ...(data || {}), needsSounds: !!data && !('sounds' in data) }
}
