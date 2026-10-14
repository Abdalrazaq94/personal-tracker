// Supabase Edge Function: "ingest"
// Receives Google Wallet payment notifications (sent by MacroDroid on Android) and adds them to Spending.
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

async function sha(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  let body: { token?: string; title?: string; text?: string } = {}
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
  if (!owner) return json({ error: 'Unknown token — copy it again from the app (Spend → Google Wallet)' }, 401)

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
