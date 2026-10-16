// Supabase Edge Function: "ai"
// All AI features of the tracker go through here so the AI key stays secret.
//
//   kind: "tasks"     – analyse tasks + plans            → { text }
//   kind: "spending"  – analyse spending                 → { text }
//   kind: "habits"    – analyse good/bad habits (30 days) → { text }
//   kind: "today"     – short summary of the user's day    → { text }
//   kind: "parse"     – turn "buy milk tomorrow, coffee 3.40" into actions → { actions: [...] }
//   kind: "translate" – English word → chosen language    → { translation }
//   kind: "explain"   – explain a word                    → { text }
//   kind: "practice"  – fill-the-gap sentences for words  → { items: [{ word, sentence, answer, arabic }] }
//   kind: "check"     – correct the user's own sentence   → { correct, corrected, feedback, feedback_ar }
// Word features take `lang` (the learner's language, default Arabic). The fields named
// `arabic` / `feedback_ar` hold text in that chosen language (names kept for compatibility).
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
  lang?: string
  habitKind?: string
  text?: string
  hour?: number
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

  // --- fair use: limits per person (needs migrations/016_security.sql; skipped if it hasn't been run) ---
  const limited = await overLimit(db, userData.user.id)
  if (limited) return json({ error: limited }, 429)

  let body: Body = {}
  try {
    if (Number(req.headers.get('content-length') || 0) > 50_000) return json({ error: 'Too much text in one request.' }, 413)
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
      case 'habits':
      case 'prayers':
        return json(await analyse(db, body))
      case 'today':
        return json(await brief(db, body))
      case 'parse':
        return json(await parse(db, body))
      case 'review':
        return json(await review(body))
      case 'sleep':
        return json(await sleep(db, body))
      case 'promises':
        return json(await promises(body))
      case 'faith':
        return json(await faith(body))
      case 'gym':
        return json(await gym(body))
      default:
        return json({ error: 'Unknown request.' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

const PER_HOUR = Number(Deno.env.get('AI_PER_HOUR') || 60)
const PER_DAY = Number(Deno.env.get('AI_PER_DAY') || 300)

/** null = fine; otherwise the message to show. Counts this request too. */
// deno-lint-ignore no-explicit-any
async function overLimit(db: any, _userId: string): Promise<string | null> {
  // One database transaction serializes each user's check-and-insert.
  // Requires migration 023_atomic_ai_usage.sql; fail closed until deployed.
  const { data, error } = await db.rpc('reserve_ai_usage', {
    max_per_hour: PER_HOUR,
    max_per_day: PER_DAY,
  })
  if (error || typeof data !== 'string') return 'AI is temporarily unavailable. Please try again later.'
  if (data === 'hour') return 'You’ve used the AI a lot in the last hour. Please try again a bit later.'
  if (data === 'day') return 'You’ve used the AI a lot today. Please try again tomorrow.'
  return data === 'ok' ? null : 'AI is temporarily unavailable. Please try again later.'
}

/* ------------------------------- words ---------------------------------- */

// Languages the app offers in "Translate to" (anything else falls back to Arabic).
const LANGS = [
  'Arabic', 'Urdu', 'Persian', 'Turkish', 'Kurdish (Sorani)', 'Hindi', 'Bengali', 'French', 'Spanish', 'German',
  'Italian', 'Portuguese', 'Russian', 'Polish', 'Romanian', 'Dutch', 'Chinese (Simplified)', 'Japanese', 'Korean',
  'Indonesian', 'Malay', 'Somali',
]
const langOf = (b: Body) => (LANGS.includes(b.lang ?? '') ? b.lang! : 'Arabic')

const teacher = (lang: string) =>
  `You are a kind, encouraging English teacher for a ${lang}-speaking learner (intermediate level). ` +
  'Use simple English.' +
  (lang === 'Arabic' ? ' Arabic must be Modern Standard Arabic.' : '')

async function translate(b: Body) {
  const word = clip(b.word, 80)
  if (!word) throw new Error('No word given.')
  const lang = langOf(b)
  const out = await askJson(
    teacher(lang),
    `Translate the English word or phrase "${word}" into ${lang}.\n` +
      'Give the most common meaning first; if it has 2–3 very different common meanings, give them separated by "، ". ' +
      `Keep it short (max 6 ${lang} words). Fix obvious spelling mistakes in the English.\n` +
      `Return JSON: {"word": "<English, spelling fixed, lowercase unless a proper noun>", "translation": "<${lang}>"}`
  )
  return { word: clip(out.word, 80) || word, translation: clip(out.translation, 120) }
}

async function explain(b: Body) {
  const word = clip(b.word, 80)
  if (!word) throw new Error('No word given.')
  const lang = langOf(b)
  const text = await askText(
    teacher(lang) + ' Format: "## " headings, "- " bullets, **bold** the word. No tables. Max ~180 words.',
    `Explain the English word "${word}"${b.translation ? ` (the learner noted the ${lang}: ${clip(b.translation, 120)})` : ''}.\n` +
      `Sections: ## Meaning (simple English + ${lang}), ## Examples (3 short everyday sentences, each followed by its ${lang} translation), ` +
      `## Similar words (2–4 synonyms), ## Tip (pronunciation or common mistake for ${lang} speakers).`
  , true)
  return { text }
}

async function practice(b: Body) {
  const list = (Array.isArray(b.words) ? b.words : [])
    .slice(0, 8)
    .map((w) => ({ word: clip(w.word, 60), translation: clip(w.translation, 120) }))
    .filter((w) => w.word)
  if (!list.length) throw new Error('No words to practise.')
  const lang = langOf(b)
  const out = await askJson(
    teacher(lang),
    'Create one fill-in-the-gap practice sentence for EACH of these words:\n' +
      list.map((w) => `- ${w.word}${w.translation ? ` (${w.translation})` : ''}`).join('\n') +
      '\n\nRules: natural everyday sentence, 8–16 words, the gap is written as "____" and replaces exactly the word ' +
      '(use the form that fits the sentence, e.g. plural or past tense). Keep the same order as the list.\n' +
      'Return JSON: {"items": [{"word": "<word from the list>", "sentence": "<sentence with ____>", ' +
      `"answer": "<exact text that fills the gap>", "arabic": "<${lang} translation of the full sentence>"}]}`
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
  const lang = langOf(b)
  const out = await askJson(
    teacher(lang),
    `The learner is practising the word "${word}". They wrote or said this sentence:\n"${sentence}"\n\n` +
      'Check: does it use the word (or a form of it) correctly, and is the grammar correct? ' +
      'Speech-to-text may have dropped punctuation or capitals — ignore those.\n' +
      'Return JSON: {"correct": true|false, "used_word": true|false, ' +
      '"corrected": "<the corrected sentence, or the same sentence if already correct>", ' +
      '"feedback": "<1–3 short sentences in simple English: what was good, what to fix and why>", ' +
      `"feedback_ar": "<the same feedback in ${lang}>"}`
  )
  return {
    correct: Boolean(out.correct) && out.used_word !== false,
    used_word: out.used_word !== false,
    corrected: clip(out.corrected, 500),
    feedback: clip(out.feedback, 600),
    feedback_ar: clip(out.feedback_ar, 800),
  }
}

/* ------------------------------ today screen ----------------------------- */

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const shiftDay = (day: string, n: number) => {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoDay(d)
}
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The monthly budget, or null (none set, or 015_budget.sql not run yet). */
// deno-lint-ignore no-explicit-any
async function budgetOf(db: any): Promise<number | null> {
  try {
    const { data, error } = await db.from('user_settings').select('budget').maybeSingle()
    return !error && Number(data?.budget) > 0 ? Number(data.budget) : null
  } catch {
    return null
  }
}
const budgetLine = (budget: number | null, monthSpent: number, today: string) => {
  if (!budget) return ''
  const [y, m, d] = today.split('-').map(Number)
  const daysLeft = new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1
  return `MONTHLY BUDGET: ${budget.toFixed(2)}; spent this month ${monthSpent.toFixed(2)} (${Math.round((monthSpent / budget) * 100)}%), ${(budget - monthSpent).toFixed(2)} left for ${daysLeft} days including today.`
}

// deno-lint-ignore no-explicit-any
async function brief(db: any, b: Body) {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(b.today ?? '') ? b.today! : isoDay(new Date())
  const currency = clip(b.currency, 5) || 'GBP'
  const hour = Number.isFinite(b.hour) ? Number(b.hour) : 9
  // Home feature choices are saved in the account, not supplied by the browser.
  const { data: settings, error: settingsError } = await db.from('user_settings').select('home_layout').maybeSingle()
  if (settingsError) throw new Error(settingsError.message)
  const choices = settings?.home_layout?.features
  const enabled = (key: string) => !Array.isArray(choices) || choices.find((f: { key?: string; on?: boolean }) => f?.key === key)?.on !== false
  const [tasks, plans, habits, logs, spend, words, budget] = await Promise.all([
    db.from('tasks').select('title, priority, status').neq('status', 'done').limit(40),
    db.from('plans').select('title, plan_date, done').gte('plan_date', shiftDay(today, -7)).lte('plan_date', shiftDay(today, 1)),
    db.from('habits').select('*'),
    db.from('habit_logs').select('*').gte('day', shiftDay(today, -6)),
    db.from('expenses').select('amount, note, spent_on').gte('spent_on', shiftDay(today, -30)),
    db.from('words').select('status'),
    budgetOf(db),
  ])
  for (const r of [tasks, plans, habits, logs, spend, words]) if (r.error) throw new Error(r.error.message)

  const last7 = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6))
  // deno-lint-ignore no-explicit-any
  const habitLines = habits.data.map((h: any) => {
    // deno-lint-ignore no-explicit-any
    const c = last7.map((d) => String(logs.data.find((l: any) => l.habit_id === h.id && l.day === d)?.count ?? 0))
    return `${h.name} (${h.kind === 'bad' ? 'bad, max' : 'good, target'} ${h.target}/day): last 7 days ${c.join(',')} (last = today)`
  })
  // deno-lint-ignore no-explicit-any
  const sum = (rows: any[]) => rows.reduce((a, r) => a + Number(r.amount), 0)
  // deno-lint-ignore no-explicit-any
  const todaySpend = sum(spend.data.filter((r: any) => r.spent_on === today))
  // deno-lint-ignore no-explicit-any
  const monthSpend = sum(spend.data.filter((r: any) => r.spent_on.slice(0, 7) === today.slice(0, 7)))
  // deno-lint-ignore no-explicit-any
  const avgDay = sum(spend.data.filter((r: any) => r.spent_on < today)) / 30
  // deno-lint-ignore no-explicit-any
  const wordCounts = words.data.reduce((a: Record<string, number>, w: any) => ((a[w.status] = (a[w.status] ?? 0) + 1), a), {})

  const data = [
    `Today is ${WEEK[new Date(today + 'T00:00:00Z').getUTCDay()]} ${today}, local time about ${hour}:00.`,
    // deno-lint-ignore no-explicit-any
    enabled('tasks') ? 'OPEN TASKS: ' + (tasks.data.map((t: any) => `${t.title}${t.priority === 'important' ? ' [important]' : ''}${t.status === 'doing' ? ' [doing]' : ''}`).join('; ') || 'none') : '',
    // deno-lint-ignore no-explicit-any
    enabled('plan') ? 'OVERDUE PLANS: ' + (plans.data.filter((p: any) => !p.done && p.plan_date < today).map((p: any) => `${p.title} (${p.plan_date})`).join('; ') || 'none') : '',
    // deno-lint-ignore no-explicit-any
    enabled('plan') ? 'PLANNED TODAY: ' + (plans.data.filter((p: any) => p.plan_date === today).map((p: any) => `${p.title}${p.done ? ' [done]' : ''}`).join('; ') || 'none') : '',
    // deno-lint-ignore no-explicit-any
    enabled('plan') ? 'PLANNED TOMORROW: ' + (plans.data.filter((p: any) => p.plan_date === shiftDay(today, 1)).map((p: any) => p.title).join('; ') || 'none') : '',
    enabled('habits') ? 'HABITS: ' + (habitLines.join(' | ') || 'none') : '',
    enabled('spend') ? `SPENDING (${currency}): today ${todaySpend.toFixed(2)}, this month ${monthSpend.toFixed(2)}, usual per day ${avgDay.toFixed(2)}` : '',
    enabled('spend') ? budgetLine(budget, monthSpend, today) : '',
    enabled('words') ? `WORDS: ${wordCounts.new ?? 0} not yet, ${wordCounts.learning ?? 0} learning, ${wordCounts.memorized ?? 0} memorized` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const part = hour < 12 ? 'morning briefing' : hour < 18 ? 'afternoon check-in' : 'evening recap (what got done, what is left, and what to prepare for tomorrow)'
  const text = await askText(
    'You are a warm, practical personal assistant inside a tracker app. ' +
      (inArabic(b)
        ? 'Write in simple Modern Standard Arabic, speaking to the user directly. Keep their own item names exactly as written. '
        : 'Write in simple English, second person ("you"). ') +
      'No headings, no lists, no greeting line. 2–4 short sentences, max 70 words. Use **bold** for the 1–3 most important items. ' +
      'Prioritise: overdue or important items, habits at risk today, unusual spending. Never invent data.',
    `Write a ${part} from this data:\n${data}`,
    true
  )
  return { text }
}

// deno-lint-ignore no-explicit-any
async function parse(db: any, b: Body) {
  const text = clip(b.text, 400)
  if (!text) throw new Error('Type or say something first.')
  const today = /^\d{4}-\d{2}-\d{2}$/.test(b.today ?? '') ? b.today! : isoDay(new Date())
  const { data: habits, error } = await db.from('habits').select('id, name, kind')
  if (error) throw new Error(error.message)
  // deno-lint-ignore no-explicit-any
  const habitList = habits.map((h: any, i: number) => `${i + 1}. ${h.name} (${h.kind === 'bad' ? 'bad' : 'good'})`).join('\n') || '(none)'

  const out = await askJson(
    'You turn a short note from the user of a personal tracker app into actions. The note may be in any language and may contain several things.',
    `Today is ${WEEK[new Date(today + 'T00:00:00Z').getUTCDay()]} ${today}.\n` +
      `The user's habits:\n${habitList}\n\n` +
      `Note: "${text}"\n\n` +
      'Action types:\n' +
      '- {"type":"task","title":"...","important":true|false}  — something to do with no specific date (or today)\n' +
      '- {"type":"plan","title":"...","date":"YYYY-MM-DD","time":"HH:MM"}  — something to do on a date and/or at a time (tomorrow, Friday, "at 3 40"…); time is optional, 24-hour\n' +
      '- {"type":"expense","amount":3.4,"note":"coffee","date":"YYYY-MM-DD"}  — money spent (date = today unless said)\n' +
      '- {"type":"word","word":"..."}  — a new English word or phrase to learn\n' +
      '- {"type":"habit","habit":<number from the habit list>,"count":1}  — the user did one of their listed habits (count = how many times)\n' +
      '- {"type":"note","text":"..."}  — a thought or information to remember\n' +
      'Times: "at 3 40", "3.40", "3:40pm" → "15:40"; a bare hour from 1 to 6 means afternoon unless "am"/"morning" is said; ' +
      'anything with a time is a "plan" (date = today if no day is said), and the time words are not part of the title. ' +
      'Rules: keep titles short and in the user\'s words; split several things into several actions; ' +
      'only use "habit" when it clearly matches a listed habit; if nothing fits, use "note".\n' +
      'Return JSON: {"actions":[...]}'
  )

  const ok = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today)
  // deno-lint-ignore no-explicit-any
  const actions = (Array.isArray(out.actions) ? out.actions : []).slice(0, 8).map((a: any) => {
    switch (a?.type) {
      case 'task':
        return clip(a.title, 200) ? { type: 'task', title: clip(a.title, 200), important: Boolean(a.important) } : null
      case 'plan': {
        const time = typeof a.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.time) ? a.time : null
        return clip(a.title, 200) ? { type: 'plan', title: clip(a.title, 200), date: ok(a.date), ...(time ? { time } : {}) } : null
      }
      case 'expense': {
        const amount = Math.round(Number(a.amount) * 100) / 100
        return amount > 0 && amount < 1e7 ? { type: 'expense', amount, note: clip(a.note, 120), date: ok(a.date) } : null
      }
      case 'word':
        return clip(a.word, 80) ? { type: 'word', word: clip(a.word, 80) } : null
      case 'habit': {
        const h = habits[Number(a.habit) - 1]
        const count = Math.max(1, Math.min(50, Math.round(Number(a.count) || 1)))
        return h ? { type: 'habit', habit_id: h.id, name: h.name, count } : null
      }
      case 'note':
        return clip(a.text, 2000) ? { type: 'note', text: clip(a.text, 2000) } : null
      default:
        return null
    }
  }).filter(Boolean)

  return { actions: actions.length ? actions : [{ type: 'note', text }] }
}

/* --------------------------- tasks / spending ---------------------------- */

// deno-lint-ignore no-explicit-any
async function analyse(db: any, b: Body) {
  const kind = b.kind === 'spending' ? 'spending' : b.kind === 'habits' ? 'habits' : b.kind === 'prayers' ? 'prayers' : 'tasks'
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
  } else if (kind === 'prayers') {
    const since = new Date(today)
    since.setDate(since.getDate() - 29)
    const sinceKey = since.toISOString().slice(0, 10)
    const { data: logs, error } = await db.from('prayer_logs').select('*').gte('day', sinceKey)
    if (error) throw new Error(error.message)
    const days: string[] = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      days.push(d.toISOString().slice(0, 10))
    }
    // deno-lint-ignore no-explicit-any
    const first = (logs as any[]).reduce((m, l) => (l.day < m ? l.day : m), today)
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    data =
      'MY 5 DAILY PRAYERS, last 30 days, oldest first, ending today' +
      ` (first day is a ${names[new Date(days[0] + 'T00:00:00Z').getUTCDay()]}). ` +
      'Y = prayed on time, L = prayed late (still in its time), Q = Qada (made up later, after its time), ' +
      'M = did not pray it, x = not marked, - = before I started tracking (' + first + '). ' +
      "Today's later prayers may not have come yet.\n" +
      ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
        .map((p) => {
          const marks = days.map((d) => {
            if (d < first) return '-'
            // deno-lint-ignore no-explicit-any
            const l = (logs as any[]).find((x) => x.day === d && x.prayer === p)
            const st = l?.status || (l?.late ? 'late' : 'ontime')
            return !l ? 'x' : st === 'missed' ? 'M' : st === 'qada' ? 'Q' : st === 'late' ? 'L' : 'Y'
          })
          return `${p[0].toUpperCase() + p.slice(1)}: ${marks.join('')}`
        })
        .join('\n')
  } else if (kind === 'habits') {
    const since = new Date(today)
    since.setDate(since.getDate() - 29)
    const sinceKey = since.toISOString().slice(0, 10)
    const [habits, logs] = await Promise.all([
      db.from('habits').select('*').order('created_at', { ascending: true }),
      db.from('habit_logs').select('*').gte('day', sinceKey),
    ])
    if (habits.error || logs.error) throw new Error((habits.error ?? logs.error).message)
    const days: string[] = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      days.push(d.toISOString().slice(0, 10))
    }
    data =
      'HABITS. "good" = want to do it at least TARGET times a day. "bad" = want to do it at most TARGET times a day (0 = avoid).\n' +
      `Daily counts are for the last 30 days, oldest first (first day is a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(days[0] + 'T00:00:00Z').getUTCDay()]}), ending today; ` +
      '"-" = before the habit was created, "S" = skipped day (sick/travel, not a failure). Days outside "planned days" are rest days.\n' +
      // deno-lint-ignore no-explicit-any
      (habits.data
        // deno-lint-ignore no-explicit-any
        .filter((h: any) => !b.habitKind || (b.habitKind === 'bad') === (h.kind === 'bad'))
        // deno-lint-ignore no-explicit-any
        .map((h: any) => {
        const kindOf = h.kind === 'bad' ? 'bad' : 'good'
        const start = String(h.created_at).slice(0, 10)
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const planned: number[] = Array.isArray(h.days) && h.days.length ? h.days : [0, 1, 2, 3, 4, 5, 6]
        const tally: Record<string, number> = {}
        let resisted = 0
        const counts = days.map((d) => {
          if (d < start) return '-'
          // deno-lint-ignore no-explicit-any
          const l = logs.data.find((x: any) => x.habit_id === h.id && x.day === d)
          ;(l?.reasons ?? []).forEach((r: string) => (tally[r] = (tally[r] ?? 0) + 1))
          resisted += l?.resisted ?? 0
          if (l?.skipped) return 'S'
          return String(l?.count ?? 0)
        })
        const extras = [
          planned.length < 7 ? `planned days: ${planned.map((n) => names[n]).join('/')}` : '',
          Object.keys(tally).length
            ? `triggers: ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`
            : '',
          resisted ? `urges resisted: ${resisted}` : '',
          Number(h.cost) > 0 ? `cost each time: ${h.cost}, per day before: ${h.baseline ?? 0}` : '',
        ].filter(Boolean)
        return `${h.name} | ${kindOf} | target ${h.target} | ${counts.join(',')}${extras.length ? ' | ' + extras.join(' | ') : ''}`
      }).join('\n') || '(none)')
  } else {
    const since = new Date(today)
    since.setDate(since.getDate() - 180)
    const [{ data: rows, error }, budget] = await Promise.all([
      db
        .from('expenses')
        .select('amount, note, spent_on')
        .gte('spent_on', since.toISOString().slice(0, 10))
        .order('spent_on', { ascending: false })
        .limit(1000),
      budgetOf(db),
    ])
    if (error) throw new Error(error.message)
    // deno-lint-ignore no-explicit-any
    const monthSpent = (rows ?? []).filter((r: any) => r.spent_on.slice(0, 7) === today.slice(0, 7)).reduce((a: number, r: any) => a + Number(r.amount), 0)
    const bl = budgetLine(budget, monthSpent, today)
    data =
      (bl ? bl + ' Say clearly whether I am on track for the budget and how much I can spend per day.\n\n' : '') +
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
    kind === 'prayers'
      ? 'Analyse my prayer commitment: overall consistency (prayed and on time), compare the last 7 days with the week before, ' +
        'which prayer is strongest and which is most often late, made up as Qada or not prayed (count Qada as prayed, but note it was after its time), my best and weakest days of the week, my current streak of full days. ' +
        'Then give 3 gentle, practical tips for the weakest prayer (for example sleep and alarm habits for Fajr, planning around work for Dhuhr and Asr). ' +
        'Be warm, respectful and encouraging, never judgmental.'
      : kind === 'habits'
      ? 'Analyse my habits: for each habit say if it is improving, steady or slipping (compare the last 7 days with the week before), current streaks, ' +
        'my best and worst days of the week, and give 3 concrete tips. For bad habits, fewer is better and clean days are wins; ' +
        'if triggers are given, name the main triggers and give a specific plan for each; mention urges resisted and money saved when available. Be encouraging.'
      : kind === 'tasks'
      ? 'Analyse my tasks: how I am doing, what is overdue or stuck in "doing", whether important tasks get done, patterns, and 3 concrete suggestions for tomorrow.'
      : 'Analyse my spending: totals this week and month vs earlier, biggest categories (group similar notes), unusual spends, trends, and 3 concrete money-saving suggestions.'

  const text = await askText(system + (inArabic(b) ? ARABIC : ''), `Today is ${today}.\n\n${data}\n\n${question ? `My question: ${question}` : task}`)
  return { text }
}

/* ------------------------------- review ---------------------------------- */

// A written review of a week / month / year / custom period, from the numbers the app already added up.
async function review(b: Body) {
  const x = b as { label?: string; from?: string; to?: string; summary?: string }
  const summary = clip(x.summary, 4000)
  if (!summary) throw new Error('Nothing to review yet.')
  const label = clip(x.label, 80) || 'this period'
  const text = await askText(
    'You are a warm, honest personal coach inside a tracker app. Write a short review of the user\'s period from the numbers given. ' +
      'Structure: "## Wins" (2–3 bullets), "## What slipped" (1–3 bullets), "## Next" (3 concrete, small things to try). ' +
      'Use the real numbers and names, compare with the previous period when it helps, **bold** the key numbers. ' +
      'Be kind and encouraging, never judgmental; for prayers be respectful. Max ~180 words. Never invent data; skip areas with no data.' +
      (inArabic(b) ? ARABIC : ''),
    `Period: ${label} (${x.from} to ${x.to}).\n\n${summary}`
  )
  return { text }
}

/* -------------------------------- sleep --------------------------------- */

// deno-lint-ignore no-explicit-any
async function sleep(db: any, b: Body) {
  const x = b as { label?: string; from?: string; to?: string; summary?: string; goal?: number; tz?: string; question?: string }
  const day = /^\d{4}-\d{2}-\d{2}$/
  if (!day.test(x.from ?? '') || !day.test(x.to ?? '')) throw new Error('Choose a period first.')
  let tz = 'Europe/London'
  try {
    if (x.tz) {
      new Intl.DateTimeFormat('en-GB', { timeZone: x.tz })
      tz = x.tz
    }
  } catch {
    /* keep London */
  }
  const goal = Number(x.goal) >= 4 && Number(x.goal) <= 12 ? Number(x.goal) : 8
  const [logs, fajr, tasks] = await Promise.all([
    db.from('sleep_logs').select('night, bed_at, wake_at, quality, note').gte('night', x.from).lte('night', x.to).order('night').limit(400),
    db.from('prayer_logs').select('*').eq('prayer', 'fajr').gte('day', x.from).lte('day', x.to),
    db.from('tasks').select('done_at').gte('done_at', x.from).lte('done_at', x.to + 'T23:59:59Z'),
  ])
  if (logs.error) throw new Error(/sleep_logs/.test(logs.error.message) ? 'Run supabase/migrations/017_sleep.sql in Supabase first.' : logs.error.message)
  // deno-lint-ignore no-explicit-any
  const rows = (logs.data ?? []).filter((r: any) => r.wake_at)
  if (!rows.length) throw new Error('No nights logged in this period yet.')

  const clock = (ts: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts))
  const localDay = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ts))
  const fajrOf = new Map<string, string>()
  // deno-lint-ignore no-explicit-any
  for (const l of fajr.data ?? []) fajrOf.set(l.day, (l as any).status || ((l as any).late ? 'late' : 'ontime'))
  const doneOf = new Map<string, number>()
  // deno-lint-ignore no-explicit-any
  for (const t of tasks.data ?? []) if ((t as any).done_at) doneOf.set(localDay((t as any).done_at), (doneOf.get(localDay((t as any).done_at)) ?? 0) + 1)
  const hm = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`

  // deno-lint-ignore no-explicit-any
  const lines = rows.map((r: any) => {
    const min = (Date.parse(r.wake_at) - Date.parse(r.bed_at)) / 60000
    const wd = WEEK[new Date(r.night + 'T00:00:00Z').getUTCDay()].slice(0, 3)
    return [
      `${r.night} ${wd}`,
      `bed ${clock(r.bed_at)}`,
      `wake ${clock(r.wake_at)}`,
      hm(min),
      r.quality ? `quality ${r.quality}/5` : '',
      fajrOf.has(r.night) ? `Fajr ${fajrOf.get(r.night)}` : 'Fajr not marked',
      `tasks done ${doneOf.get(r.night) ?? 0}`,
      r.note ? `note: ${clip(r.note, 80)}` : '',
    ]
      .filter(Boolean)
      .join(' | ')
  })
  // long periods: one line per week keeps the answer fast
  let nightsText = lines.join('\n')
  if (lines.length > 70) {
    const weeks = new Map<string, string[]>()
    // deno-lint-ignore no-explicit-any
    rows.forEach((r: any, i: number) => {
      const d = new Date(r.night + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
      const k = d.toISOString().slice(0, 10)
      weeks.set(k, [...(weeks.get(k) ?? []), lines[i]])
    })
    nightsText =
      'Too many nights to list; one line per week (week starting | nights | average sleep | average bed | average wake):\n' +
      [...weeks.entries()]
        .map(([k, ls]) => {
          const rs = ls.map((l) => l.split(' | '))
          const mins = rs.map((p) => {
            const [h, m] = p[3].split('h').map(Number)
            return h * 60 + m
          })
          const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
          const noon = (c: string) => {
            const [h, m] = c.slice(-5).split(':').map(Number)
            return (h * 60 + m + 720) % 1440
          }
          const back = (v: number) => {
            const z = Math.round(v + 720) % 1440
            return `${String(Math.floor(z / 60)).padStart(2, '0')}:${String(z % 60).padStart(2, '0')}`
          }
          return `${k} | ${ls.length} | ${hm(avg(mins))} | ${back(avg(rs.map((p) => noon(p[1]))))} | ${back(avg(rs.map((p) => noon(p[2]))))}`
        })
        .join('\n')
  }

  const question = clip(x.question, 400)
  const text = await askText(
    'You are a sleep coach inside a personal tracker app. You give a deep but easy-to-read analysis of the user\'s own sleep data. ' +
      'Use the real numbers and dates. Never invent data. Not medical advice: if something looks worrying (often under 5 hours, ' +
      'very irregular for weeks), gently suggest talking to a doctor. Be warm and practical, never judgmental. ' +
      (question
        ? 'Answer the user\'s question first and fully, using the data; then add one short tip. '
        : 'Structure, with "## " headings: ' +
          '"## Overview" (2–3 sentences: how much and how regularly they sleep vs their goal, compared with the period before). ' +
          '"## Patterns" (3–5 bullets: bedtime drift, weekday vs weekend shift (social jet lag), best and worst nights and what they had in common, ' +
          'which days of the week are hardest, trend over the period). ' +
          '"## Effects on your day" (2–3 bullets: link sleep with Fajr on time and tasks done the next day, only if the data shows it). ' +
          '"## Your best routine" (a suggested bedtime and wake-up time that fits their goal and Fajr, based on their own best nights). ' +
          '"## Try this week" (3 small, specific actions). ') +
      '**Bold** key numbers and times. Max ~350 words.' +
      (inArabic(b) ? ARABIC : ''),
    `Period: ${clip(x.label, 80) || 'this period'} (${x.from} to ${x.to}). Sleep goal: ${goal} hours. Time zone: ${tz}.\n\n` +
      `WORKED-OUT NUMBERS:\n${clip(x.summary, 3000) || '(none)'}\n\nNIGHTS (date of the morning | bedtime | wake-up | hours slept | quality | Fajr that morning | tasks done that day | note):\n${nightsText}` +
      (question ? `\n\nMy question: ${question}` : '')
  )
  return { text }
}

/* ------------------------------- promises -------------------------------- */

async function promises(b: Body) {
  const x = b as { label?: string; from?: string; to?: string; summary?: string; question?: string; today?: string }
  const summary = clip(x.summary, 6000)
  if (!summary) throw new Error('Add a promise first.')
  const question = clip(x.question, 400)
  const text = await askText(
    'You are a warm, wise coach inside a personal tracker app. The user makes promises to themselves ' +
      '("not to smoke", "no coffee", "read every day"). Analyse their own data and help them keep the promises. ' +
      'Use the real numbers, dates and their own notes. Never invent data. Never shame them for breaking a promise; ' +
      'a slip is information, not failure. If a promise is about quitting smoking, alcohol or drugs, you may mention once that ' +
      'free support services exist (for example the NHS in the UK) — no medical advice. ' +
      (question
        ? 'Answer the user\'s question first and fully from the data, then add one short practical tip. '
        : 'Structure, with "## " headings: "## Where you stand" (one bullet per promise: streak, days kept, progress to goal, money saved if any). ' +
          '"## Patterns" (2–4 bullets: which weekdays or situations they break it, what their notes say about triggers, whether it is getting better over time). ' +
          '"## Next milestone" (the nearest milestone per promise and what reaching it would mean). ' +
          '"## Plan" (3 specific, small actions for the hardest promise, based on its triggers and their own reason). ') +
      '**Bold** key numbers. Max ~300 words.' +
      (inArabic(b) ? ARABIC : ''),
    `Today is ${clip(x.today, 10) || 'today'}. Period: ${clip(x.label, 80) || 'all time'}${x.from ? ` (${clip(x.from, 10)} to ${clip(x.to, 10)})` : ''}.\n\n${summary}` +
      (question ? `\n\nMy question: ${question}` : '')
  )
  return { text }
}

/* -------------------------------- faith ---------------------------------- */

const FAITH_NAMES: Record<string, string> = { christian: 'Christian', jewish: 'Jewish', hindu: 'Hindu', custom: 'personal', islam: 'Islamic' }

async function faith(b: Body) {
  const x = b as { label?: string; from?: string; to?: string; summary?: string; faith?: string; today?: string }
  const summary = clip(x.summary, 5000)
  if (!summary) throw new Error('Add a practice first.')
  const name = FAITH_NAMES[x.faith ?? ''] ?? 'personal'
  const text = await askText(
    `You are a warm, respectful coach inside a personal tracker app. The user keeps daily ${name} spiritual practices ` +
      '(prayer, reading, meditation, fasting…) and wants help being consistent. Analyse only their own data. ' +
      'Never give religious rulings, doctrine, or tell them what their faith requires; never compare faiths; do not quote scripture. ' +
      'Speak about routine, timing and consistency, with gentle encouragement, never guilt. Use the real numbers. ' +
      'Structure, with "## " headings: "## How it’s going" (one bullet per practice: kept X of Y planned days, streak), ' +
      '"## Patterns" (which days or practices slip, anything improving), "## A simple routine" (3 small, practical suggestions about time, place or reminders). ' +
      '**Bold** key numbers. Max ~220 words.' +
      (inArabic(b) ? ARABIC : ''),
    `Today is ${clip(x.today, 10) || 'today'}. Period: ${clip(x.label, 80) || 'this period'} (${clip(x.from, 10)} to ${clip(x.to, 10)}).\n\n${summary}`
  )
  return { text }
}

/* --------------------------------- gym ----------------------------------- */

async function gym(b: Body) {
  const x = b as { label?: string; from?: string; to?: string; summary?: string; today?: string }
  const summary = clip(x.summary, 7000)
  if (!summary) throw new Error('Finish a workout first.')
  const text = await askText(
    'You are a friendly, knowledgeable strength coach inside a personal tracker app. Analyse only the user\'s own training log. ' +
      'Use the real exercises, weights, reps and dates. Never invent data. Not medical advice: if they mention pain or an injury, ' +
      'tell them to stop that exercise and see a professional. Recommend safe, gradual progression (about 2.5–5% or 1–2 reps). ' +
      'Structure, with "## " headings: "## How you’re doing" (consistency vs plan, workouts, total volume), ' +
      '"## Getting stronger" (2–4 bullets: exercises that improved, by how much; any that stalled), ' +
      '"## Next workouts" (specific targets for 3–4 main exercises, e.g. "Squat: 3×8 at 62.5 kg"), ' +
      '"## Tips" (2–3 short tips about recovery, form or schedule based on the data). **Bold** key numbers. Max ~250 words.' +
      (inArabic(b) ? ARABIC + ' Keep exercise names in English.' : ''),
    `Today is ${clip(x.today, 10) || 'today'}. Period: ${clip(x.label, 80) || 'this period'} (${clip(x.from, 10)} to ${clip(x.to, 10)}).\n\n${summary}`
  )
  return { text }
}

/* ------------------------------ language -------------------------------- */

// The app sends uiLang: 'ar' when its interface is in Arabic; answers then come back in Arabic.
const inArabic = (b: Body) => (b as { uiLang?: string }).uiLang === 'ar'
const ARABIC =
  ' Write the whole answer in clear, simple Modern Standard Arabic. Keep the user\'s own item names, numbers and currency exactly as in the data. ' +
  'Keep the same format ("## " headings, "- " bullets, **bold**).'

/* ------------------------------ AI models -------------------------------- */

// fast = word features (translate, explain, practice, check): use Google's quick "lite" model first.
async function askText(system: string, prompt: string, fast = false) {
  return await askModel(system, prompt, false, fast)
}

// deno-lint-ignore no-explicit-any
async function askJson(system: string, prompt: string, fast = true): Promise<any> {
  const raw = await askModel(system + ' Reply with ONLY valid JSON, no extra text.', prompt, true, fast)
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = cleaned.search(/[[{]/)
  try {
    return JSON.parse(start > 0 ? cleaned.slice(start) : cleaned)
  } catch {
    throw new Error('The AI gave an unexpected answer. Please try again.')
  }
}

async function askModel(system: string, prompt: string, wantJson: boolean, fast = false): Promise<string> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')

  if (anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5',
        max_tokens: 1536,
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
    const main = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'
    const lite = Deno.env.get('GEMINI_FAST_MODEL') || 'gemini-flash-lite-latest'
    const models = (fast ? [lite, main, 'gemini-2.5-flash'] : [main, lite, 'gemini-2.5-flash']).filter(
      (m, i, all) => all.indexOf(m) === i
    )
    // Speed: these models "think" before answering by default (medium/high), which adds seconds and isn't needed
    // for short summaries. Ask for low thinking; if a model doesn't accept that setting, we retry without it.
    const payloadFor = (thinking: boolean) =>
      JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: wantJson ? 3072 : 1536, // room for Arabic, which takes more tokens
          ...(wantJson ? { responseMimeType: 'application/json' } : {}),
          ...(thinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      })
    let lowThinking = Deno.env.get('GEMINI_THINKING') !== 'default'
    let lastError = 'The AI is busy right now. Please try again in a minute.'
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let res: Response
        try {
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'x-goog-api-key': geminiKey, 'content-type': 'application/json' },
            body: payloadFor(lowThinking),
            signal: AbortSignal.timeout(fast ? 20000 : 40000), // don't wait forever on a stuck model
          })
        } catch {
          lastError = 'The AI took too long to answer.'
          break // try the next model
        }
        const out = await res.json().catch(() => ({}))
        if (res.ok) {
          const text = out.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
          if (text) return text
          lastError = 'The AI returned an empty answer. Please try again.'
          break
        }
        lastError = out?.error?.message ?? `AI error ${res.status}`
        if (res.status === 400 && lowThinking && /think/i.test(lastError)) {
          lowThinking = false // this model doesn't take the thinking setting: same model, without it
          attempt--
          continue
        }
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
