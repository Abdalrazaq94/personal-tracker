/**
 * Review: all the numbers for a week, month, year or your own range, and the same length of time just before
 * (used by pages/Review.jsx). Dates are "YYYY-MM-DD" strings in your own time zone.
 */

import { statusOf } from './prayerStatus'

const DAY = 864e5
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymdOf(d)
}
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY) + 1
const dayOfTs = (ts) => (ts ? ymdOf(new Date(ts)) : null)
const within = (day, from, to) => !!day && day >= from && day <= to

/** This week / month / year (offset 0), or earlier ones (offset -1, -2…). Weeks run Monday to Sunday. */
export function periodFor(kind, offset = 0) {
  const now = new Date()
  if (kind === 'year') {
    const y = now.getFullYear() + offset
    return { kind, from: `${y}-01-01`, to: `${y}-12-31` }
  }
  if (kind === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return { kind, from: ymdOf(first), to: ymdOf(new Date(first.getFullYear(), first.getMonth() + 1, 0)) }
  }
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offset * 7)
  return { kind: 'week', from: ymdOf(monday), to: addDays(ymdOf(monday), 6) }
}

/** The last n weeks or months, ending today (for "Last 2 months" and friends). */
export function lastN(n, unit) {
  const now = new Date()
  const to = ymdOf(now)
  const start = unit === 'week' ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - n * 7 + 1) : new Date(now.getFullYear(), now.getMonth() - n, now.getDate() + 1)
  return { kind: 'custom', from: ymdOf(start), to }
}

/** The period just before: the week / month / year before, or the same number of days before a custom range. */
export function previousOf(p) {
  if (p.kind === 'week') return { kind: 'week', from: addDays(p.from, -7), to: addDays(p.to, -7) }
  if (p.kind === 'month') {
    const f = parse(p.from)
    const first = new Date(f.getFullYear(), f.getMonth() - 1, 1)
    return { kind: 'month', from: ymdOf(first), to: ymdOf(new Date(first.getFullYear(), first.getMonth() + 1, 0)) }
  }
  if (p.kind === 'year') {
    const y = Number(p.from.slice(0, 4)) - 1
    return { kind: 'year', from: `${y}-01-01`, to: `${y}-12-31` }
  }
  const n = daysBetween(p.from, p.to)
  return { kind: 'custom', from: addDays(p.from, -n), to: addDays(p.from, -1) }
}

/** Change as a fraction (0.12 = 12% more). null when there is nothing to compare with. */
export function change(now, before) {
  if (now == null || before == null) return null
  if (before === 0) return now === 0 ? 0 : null
  return (now - before) / Math.abs(before)
}

/**
 * All the numbers for one period. Only days up to today count (the rest of this week hasn't happened yet).
 * data = { tasks, plans, habits, habitLogs, prayerLogs, firstPrayerDay, expenses, words, notes, links }
 */
export function statsFor(data, p, today) {
  const to = p.to < today ? p.to : today
  const days = to < p.from ? 0 : daysBetween(p.from, to)

  // ---- tasks & plans
  const doneTasks = data.tasks.filter((t) => t.done_at && within(dayOfTs(t.done_at), p.from, to))
  const tasks = {
    done: doneTasks.length,
    importantDone: doneTasks.filter((t) => t.priority === 'important').length,
    added: data.tasks.filter((t) => within(dayOfTs(t.created_at), p.from, to)).length,
  }
  const plansIn = data.plans.filter((x) => within(x.plan_date, p.from, to))
  const plans = { total: plansIn.length, done: plansIn.filter((x) => x.done).length }

  // ---- habits
  const logOf = new Map(data.habitLogs.map((l) => [`${l.habit_id}|${l.day}`, l]))
  const good = []
  const bad = []
  let saved = 0
  for (const h of data.habits) {
    const created = dayOfTs(h.created_at) || p.from
    const start = created > p.from ? created : p.from
    if (start > to) continue
    const planDays = Array.isArray(h.days) && h.days.length ? h.days : [0, 1, 2, 3, 4, 5, 6]
    let plannedDays = 0
    let ok = 0
    let total = 0
    let resisted = 0
    for (let d = start; d <= to; d = addDays(d, 1)) {
      const l = logOf.get(`${h.id}|${d}`)
      const c = l?.count || 0
      if (l?.skipped) continue
      if (h.kind === 'bad') {
        plannedDays++
        total += c
        resisted += l?.resisted || 0
        if (c <= h.target) ok++
        if (Number(h.cost) > 0 && Number(h.baseline) > 0) saved += Math.max(0, Number(h.baseline) - c) * Number(h.cost)
      } else if (planDays.includes(parse(d).getDay())) {
        plannedDays++
        if (c >= h.target) ok++
      }
    }
    if (!plannedDays) continue
    const row = { id: h.id, name: h.name, good: ok, plannedDays, rate: ok / plannedDays }
    if (h.kind === 'bad') bad.push({ ...row, total, resisted })
    else good.push(row)
  }
  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0)
  const habits = {
    good: good.sort((a, b) => b.rate - a.rate),
    bad: bad.sort((a, b) => a.rate - b.rate),
    goodRate: good.length ? sum(good, 'good') / sum(good, 'plannedDays') : null,
    cleanRate: bad.length ? sum(bad, 'good') / sum(bad, 'plannedDays') : null,
    slips: sum(bad, 'total'),
    saved,
  }

  // ---- prayers (only from the first day you marked one)
  const first = data.firstPrayerDay
  const pFrom = first && first > p.from ? first : p.from
  const pDays = first && pFrom <= to ? daysBetween(pFrom, to) : 0
  const logs = data.prayerLogs.filter((l) => within(l.day, pFrom, to))
  // on time / late / Qada (made up after its time) / missed (didn't pray). "prayed" = the first three.
  const count = (list) => {
    const c = { prayed: 0, onTime: 0, late: 0, qada: 0, missed: 0 }
    for (const l of list) {
      const st = statusOf(l)
      if (st === 'missed') c.missed++
      else {
        c.prayed++
        if (st === 'ontime') c.onTime++
        else if (st === 'late') c.late++
        else c.qada++
      }
    }
    return c
  }
  const perPrayer = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((key) => ({ key, ...count(logs.filter((l) => l.prayer === key)), possible: pDays }))
  const prayers = { ...count(logs), possible: pDays * 5, perPrayer }

  // ---- spending
  const spend = data.expenses.filter((x) => within(x.spent_on, p.from, to))
  const total = spend.reduce((a, x) => a + Number(x.amount), 0)
  const groups = new Map()
  for (const x of spend) {
    const name = (x.note || '').trim()
    const key = name.toLowerCase() || '—'
    const g = groups.get(key) || { name: name || '—', amount: 0, n: 0 }
    g.amount += Number(x.amount)
    g.n++
    groups.set(key, g)
  }
  const big = spend.reduce((m, x) => (!m || Number(x.amount) > Number(m.amount) ? x : m), null)
  const spending = {
    total,
    count: spend.length,
    perDay: days ? total / days : 0,
    top: [...groups.values()].sort((a, b) => b.amount - a.amount).slice(0, 6),
    biggest: big ? { name: (big.note || '').trim() || '—', amount: Number(big.amount), day: big.spent_on } : null,
  }

  return {
    days,
    tasks,
    plans,
    habits,
    prayers,
    spending,
    words: { added: data.words.filter((w) => within(dayOfTs(w.created_at), p.from, to)).length },
    notes: data.notes.filter((x) => within(dayOfTs(x.created_at), p.from, to)).length,
    links: data.links.filter((x) => within(dayOfTs(x.created_at), p.from, to)).length,
  }
}

/**
 * The period split into bars: days (up to a month), weeks (up to ~4 months) or months (longer).
 * key = the bucket's first day ("YYYY-MM-DD"), or "YYYY-MM" for months.
 */
export function trend(data, p, today) {
  const to = p.to < today ? p.to : today
  if (to < p.from) return { unit: 'day', buckets: [] }
  const n = daysBetween(p.from, p.to)
  const unit = n <= 31 ? 'day' : n <= 124 ? 'week' : 'month'
  const ranges = []
  if (unit === 'day') for (let d = p.from; d <= to; d = addDays(d, 1)) ranges.push({ key: d, from: d, to: d })
  else if (unit === 'week')
    for (let d = p.from; d <= to; d = addDays(d, 7)) ranges.push({ key: d, from: d, to: addDays(d, 6) < to ? addDays(d, 6) : to })
  else {
    let d = parse(p.from)
    d = new Date(d.getFullYear(), d.getMonth(), 1)
    while (ymdOf(d) <= to) {
      const end = ymdOf(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      ranges.push({ key: ymdOf(d).slice(0, 7), from: ymdOf(d) < p.from ? p.from : ymdOf(d), to: end < to ? end : to })
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }
  }
  const buckets = ranges.map((r) => ({
    key: r.key,
    spend: data.expenses.filter((x) => within(x.spent_on, r.from, r.to)).reduce((a, x) => a + Number(x.amount), 0),
    tasks: data.tasks.filter((t) => t.done_at && within(dayOfTs(t.done_at), r.from, r.to)).length,
    prayed: data.prayerLogs.filter((l) => within(l.day, r.from, r.to) && statusOf(l) !== 'missed').length,
  }))
  return { unit, buckets }
}
