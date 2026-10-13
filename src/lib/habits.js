import { addDays, ymd } from './dates'

// Good habit: success when count >= target (times per day you want).
// Bad habit:  success ("clean") when count <= target (most times per day you allow; 0 = avoid).

export const isBad = (h) => h.kind === 'bad'

export const countOn = (logs, id, day) => logs.find((x) => x.habit_id === id && x.day === day)?.count || 0

export const success = (h, count) => (isBad(h) ? count <= h.target : count >= h.target)

export const startDay = (h) => ymd(new Date(h.created_at || Date.now()))

/** Daily counts for the last `days` days (oldest → today). Days before the habit existed are null. */
export function series(h, logs, days = 30) {
  const start = startDay(h)
  const mine = logs.filter((l) => l.habit_id === h.id)
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(new Date(), i - (days - 1))
    const key = ymd(d)
    return { key, date: d, count: key < start ? null : countOn(mine, h.id, key) }
  })
}

export function stats(h, logs) {
  const mine = logs.filter((x) => x.habit_id === h.id)
  const start = startDay(h)
  const total = mine.reduce((a, x) => a + x.count, 0)
  const ok = (d) => {
    const key = ymd(d)
    return key >= start && success(h, countOn(mine, h.id, key))
  }

  // streak: consecutive successful days ending today (good habits: or yesterday if today isn't done yet)
  let d = new Date()
  if (!isBad(h) && !ok(d)) d = addDays(d, -1)
  let streak = 0
  while (ok(d)) {
    streak++
    d = addDays(d, -1)
  }

  // successful days in the last 30 days (since the habit was created)
  const last30 = series(h, logs, 30).filter((x) => x.count !== null)
  const okDays = last30.filter((x) => success(h, x.count)).length

  return { total, streak, okDays, trackedDays: last30.length }
}
