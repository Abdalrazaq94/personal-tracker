import { addDays, ymd } from './dates'

// Good habit: success when count >= target (times per day you want).
// Bad habit:  success ("clean") when count <= target (most times per day you allow; 0 = avoid).
// Days that are not planned (habit.days) or marked skipped are neutral: they never break a streak.

export const TRIGGERS = ['Stress', 'Boredom', 'Tired', 'After eating', 'After coffee', 'With friends', 'Phone / social media', 'Alone', 'Other']

export const WEEKDAYS = [
  { n: 1, short: 'M', long: 'Mon' },
  { n: 2, short: 'T', long: 'Tue' },
  { n: 3, short: 'W', long: 'Wed' },
  { n: 4, short: 'T', long: 'Thu' },
  { n: 5, short: 'F', long: 'Fri' },
  { n: 6, short: 'S', long: 'Sat' },
  { n: 0, short: 'S', long: 'Sun' },
]
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

export const MILESTONES = [7, 14, 30, 60, 100, 200, 365]

export const isBad = (h) => h.kind === 'bad'

const EMPTY = { count: 0, skipped: false, resisted: 0, reasons: [] }

export const logOn = (logs, id, day) => {
  const l = logs.find((x) => x.habit_id === id && x.day === day)
  return l ? { ...EMPTY, ...l, reasons: l.reasons || [] } : { ...EMPTY }
}
export const countOn = (logs, id, day) => logOn(logs, id, day).count

export const success = (h, count) => (isBad(h) ? count <= h.target : count >= h.target)

export const startDay = (h) => ymd(new Date(h.created_at || Date.now()))

export const planned = (h, date) => {
  const days = Array.isArray(h.days) && h.days.length ? h.days : ALL_DAYS
  return days.includes(date.getDay())
}

export const daysLabel = (h) => {
  const days = Array.isArray(h.days) && h.days.length ? h.days : ALL_DAYS
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays'
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends'
  return WEEKDAYS.filter((w) => days.includes(w.n))
    .map((w) => w.long)
    .join(', ')
}

/**
 * State of one day:
 *  before  – habit didn't exist yet      off     – not a planned day
 *  skipped – marked as skipped           ok      – target reached / stayed clean
 *  over    – bad habit over its limit    part    – good habit started but not finished
 *  pending – today, good habit not done yet   miss – good habit not done
 */
export function dayState(h, logs, date) {
  const key = ymd(date)
  if (key < startDay(h)) return 'before'
  const log = logOn(logs, h.id, key)
  if (log.skipped) return 'skipped'
  if (!planned(h, date)) return log.count > 0 && !isBad(h) ? 'ok' : 'off'
  if (success(h, log.count)) return 'ok'
  if (isBad(h)) return 'over'
  if (key === ymd()) return log.count > 0 ? 'part' : 'pending'
  return log.count > 0 ? 'part' : 'miss'
}

/** Daily counts for the last `days` days (oldest → today). Days before the habit existed are null. */
export function series(h, logs, days = 30) {
  const start = startDay(h)
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(new Date(), i - (days - 1))
    const key = ymd(d)
    return { key, date: d, count: key < start ? null : countOn(logs, h.id, key) }
  })
}

export function stats(h, logs) {
  const mine = logs.filter((x) => x.habit_id === h.id)
  const total = mine.reduce((a, x) => a + (x.count || 0), 0)
  const resistedTotal = mine.reduce((a, x) => a + (x.resisted || 0), 0)
  const start = new Date(startDay(h) + 'T00:00:00')
  const todayDate = new Date()

  // current streak: walk back from today; neutral days are passed over, a failed day stops it
  let streak = 0
  for (let i = 0, d = new Date(todayDate); i < 800; i++, d = addDays(d, -1)) {
    const s = dayState(h, mine, d)
    if (s === 'before') break
    if (s === 'ok') streak++
    else if (s === 'off' || s === 'skipped' || s === 'pending' || s === 'part') continue
    else break
  }

  // best streak ever: walk forward from the first day
  let best = 0
  let run = 0
  for (let d = new Date(start); ymd(d) <= ymd(todayDate); d = addDays(d, 1)) {
    const s = dayState(h, mine, d)
    if (s === 'ok') best = Math.max(best, ++run)
    else if (s === 'off' || s === 'skipped' || s === 'pending' || s === 'part') continue
    else run = 0
  }

  // last 30 days: planned, non-skipped days
  let okDays = 0
  let trackedDays = 0
  for (let i = 0; i < 30; i++) {
    const s = dayState(h, mine, addDays(todayDate, -i))
    if (s === 'before') break
    if (s === 'off' || s === 'skipped' || s === 'pending') continue
    trackedDays++
    if (s === 'ok') okDays++
  }

  // money (bad habits with a cost): saved compared with how many a day you did before
  let saved30 = 0
  let savedAll = 0
  let spent30 = 0
  if (isBad(h) && Number(h.cost) > 0) {
    const cost = Number(h.cost)
    for (let i = 0, d = new Date(todayDate); i < 3650; i++, d = addDays(d, -1)) {
      const key = ymd(d)
      if (key < startDay(h)) break
      const c = countOn(mine, h.id, key)
      const s = Math.max(0, (h.baseline || 0) - c) * cost
      savedAll += s
      if (i < 30) {
        saved30 += s
        spent30 += c * cost
      }
    }
  }

  // triggers: what caused the slips
  const tally = {}
  mine.forEach((x) => (x.reasons || []).forEach((r) => (tally[r] = (tally[r] || 0) + 1)))
  const triggers = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, n }))

  const milestone = [...MILESTONES].reverse().find((m) => streak >= m) || null
  const next = MILESTONES.find((m) => m > streak) || null

  return { total, resistedTotal, streak, best, okDays, trackedDays, saved30, savedAll, spent30, triggers, milestone, next }
}
