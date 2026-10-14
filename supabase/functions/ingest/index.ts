// Supabase Edge Function: "ingest"
// 1) Receives Google Wallet payment notifications (sent by MacroDroid on Android) and adds them to Spending.
// 2) Receives phone time from the "Tracker Phone" Android helper (kind: "screentime") and saves it to Phone time.
//
// POST JSON: { "token": "<your private key from the app>", "title": "<notification title>", "text": "<notification text>" }
// Reply:     { "added": true, "amount": 3.4, "note": "Costa Coffee" }  or  { "skipped": "<reason>" }
//
// Deploy with "Verify JWT" OFF — the private token is the protection.
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which Supabase provides automatically.
// (If your project doesn't have SUPABASE_SERVICE_ROLE_KEY, add your secret key as a secret named SERVICE_ROLE_KEY.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CURRENCY: Record<string, string> = { '£': 'GBP', $: 'USD', '€': 'EUR' }
const IGNORE = /refund|refunded|declined|card added|added to|ready to use|verify|verification|set up|pending authori[sz]ation|top.?up/i
const GENERIC_TITLES = /^(google ?wallet|google ?pay|wallet|payment|contactless|purchase)$/i

/** Finds the amount and shop in a payment notification. */
function readPayment(title: string, text: string) {
  const all = `${title} ${text}`
  if (IGNORE.test(all)) return { skip: 'not a payment' }

  const m =
    all.match(/([£$€])\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)/) ||
    all.match(/(GBP|USD|EUR|SAR|AED)\s?(\d+(?:[.,]\d{1,2})?)/i) ||
    all.match(/(\d+(?:[.,]\d{1,2})?)\s?(GBP|USD|EUR|SAR|AED)/i)
  if (!m) return { skip: 'no amount found' }
  const rawNumber = /\d/.test(m[1]) ? m[1] : m[2]
  const amount = Number(rawNumber.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'))
  if (!(amount > 0 && amount < 100000)) return { skip: 'amount out of range' }

  // shop: the notification title, unless it is just "Google Wallet"; otherwise text after "at" / "to"
  let note = title.trim()
  if (!note || GENERIC_TITLES.test(note)) {
    const at = text.match(/\b(?:at|to|with merchant)\s+([^,.\n•£$€]+?)(?:\s+(?:with|using|on|of|for)\b|[,.\n•£$€]|$)/i)
    note = at ? at[1].trim() : ''
  }
  note = note.replace(/\s+/g, ' ').slice(0, 120)
  return { amount: Math.round(amount * 100) / 100, note, currency: CURRENCY[m[1]] ?? m[1]?.toUpperCase?.() }
}

/** Phone time from the Android helper: [{ day, total_minutes, unlocks, apps: [{ name, minutes }] }] (today & yesterday). */
async function saveScreenTime(db: any, userId: string, days: unknown) {
  if (!Array.isArray(days)) return { error: 'Send "days": [...]' }
  const latest = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10) // phone may be ahead of UTC
  const mins = (v: unknown) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 1440) : 0
  }
  const rows = days
    .slice(0, 3)
    .filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d?.day ?? '') && d.day <= latest)
    .map((d: any) => ({
      user_id: userId,
      day: d.day,
      total_minutes: mins(d.total_minutes),
      unlocks: Number.isFinite(Number(d.unlocks)) ? Math.max(0, Math.round(Number(d.unlocks))) : null,
      apps: (Array.isArray(d.apps) ? d.apps : [])
        .map((a: any) => ({ name: String(a?.name ?? '').trim().slice(0, 60), minutes: mins(a?.minutes) }))
        .filter((a: any) => a.name && a.minutes > 0)
        .slice(0, 40),
      source: 'phone',
      updated_at: new Date().toISOString(),
    }))
  if (!rows.length) return { error: 'No days to save' }
  const { error } = await db.from('screen_time').upsert(rows, { onConflict: 'user_id,day' })
  if (error) {
    if (/screen_time|does not exist|schema cache/i.test(error.message)) return { error: 'Run supabase/migrations/005_screen_time.sql in Supabase first.' }
    return { error: error.message }
  }
  return { saved: rows.map((r) => ({ day: r.day, total_minutes: r.total_minutes })) }
}

async function sha(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  let body: { token?: string; title?: string; text?: string; kind?: string; days?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Send JSON: {"token": "...", "title": "...", "text": "..."}' }, 400)
  }
  const token = String(body.token ?? '').trim()
  const title = String(body.title ?? '').slice(0, 200)
  const text = String(body.text ?? '').slice(0, 500)
  if (token.length < 20) return json({ error: 'Missing or invalid token' }, 401)

  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY')
  if (!key) return json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, 500)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } })

  const { data: owner, error: ownerErr } = await db.from('user_settings').select('user_id').eq('ingest_token', token).maybeSingle()
  if (ownerErr) return json({ error: ownerErr.message }, 500)
  if (!owner) return json({ error: 'Unknown key. Copy it again from the tracker (Phone page or Spend → Google Wallet)' }, 401)

  if (body.kind === 'screentime') return json(await saveScreenTime(db, owner.user_id, body.days))

  const p = readPayment(title, text)
  if ('skip' in p) return json({ skipped: p.skip })

  // same notification within ~2 minutes = duplicate
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const slot = Math.floor(now.getTime() / 120000)
  const external_id = await sha(`${title}|${text}|${slot}`)

  const { error } = await db.from('expenses').insert({
    user_id: owner.user_id,
    amount: p.amount,
    note: p.note,
    spent_on: day,
    source: 'wallet',
    external_id,
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return json({ skipped: 'duplicate' })
    return json({ error: error.message }, 500)
  }
  return json({ added: true, amount: p.amount, note: p.note })
})
