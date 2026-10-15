import { supabase } from './supabase'
import { callAi } from './ai'
import { dayLabel, money, today } from './dates'

/**
 * Carries out the actions the AI found in a quick-add note.
 * Returns one result per action: { label, ok, undo() }.
 */
export async function runActions(actions, { lang = 'Arabic' } = {}) {
  const results = []
  for (const a of actions) {
    try {
      results.push(await run(a, lang))
    } catch (e) {
      results.push({ label: `Couldn’t add: ${e.message}`, ok: false })
    }
  }
  return results
}

const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

async function run(a, lang) {
  switch (a.type) {
    case 'task': {
      const row = must(await supabase.from('tasks').insert({ title: a.title, priority: a.important ? 'important' : 'normal' }).select().single())
      return { label: `Task${a.important ? ' (important)' : ''}: ${a.title}`, ok: true, undo: () => supabase.from('tasks').delete().eq('id', row.id) }
    }
    case 'plan': {
      const date = a.date || today()
      const extra = { ...(a.important ? { important: true } : {}), ...(a.time && a.remind_before ? { remind_before: a.remind_before } : {}) }
      let res = await supabase.from('plans').insert({ title: a.title, plan_date: date, ...(a.time ? { plan_time: a.time } : {}), ...extra }).select().single()
      // database not updated yet: drop the new fields, keep the time in the title
      if (res.error && /plan_time|important|remind_before|column/.test(res.error.message))
        res = await supabase.from('plans').insert({ title: a.time ? `${a.title} · ${a.time}` : a.title, plan_date: date }).select().single()
      const row = must(res)
      return {
        label: `Plan · ${dayLabel(date)}${a.time ? ` ${a.time}` : ''}: ${a.title}`,
        ok: true,
        undo: () => supabase.from('plans').delete().eq('id', row.id),
      }
    }
    case 'expense': {
      const row = must(await supabase.from('expenses').insert({ amount: a.amount, note: a.note || '', spent_on: a.date || today() }).select().single())
      return {
        label: `Spent ${money(a.amount)}${a.note ? ` · ${a.note}` : ''}${a.date && a.date !== today() ? ` · ${dayLabel(a.date)}` : ''}`,
        ok: true,
        undo: () => supabase.from('expenses').delete().eq('id', row.id),
      }
    }
    case 'word': {
      const row = must(await supabase.from('words').insert({ word: a.word, translation: '', status: 'new' }).select().single())
      // translate in the background, like the Words page
      callAi({ kind: 'translate', word: a.word, lang })
        .then((r) => r?.translation && supabase.from('words').update({ translation: r.translation }).eq('id', row.id))
        .catch(() => {})
      return { label: `New word: ${a.word}`, ok: true, undo: () => supabase.from('words').delete().eq('id', row.id) }
    }
    case 'habit': {
      const day = today()
      const cur = must(await supabase.from('habit_logs').select('count').eq('habit_id', a.habit_id).eq('day', day).maybeSingle())
      const before = cur?.count || 0
      must(await supabase.from('habit_logs').upsert({ habit_id: a.habit_id, day, count: before + a.count }, { onConflict: 'habit_id,day' }))
      return {
        label: `Habit: ${a.name} +${a.count}`,
        ok: true,
        undo: () => supabase.from('habit_logs').upsert({ habit_id: a.habit_id, day, count: before }, { onConflict: 'habit_id,day' }),
      }
    }
    case 'note': {
      let book = must(await supabase.from('notebooks').select('id').eq('name', 'Quick notes').limit(1).maybeSingle())
      if (!book) book = must(await supabase.from('notebooks').insert({ name: 'Quick notes' }).select().single())
      const row = must(await supabase.from('notes').insert({ notebook_id: book.id, title: '', body: a.text }).select().single())
      return { label: `Note: ${a.text.length > 60 ? a.text.slice(0, 60) + '…' : a.text}`, ok: true, undo: () => supabase.from('notes').delete().eq('id', row.id) }
    }
    default:
      return { label: 'Not sure what to do with that', ok: false }
  }
}


/* ------------------------------------------------------------------------------------------------
 * Built-in guesser: understands simple notes without the AI (used when the AI isn't available).
 * "buy milk tomorrow at 3 40" → plan, tomorrow, 15:40 · "coffee 3.40" → spend £3.40 · "new word brave" → word
 * ---------------------------------------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0')
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function takeTime(s) {
  const pick = (re, ampmIdx) => {
    const m = re.exec(s)
    if (!m) return null
    let h = Number(m[1])
    const min = m[2] ? Number(m[2]) : 0
    const ap = ampmIdx ? (m[ampmIdx] || '').toLowerCase() : ''
    if (h > 23 || min > 59) return null
    if (ap.startsWith('p') && h < 12) h += 12
    else if (ap.startsWith('a') && h === 12) h = 0
    else if (!ap && h >= 1 && h <= 6) h += 12 // "at 3 40" usually means the afternoon
    return { time: `${pad(h)}:${pad(min)}`, rest: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim() }
  }
  return (
    pick(/\b(?:at\s+)?(\d{1,2})(?:[:.\s](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i, 3) ||
    pick(/\bat\s+(\d{1,2})(?:[:.\s]([0-5]\d))?\b/i, 0) ||
    pick(/\b([01]?\d|2[0-3]):([0-5]\d)\b/, 0) || { time: null, rest: s }
  )
}

function takeDate(s) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let m
  if ((m = /\b(today|tonight|this (?:morning|afternoon|evening))\b/i.exec(s))) return { date: ymdOf(base), rest: s.replace(m[0], ' ') }
  if ((m = /\b(?:the day after tomorrow)\b/i.exec(s))) return { date: ymdOf(new Date(base.getTime() + 2 * 864e5)), rest: s.replace(m[0], ' ') }
  if ((m = /\byesterday\b/i.exec(s))) return { date: ymdOf(new Date(base.getTime() - 864e5)), rest: s.replace(m[0], ' ') }
  if ((m = /\btomorrow\b/i.exec(s))) return { date: ymdOf(new Date(base.getTime() + 864e5)), rest: s.replace(m[0], ' ') }
  if ((m = /\bin (\d{1,2}) days?\b/i.exec(s))) return { date: ymdOf(new Date(base.getTime() + Number(m[1]) * 864e5)), rest: s.replace(m[0], ' ') }
  if ((m = /\bnext week\b/i.exec(s))) return { date: ymdOf(new Date(base.getTime() + 7 * 864e5)), rest: s.replace(m[0], ' ') }
  if ((m = /\b(?:on |next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(s))) {
    let diff = (WEEKDAYS.indexOf(m[1].toLowerCase()) - base.getDay() + 7) % 7
    if (diff === 0) diff = 7
    return { date: ymdOf(new Date(base.getTime() + diff * 864e5)), rest: s.replace(m[0], ' ') }
  }
  return { date: null, rest: s }
}

const tidy = (s) =>
  s
    .replace(/\b(on|at|by|for)\s*$/i, '')
    .replace(/^\s*(on|at|by)\b/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')

/** One note → one draft { type, title, date, time, amount, important, habit_id, count }. */
export function guessOne(raw, habits = []) {
  let s = raw.trim()
  if (!s) return null
  let m
  if ((m = /^(?:new\s+)?word[:\s]+(.+)$/i.exec(s))) return { type: 'word', title: tidy(m[1]) }
  if ((m = /^note[:\s]+(.+)$/i.exec(s))) return { type: 'note', title: m[1].trim() }
  const important = /\b(important|urgent|asap)\b/i.test(s)
  s = s.replace(/\b(important|urgent|asap)\b/gi, ' ')

  // money: £3.40, 3.40, 12 pounds, $5
  const money = /(?:[£$€]\s?(\d+(?:[.,]\d{1,2})?))|(?:\b(\d+[.,]\d{2})\b)|(?:\b(\d+(?:[.,]\d{1,2})?)\s?(?:pounds?|quid|gbp|euros?|dollars?)\b)/i.exec(s)
  const timeFirst = takeTime(s)
  if (money && !(timeFirst.time && /\bat\s+\d/i.test(s) && !/[£$€]|pound|quid/i.test(s))) {
    const amount = Number((money[1] || money[2] || money[3]).replace(',', '.'))
    const rest = s.replace(money[0], ' ')
    const d = takeDate(rest)
    const note = tidy(d.rest.replace(/\b(spent|paid|pay|cost|for|on)\b/gi, ' '))
    return { type: 'expense', amount, title: note, date: d.date || ymdOf(new Date()) }
  }

  const h = habits.find((x) => x.name && s.toLowerCase().includes(x.name.toLowerCase()))
  if (h) return { type: 'habit', habit_id: h.id, title: h.name, count: 1 }

  const t = takeTime(s)
  const d = takeDate(t.rest)
  const title = tidy(d.rest)
  if (t.time || d.date) return { type: 'plan', title, date: d.date || ymdOf(new Date()), time: t.time, important }
  return { type: 'task', title: title || raw.trim(), important }
}

/** A note with several things ("buy milk tomorrow, coffee 3.40") → several drafts. */
export function guessLocal(text, habits = []) {
  return text
    .split(/\s*(?:[,;\n]|\band then\b|\balso\b)\s*/i)
    .map((p) => guessOne(p, habits))
    .filter((d) => d && (d.title || d.amount))
}

/** AI action → editable draft (same shape as guessOne). */
export function draftFromAction(a) {
  switch (a.type) {
    case 'task':
      return { type: 'task', title: a.title, important: !!a.important }
    case 'plan':
      return { type: 'plan', title: a.title, date: a.date, time: a.time || null }
    case 'expense':
      return { type: 'expense', title: a.note || '', amount: a.amount, date: a.date }
    case 'word':
      return { type: 'word', title: a.word }
    case 'habit':
      return { type: 'habit', title: a.name, habit_id: a.habit_id, count: a.count || 1 }
    default:
      return { type: 'note', title: a.text || '' }
  }
}

/** Editable draft → action for runActions. */
export function actionFromDraft(d) {
  const title = (d.title || '').trim()
  switch (d.type) {
    case 'task':
      return title && { type: 'task', title, important: !!d.important }
    case 'plan':
      return title && { type: 'plan', title, date: d.date || today(), time: d.time || null, important: !!d.important, remind_before: Number(d.remind_before) || 0 }
    case 'expense': {
      const amount = Math.round(Number(String(d.amount).replace(',', '.')) * 100) / 100
      return amount > 0 && { type: 'expense', amount, note: title, date: d.date || today() }
    }
    case 'word':
      return title && { type: 'word', word: title }
    case 'habit':
      return d.habit_id && { type: 'habit', habit_id: d.habit_id, name: d.habitName || title, count: Math.max(1, Number(d.count) || 1) }
    default:
      return title && { type: 'note', text: title }
  }
}
