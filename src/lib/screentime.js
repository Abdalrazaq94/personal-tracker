/** Helpers for Phone time (sent every hour by the Tracker Phone Android helper). */

/** 205 → "3h 25m", 45 → "45m", 0 → "0m" */
export function fmtMins(m) {
  const n = Math.max(0, Math.round(Number(m) || 0))
  const h = Math.floor(n / 60)
  const r = n % 60
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}

export const sortApps = (apps) => [...(apps || [])].sort((x, y) => y.minutes - x.minutes)

/** Total minutes per app over several days, biggest first. */
export function appTotals(rows) {
  const m = new Map()
  for (const r of rows)
    for (const a of r.apps || []) {
      const k = a.name.toLowerCase()
      const old = m.get(k) || { name: a.name, minutes: 0, days: 0 }
      m.set(k, { name: old.name, minutes: old.minutes + a.minutes, days: old.days + 1 })
    }
  return [...m.values()].sort((x, y) => y.minutes - x.minutes)
}
