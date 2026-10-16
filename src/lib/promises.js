import { T, isAr } from './i18n'

/**
 * Promises (needs supabase/migrations/018_promises.sql).
 *  avoid = "I promise not to …": every day counts as kept unless you say you broke it.
 *  do    = "I promise to … every day": a day counts only when you tick it.
 * Days are "YYYY-MM-DD" in your own time zone.
 */
export const NEEDS_PROMISES_SQL = 'Promises need a small database update: run supabase/migrations/018_promises.sql in Supabase → SQL Editor, then refresh.'
export const promisesMissing = (e) => /promise|relation .* does not exist|schema cache/i.test(e?.message || e || '')

const pad = (n) => String(n).padStart(2, '0')
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymdOf(d)
}
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5) // b − a

export const MILESTONES = [1, 3, 7, 14, 21, 30, 40, 60, 90, 120, 180, 270, 365, 500, 730, 1000]
export const GOALS = [7, 14, 21, 30, 40, 60, 90, 180, 365]
export const EMOJIS = ['🤝', '🚭', '☕', '🥤', '🍬', '📵', '🎮', '🍔', '💸', '🛌', '📖', '🏃', '💧', '🕌', '🤐', '❤️']

/** What happened on one day: kept | broken | missed (a "do" day not ticked) | pending (today, not ticked) | before | after */
export function stateOn(p, logOf, day, today) {
  if (day < p.start_date) return 'before'
  if (p.ended_at && day > p.ended_at) return 'after'
  if (day > today) return 'future'
  const l = logOf.get(day)
  if (l) return l.kept ? 'kept' : 'broken'
  if (p.kind === 'avoid') return 'kept'
  return day < today ? 'missed' : 'pending'
}

/** logs → Map(day → log) for one promise */
export const logMap = (p, logs) => new Map(logs.filter((l) => l.promise_id === p.id).map((l) => [l.day, l]))

/** Everything shown on a promise's card. */
export function promiseStats(p, logs, today) {
  const logOf = logMap(p, logs)
  const last = p.ended_at && p.ended_at < today ? p.ended_at : today
  const days = []
  for (let d = p.start_date; d <= last; d = addDays(d, 1)) days.push({ day: d, state: stateOn(p, logOf, d, today) })

  let kept = 0
  let broken = 0
  let run = 0
  let longest = 0
  for (const x of days) {
    if (x.state === 'kept') {
      kept++
      run++
      longest = Math.max(longest, run)
    } else if (x.state === 'broken' || x.state === 'missed') {
      broken++
      run = 0
    }
    // pending (today, not ticked yet) doesn't break the streak
  }
  const counted = kept + broken
  const current = run
  const progressDays = p.kind === 'avoid' ? current : kept // avoid: days in a row; do: days done
  const goal = p.goal_days || null
  const breaks = days
    .filter((x) => x.state === 'broken')
    .map((x) => ({ day: x.day, note: logOf.get(x.day)?.note || '' }))
    .reverse()
  const byWeekday = [0, 0, 0, 0, 0, 0, 0]
  for (const b of days) if (b.state === 'broken' || b.state === 'missed') byWeekday[parse(b.day).getDay()]++
  const nextMilestone = MILESTONES.find((m) => m > current) || null

  return {
    days,
    total: days.length,
    kept,
    broken,
    rate: counted ? kept / counted : null,
    current,
    longest,
    progressDays,
    goal,
    progress: goal ? Math.min(1, progressDays / goal) : null,
    reached: goal ? progressDays >= goal : false,
    nextMilestone,
    saved: Number(p.cost) > 0 ? Number(p.cost) * kept : 0,
    breaks,
    lastBreak: breaks[0]?.day || null,
    byWeekday,
    today: stateOn(p, logOf, today, today),
  }
}

/** Kept / not kept inside a period, for one promise (only days the promise was running). */
export function periodCounts(p, logs, period, today) {
  const logOf = logMap(p, logs)
  const to = period.to < today ? period.to : today
  let kept = 0
  let broken = 0
  for (let d = period.from; d <= to; d = addDays(d, 1)) {
    const s = stateOn(p, logOf, d, today)
    if (s === 'kept') kept++
    else if (s === 'broken' || s === 'missed') broken++
  }
  return { kept, broken, days: kept + broken, rate: kept + broken ? kept / (kept + broken) : null }
}

/** All promises over a period, with the period before for comparison. */
export function promisesReport(promises, logs, period, before, today) {
  const rows = promises
    .map((p) => ({ p, now: periodCounts(p, logs, period, today), before: periodCounts(p, logs, before, today) }))
    .filter((r) => r.now.days > 0)
  const sum = (k, w) => rows.reduce((a, r) => a + r[w][k], 0)
  const kept = sum('kept', 'now')
  const broken = sum('broken', 'now')
  const keptB = sum('kept', 'before')
  const brokenB = sum('broken', 'before')
  return {
    rows,
    kept,
    broken,
    rate: kept + broken ? kept / (kept + broken) : null,
    rateBefore: keptB + brokenB ? keptB / (keptB + brokenB) : null,
    brokenBefore: brokenB,
  }
}

/** "3 days", "1 day" */
export function daysText(n) {
  if (isAr) {
    // Arabic counts nouns differently: 1 يوم واحد, 2 يومان, 3–10 أيام, 11+ يومًا
    if (n === 1) return 'يوم واحد'
    if (n === 2) return 'يومان'
    if (n % 100 >= 3 && n % 100 <= 10) return `${n} أيام`
    return n === 0 ? '0 يوم' : `${n} يومًا`
  }
  return n === 1 ? T('1 day') : T('{0} days', [n])
}

/** Plain text the AI reads (English; it answers in the app's language). */
export function promisesSummary(promises, logs, today, period) {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return promises
    .map((p) => {
      const s = promiseStats(p, logs, today)
      const c = period ? periodCounts(p, logs, period, today) : null
      const breaks = s.breaks
        .filter((b) => !period || (b.day >= period.from && b.day <= period.to))
        .slice(0, 25)
        .map((b) => `${b.day} ${WD[parse(b.day).getDay()]}${b.note ? ` ("${b.note.slice(0, 80)}")` : ''}`)
      return [
        `PROMISE: ${p.kind === 'avoid' ? 'not to' : 'to'} "${p.title}"${p.why ? ` — reason: "${p.why.slice(0, 120)}"` : ''}`,
        `  started ${p.start_date}${p.ended_at ? `, ended ${p.ended_at}` : ''}; goal ${p.goal_days ? `${p.goal_days} days` : 'for good'}; type ${p.kind === 'avoid' ? 'avoid (a day counts unless broken)' : 'do (a day counts only when ticked)'}`,
        `  all time: ${s.kept} days kept, ${s.broken} not kept (${s.rate == null ? 'n/a' : Math.round(s.rate * 100) + '%'}); current streak ${s.current}, longest ${s.longest}${s.saved ? `; money saved ${s.saved.toFixed(2)}` : ''}`,
        c ? `  this period: ${c.kept} kept, ${c.broken} not kept` : '',
        `  times broken by weekday: ${WD.map((w, i) => `${w} ${s.byWeekday[i]}`).join(', ')}`,
        breaks.length ? `  broken on: ${breaks.join('; ')}` : '  never broken in this period',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}
