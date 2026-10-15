import { supabase } from './supabase'
import { T } from './i18n'

/**
 * Sleep (needs supabase/migrations/017_sleep.sql).
 * One row per night: bed_at, wake_at (empty while asleep), quality 1–5, note.
 * "night" is the date of the morning you woke up, so Tue→Wed is Wednesday.
 */
export const NEEDS_SLEEP_SQL = 'Sleep needs a small database update: run supabase/migrations/017_sleep.sql in Supabase → SQL Editor, then refresh.'
export const sleepTableMissing = (e) => /sleep_logs|sleep_goal|relation .* does not exist|schema cache/i.test(e?.message || e || '')

const pad = (n) => String(n).padStart(2, '0')
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymdOf(d)
}

/** Which night a bedtime belongs to: going to bed after midday counts for the next morning. */
export function nightOf(bed) {
  const d = new Date(bed)
  return ymdOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + (d.getHours() >= 12 ? 1 : 0)))
}

/** From "the morning of" + two clock times → real dates. Bedtime after midday = the evening before. */
export function timesFromClock(night, bedHHMM, wakeHHMM) {
  const [bh, bm] = bedHHMM.split(':').map(Number)
  const [wh, wm] = wakeHHMM.split(':').map(Number)
  const morning = parse(night)
  const bed = new Date(morning.getFullYear(), morning.getMonth(), morning.getDate() - (bh >= 12 ? 1 : 0), bh, bm)
  let wake = new Date(morning.getFullYear(), morning.getMonth(), morning.getDate(), wh, wm)
  // woke after midday, e.g. a night shift: still the same morning's date
  if (wake <= bed) wake = new Date(wake.getTime() + 864e5)
  return { bed_at: bed.toISOString(), wake_at: wake.toISOString() }
}

export const clockOf = (ts) => {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const minutesSlept = (row) => (row?.wake_at ? Math.round((Date.parse(row.wake_at) - Date.parse(row.bed_at)) / 60000) : null)

/** 450 → "7h 30m" */
export function hoursText(min) {
  if (min == null || Number.isNaN(min)) return '—'
  const m = Math.round(min)
  const h = Math.floor(Math.abs(m) / 60)
  const r = Math.abs(m) % 60
  const s = h ? (r ? T('{0}h {1}m', [h, r]) : T('{0}h', [h])) : T('{0}m', [r])
  return m < 0 ? `−${s}` : s
}

/**
 * Times of day as minutes on a line that starts at midday, so 23:30 and 00:30 are 60 minutes apart
 * (not 23 hours). 12:00 → 0 … 00:00 → 720 … 11:59 → 1439.
 */
export const fromNoon = (ts) => {
  const d = new Date(ts)
  return (d.getHours() * 60 + d.getMinutes() + 720) % 1440
}
/** Back from minutes-since-midday to "23:40". */
export const clockFromNoon = (m) => {
  if (m == null) return '—'
  const x = ((Math.round(m) + 720) % 1440 + 1440) % 1440
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const sd = (a) => {
  if (a.length < 2) return null
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}
const isWeekend = (night) => [0, 6].includes(parse(night).getDay()) // Saturday and Sunday mornings

/** Sleep goal in hours (user_settings.sleep_goal, default 8). */
export async function loadSleepGoal() {
  const { data, error } = await supabase.from('user_settings').select('sleep_goal').maybeSingle()
  return !error && Number(data?.sleep_goal) > 0 ? Number(data.sleep_goal) : 8
}
export async function saveSleepGoal(hours) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('user_settings').upsert({ user_id: u.user.id, sleep_goal: hours, updated_at: new Date().toISOString() })
  if (error) throw new Error(sleepTableMissing(error) ? T(NEEDS_SLEEP_SQL) : error.message)
}

/**
 * Everything for one period. rows = sleep_logs, extra = { fajr: Map(day → status), tasksDone: Map(day → n) }.
 * Only finished nights (with a wake-up time) count.
 */
export function sleepStats(rows, p, goalH = 8, extra = {}) {
  const nights = rows
    .filter((r) => r.wake_at && r.night >= p.from && r.night <= p.to)
    .map((r) => ({ ...r, min: minutesSlept(r), bed: fromNoon(r.bed_at), wake: fromNoon(r.wake_at) }))
    .sort((a, b) => (a.night < b.night ? -1 : 1))
  const goal = goalH * 60
  if (!nights.length) return { count: 0, nights, goal }

  const mins = nights.map((n) => n.min)
  const bedSd = sd(nights.map((n) => n.bed))
  const wakeSd = sd(nights.map((n) => n.wake))
  // consistency 0–100: 15 min spread ≈ 78, 30 min ≈ 61, 1 hour ≈ 37
  const spread = bedSd == null ? null : (bedSd + wakeSd) / 2
  const consistency = spread == null ? null : Math.round(100 * Math.exp(-spread / 60))

  const weekend = nights.filter((n) => isWeekend(n.night))
  const weekday = nights.filter((n) => !isWeekend(n.night))
  const mid = (list) => mean(list.map((n) => n.bed + n.min / 2)) // middle of the night
  const jetLag = weekend.length && weekday.length ? mid(weekend) - mid(weekday) : null

  const rated = nights.filter((n) => n.quality)
  const longest = nights.reduce((a, n) => (n.min > a.min ? n : a))
  const shortest = nights.reduce((a, n) => (n.min < a.min ? n : a))

  // links with the rest of your day
  let fajr = null
  if (extra.fajr && extra.fajr.size) {
    const on = nights.filter((n) => extra.fajr.get(n.night) === 'ontime')
    const off = nights.filter((n) => extra.fajr.has(n.night) && extra.fajr.get(n.night) !== 'ontime')
    if (on.length && off.length) fajr = { onBed: mean(on.map((n) => n.bed)), offBed: mean(off.map((n) => n.bed)), onMin: mean(on.map((n) => n.min)), offMin: mean(off.map((n) => n.min)), on: on.length, off: off.length }
  }
  let tasks = null
  if (extra.tasksDone) {
    const good = nights.filter((n) => n.min >= goal - 30)
    const short = nights.filter((n) => n.min < goal - 30)
    if (good.length && short.length) tasks = { good: mean(good.map((n) => extra.tasksDone.get(n.night) || 0)), short: mean(short.map((n) => extra.tasksDone.get(n.night) || 0)), goodN: good.length, shortN: short.length }
  }

  return {
    count: nights.length,
    nights,
    goal,
    avgMin: mean(mins),
    avgBed: mean(nights.map((n) => n.bed)),
    avgWake: mean(nights.map((n) => n.wake)),
    bedSd,
    wakeSd,
    consistency,
    metGoal: nights.filter((n) => n.min >= goal - 15).length,
    debt: nights.reduce((s, n) => s + Math.max(0, goal - n.min), 0), // minutes short of the goal, added up
    weekendWake: weekend.length ? mean(weekend.map((n) => n.wake)) : null,
    weekdayWake: weekday.length ? mean(weekday.map((n) => n.wake)) : null,
    jetLag,
    quality: rated.length ? mean(rated.map((n) => n.quality)) : null,
    longest,
    shortest,
    fajr,
    tasks,
  }
}

/** Plain-English summary the AI reads (numbers already worked out, so it can focus on meaning). */
export function sleepSummary(s, before, goalH) {
  if (!s.count) return 'No nights logged in this period.'
  const lines = [
    `Goal: ${goalH} hours a night.`,
    `Nights logged: ${s.count}. Average sleep ${hoursText(s.avgMin)}; met the goal on ${s.metGoal} nights; total short of the goal ${hoursText(s.debt)}.`,
    `Average bedtime ${clockFromNoon(s.avgBed)} (spread ±${Math.round(s.bedSd ?? 0)} min), average wake-up ${clockFromNoon(s.avgWake)} (spread ±${Math.round(s.wakeSd ?? 0)} min), consistency score ${s.consistency ?? '—'}/100.`,
  ]
  if (s.jetLag != null) lines.push(`Weekend vs weekday: wake-up ${clockFromNoon(s.weekendWake)} vs ${clockFromNoon(s.weekdayWake)}; the middle of the night shifts by ${Math.round(s.jetLag)} min at weekends (social jet lag).`)
  if (s.quality != null) lines.push(`Average quality ${s.quality.toFixed(1)}/5.`)
  lines.push(`Longest ${hoursText(s.longest.min)} (${s.longest.night}), shortest ${hoursText(s.shortest.min)} (${s.shortest.night}).`)
  if (s.fajr) lines.push(`Fajr: on mornings prayed on time, bedtime was ${clockFromNoon(s.fajr.onBed)} and sleep ${hoursText(s.fajr.onMin)} (${s.fajr.on} nights); otherwise bedtime ${clockFromNoon(s.fajr.offBed)} and sleep ${hoursText(s.fajr.offMin)} (${s.fajr.off} nights).`)
  if (s.tasks) lines.push(`Tasks done the next day: ${s.tasks.good.toFixed(1)} after nights near the goal (${s.tasks.goodN}) vs ${s.tasks.short.toFixed(1)} after short nights (${s.tasks.shortN}).`)
  if (before?.count) lines.push(`Period before: ${before.count} nights, average ${hoursText(before.avgMin)}, bedtime ${clockFromNoon(before.avgBed)}, wake-up ${clockFromNoon(before.avgWake)}, consistency ${before.consistency ?? '—'}/100.`)
  return lines.join('\n')
}
