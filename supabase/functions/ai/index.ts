// Supabase Edge Function: "ai"
// All AI features of the tracker go through here so the AI key stays secret.
//
//   kind: "tasks"     – analyse tasks + plans            → { text }
//   kind: "spending"  – analyse spending                 → { text }
//   kind: "translate" – English word → Arabic            → { translation }
//   kind: "explain"   – explain a word (Arabic + English) → { text }
//   kind: "practice"  – fill-the-gap sentences for words  → { items: [{ word, sentence, answer, arabic }] }
//   kind: "check"     – correct the user's own sentence   → { correct, corrected, feedback, feedback_ar }
//
// Secrets (Supabase → Edge Functions → Secrets) — set ONE of these:
//   GEMINI_API_KEY      free key from https://aistudio.google.com/apikey
//   ANTHROPIC_API_KEY   Claude key from https://console.anthropic.com (pay-as-you-go)
// Optional: GEMINI_MODEL (default "gemini-flash-latest"), ANTHROPIC_MODEL (default "claude-haiku-5-5")
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v : '').slice(0, n).trim()

type Body = {
  kind?: string
  question?: string
  today?: string
  currency?: string
  word?: string
  translation?: string
  sentence?: string
  words?: { word?: string; translation?: string }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // --- only signed-in users may use the AI ---
  const auth = req.headers.get('Authorization') ?? ''
  // the public key: Supabase provides SUPABASE_ANON_KEY; fall back to the key the app sent (newer projects)
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || req.headers.get('apikey') || ''
  const db = createClient(Deno.env.get('SUPABASE_URL')!, publicKey, {
    global: { headers: { Authorization: auth } },
  })
  const { data: userData, error: userErr } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (userErr || !userData?.user) return json({ error: 'Please sign in again.' }, 401)

  let body: Body = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }

  try {
    switch (body.kind) {
      case 'translate':
        return json(await translate(body))
      case 'explain':
        return json(await explain(body))
      case 'practice':
        return json(await practice(body))
      case 'check':
        return json(await check(body))
      case 'spending':
      case 'tasks':
        return json(await analyse(db, body))
      default:
        return json({ error: 'Unknown request.' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

/* ------------------------------- words ---------------------------------- */

const TEACHER =
  'You are a kind, encouraging English teacher for an Arabic-speaking learner (intermediate level). ' +
  'Use simple English. Arabic must be Modern Standard Arabic.'

async function translate(b: Body) {
  const word = clip(b.word, 80)
  if (!word) throw new Error('No word given.')
  const out = await askJson(
    TEACHER,
    `Translate the English word or phrase "${word}" into Arabic.\n` +
      'Give the most common meaning first; if it has 2–3 very different common meanings, give them separated by "، ". ' +
      'Keep it short (max 6 Arabic words). Fix obvious spelling mistakes in the English.\n' +
      'Return JSON: {"word": "<English, spelling fixed, lowercase unless a proper noun>", "translation": "<Arabic>"}'
  )
  return { word: clip(out.word, 80) || word, translation: clip(out.translation, 120) }
}

async function explain(b: Body) {
  const word = clip(b.word, 80)
  if (!word) throw new Error('No word given.')
  const text = await askText(
    TEACHER + ' Format: "## " headings, "- " bullets, **bold** the word. No tables. Max ~180 words.',
    `Explain the English word "${word}"${b.translation ? ` (the learner noted the Arabic: ${clip(b.translation, 120)})` : ''}.\n` +
      'Sections: ## Meaning (simple English + Arabic), ## Examples (3 short everyday sentences, each followed by its Arabic translation), ' +
      '## Similar words (2–4 synonyms), ## Tip (pronunciation or common mistake for Arabic speakers).'
  )
  return { text }
}

async function practice(b: Body) {
  const list = (Array.isArray(b.words) ? b.words : [])
    .slice(0, 8)
    .map((w) => ({ word: clip(w.word, 60), translation: clip(w.translation, 120) }))
    .filter((w) => w.word)
  if (!list.length) throw new Error('No words to practise.')
  const out = await askJson(
    TEACHER,
    'Create one fill-in-the-gap practice sentence for EACH of these words:\n' +
      list.map((w) => `- ${w.word}${w.translation ? ` (${w.translation})` : ''}`).join('\n') +
      '\n\nRules: natural everyday sentence, 8–16 words, the gap is written as "____" and replaces exactly the word ' +
      '(use the form that fits the sentence, e.g. plural or past tense). Keep the same order as the list.\n' +
      'Return JSON: {"items": [{"word": "<word from the list>", "sentence": "<sentence with ____>", ' +
      '"answer": "<exact text that fills the gap>", "arabic": "<Arabic translation of the full sentence>"}]}'
  )
  const items = (Array.isArray(out.items) ? out.items : [])
    .map((i: Record<string, unknown>) => ({
      word: clip(i.word, 60),
      sentence: clip(i.sentence, 300),
      answer: clip(i.answer, 60),
      arabic: clip(i.arabic, 400),
    }))
    .filter((i: { sentence: string; answer: string }) => i.sentence.includes('____') && i.answer)
  if (!items.length) throw new Error('The AI could not make practice sentences. Try again.')
  return { items }
}

async function check(b: Body) {
  const word = clip(b.word, 60)
  const sentence = clip(b.sentence, 500)
  if (!word || !sentence) throw new Error('Write or say a sentence first.')
  const out = await askJson(
    TEACHER,
    `The learner is practising the word "${word}". They wrote or said this sentence:\n"${sentence}"\n\n` +
      'Check: does it use the word (or a form of it) correctly, and is the grammar correct? ' +
      'Speech-to-text may have dropped punctuation or capitals — ignore those.\n' +
      'Return JSON: {"correct": true|false, "used_word": true|false, ' +
      '"corrected": "<the corrected sentence, or the same sentence if already correct>", ' +
      '"feedback": "<1–3 short sentences in simple English: what was good, what to fix and why>", ' +
      '"feedback_ar": "<the same feedback in Arabic>"}'
  )
  return {
    correct: Boolean(out.correct) && out.used_word !== false,
    used_word: out.used_word !== false,
    corrected: clip(out.corrected, 500),
    feedback: clip(out.feedback, 600),
    feedback_ar: clip(out.feedback_ar, 800),
  }
}

/* --------------------------- tasks / spending ---------------------------- */

// deno-lint-ignore no-explicit-any
async function analyse(db: any, b: Body) {
  const kind = b.kind === 'spending' ? 'spending' : 'tasks'
  const question = clip(b.question, 500)
  const today = /^\d{4}-\d{2}-\d{2}$/.test(b.today ?? '') ? b.today! : new Date().toISOString().slice(0, 10)
  const currency = clip(b.currency, 5) || 'GBP'

  let data: string
  if (kind === 'tasks') {
    const [tasks, plans] = await Promise.all([
      db.from('tasks').select('title, priority, status, created_at').order('created_at', { ascending: false }).limit(300),
      db.from('plans').select('title, plan_date, done').order('plan_date', { ascending: false }).limit(300),
    ])
    if (tasks.error || plans.error) throw new Error((tasks.error ?? plans.error).message)
    data =
      'DAILY TASKS (title | priority | status | created):\n' +
      // deno-lint-ignore no-explicit-any
      (tasks.data.map((t: any) => `${t.title} | ${t.priority} | ${t.status} | ${t.created_at.slice(0, 10)}`).join('\n') || '(none)') +
      '\n\nPLANNED TASKS (title | date | done):\n' +
      // deno-lint-ignore no-explicit-any
      (plans.data.map((p: any) => `${p.title} | ${p.plan_date} | ${p.done ? 'done' : 'not done'}`).join('\n') || '(none)')
  } else {
    const since = new Date(today)
    since.setDate(since.getDate() - 180)
    const { data: rows, error } = await db
      .from('expenses')
      .select('amount, note, spent_on')
      .gte('spent_on', since.toISOString().slice(0, 10))
      .order('spent_on', { ascending: false })
      .limit(1000)
    if (error) throw new Error(error.message)
    data =
      `SPENDING, last 180 days, currency ${currency} (date | amount | what for):\n` +
      // deno-lint-ignore no-explicit-any
      (rows.map((r: any) => `${r.spent_on} | ${Number(r.amount).toFixed(2)} | ${r.note || '-'}`).join('\n') || '(none)')
  }

  const system =
    'You are a friendly, practical personal coach inside a personal tracker app. ' +
    'Be concise and specific, use the real numbers and item names from the data, and never invent data. ' +
    'Format: short "## " headings, "- " bullet points, **bold** for key numbers. No tables. Max ~250 words. ' +
    'If there is too little data, say so briefly and suggest what to track.'

  const task =
    kind === 'tasks'
      ? 'Analyse my tasks: how I am doing, what is overdue or stuck in "doing", whether important tasks get done, patterns, and 3 concrete suggestions for tomorrow.'
      : 'Analyse my spending: totals this week and month vs earlier, biggest categories (group similar notes), unusual spends, trends, and 3 concrete money-saving suggestions.'

  const text = await askText(system, `Today is ${today}.\n\n${data}\n\n${question ? `My question: ${question}` : task}`)
  return { text }
}

/* ------------------------------ AI models -------------------------------- */

async function askText(system: string, prompt: string) {
  return await askModel(system, prompt, false)
}

// deno-lint-ignore no-explicit-any
async function askJson(system: string, prompt: string): Promise<any> {
  const raw = await askModel(system + ' Reply with ONLY valid JSON, no extra text.', prompt, true)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = cleaned.search(/[[{]/)
  try {
    return JSON.parse(start > 0 ? cleaned.slice(start) : cleaned)
  } catch {
    throw new Error('The AI gave an unexpected answer. Please try again.')
  }
}

async function askModel(system: string, prompt: string, wantJson: boolean): Promise<string> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')

  if (anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5',
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const out = await res.json()
    if (!res.ok) throw new Error(out?.error?.message ?? `AI error ${res.status}`)
    return out.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? ''
  }

  if (geminiKey) {
    // Try the main model, retry once if Google is busy, then fall back to lighter models.
    const models = [
      Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-2.5-flash',
    ].filter((m, i, all) => all.indexOf(m) === i)
    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(wantJson ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    })
    let lastError = 'The AI is busy right now. Please try again in a minute.'
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': geminiKey, 'content-type': 'application/json' },
          body: payload,
        })
        const out = await res.json().catch(() => ({}))
        if (res.ok) {
          const text = out.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
          if (text) return text
          lastError = 'The AI returned an empty answer. Please try again.'
          break
        }
        lastError = out?.error?.message ?? `AI error ${res.status}`
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error(lastError) // bad key/request: don't retry
        if ((res.status === 503 || res.status === 500 || res.status === 429) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500)) // busy: wait a moment and retry the same model
          continue
        }
        break // busy again, or model not found (404): try the next model
      }
    }
    throw new Error(/high demand|overloaded|unavailable|quota|rate/i.test(lastError) ? 'The AI is busy right now. Please try again in a minute.' : lastError)
  }

  throw new Error('AI is not set up yet: add GEMINI_API_KEY or ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets.')
}
