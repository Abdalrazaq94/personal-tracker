import { T } from './i18n'
import { timesFor } from './prayer'

/**
 * Faith for everyone. Islam keeps its own prayer page (times, adhan, Qada…); the others use "practices":
 * a list you can edit — tick once a day, or count up to a target (e.g. japa 108) — on the days you choose.
 * Needs supabase/migrations/020_faith.sql. The choice itself is saved with your Home layout.
 */
export const FAITHS = [
  { key: 'islam', icon: '🕌', name: 'Islam', feature: 'Prayers' },
  { key: 'christian', icon: '✝️', name: 'Christianity', feature: 'Faith' },
  { key: 'jewish', icon: '✡️', name: 'Judaism', feature: 'Faith' },
  { key: 'hindu', icon: '🕉️', name: 'Hinduism', feature: 'Faith' },
  { key: 'custom', icon: '✨', name: 'My own practices', feature: 'Practices' },
]
export const faithOf = (key) => FAITHS.find((f) => f.key === key) || null

export const NEEDS_FAITH_SQL = 'Faith practices need a small database update: run supabase/migrations/020_faith.sql in Supabase → SQL Editor, then refresh.'
export const faithMissing = (e) => /practice|relation .* does not exist|schema cache/i.test(e?.message || e || '')

// Ready-made practices (English keys, translated when they are created so they appear in your language).
// days: 0 = Sunday … 6 = Saturday; null = every day.
export const PRESETS = {
  christian: [
    { emoji: '🙏', title: 'Morning prayer', time: '07:00' },
    { emoji: '📖', title: 'Bible reading', kind: 'count', target: 1, unit: 'chapters' },
    { emoji: '🌙', title: 'Evening prayer', time: '21:30' },
    { emoji: '⛪', title: 'Church', days: [0], time: '10:00' },
    { emoji: '🤍', title: 'Gratitude (3 things)' },
  ],
  jewish: [
    { emoji: '🌅', title: 'Shacharit (morning prayer)', time: '07:00' },
    { emoji: '☀️', title: 'Mincha (afternoon prayer)', time: '14:00' },
    { emoji: '🌙', title: 'Ma’ariv (evening prayer)', time: '20:30' },
    { emoji: '📜', title: 'Torah study' },
    { emoji: '🕯️', title: 'Shabbat candles', days: [5], special: 'shabbat' },
  ],
  hindu: [
    { emoji: '🪔', title: 'Morning puja', time: '06:30' },
    { emoji: '📿', title: 'Japa', kind: 'count', target: 108, unit: 'beads' },
    { emoji: '📖', title: 'Scripture reading (Gita)' },
    { emoji: '🕯️', title: 'Evening aarti', time: '19:00' },
  ],
  custom: [],
}
// Ideas offered when adding a practice
export const IDEAS = {
  christian: ['Fasting', 'Rosary', 'Bible study group', 'Serve someone today'],
  jewish: ['Tefillin', 'Psalms (Tehillim)', 'Tzedakah (charity)', 'Blessing before meals'],
  hindu: ['Fasting', 'Temple visit', 'Meditation', 'Yoga'],
  custom: ['Meditation (10 min)', 'Morning prayer', 'Reading', 'Gratitude', 'Fasting', 'Charity'],
  islam: [],
}
export const EMOJIS = ['🙏', '📖', '🌙', '🌅', '☀️', '⛪', '🕯️', '📜', '🪔', '📿', '🕉️', '🧘', '🤍', '💧', '🍞', '❤️', '✨', '🌱']

/** Copies of the ready-made practices, in the app's language, ready to save. */
export const presetRows = (faith) =>
  (PRESETS[faith] || []).map((p, i) => ({
    faith,
    title: T(p.title),
    emoji: p.emoji,
    kind: p.kind || 'check',
    target: p.target || 1,
    unit: p.unit ? T(p.unit) : '',
    days: p.days || null,
    time: p.time || null,
    remind: false,
    special: p.special || null,
    sort: i,
  }))

/* ----------------------------- days and progress ----------------------------- */

const pad = (n) => String(n).padStart(2, '0')
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s, n) => {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return ymdOf(d)
}

/** Is this practice planned for that day? */
export const dueOn = (p, day) => !p.days || !p.days.length || p.days.includes(parseDay(day).getDay())
export const firstDay = (p) => ymdOf(new Date(p.created_at || Date.now()))

/** logs → Map("practiceId|day" → count) */
export const countMap = (logs) => new Map(logs.map((l) => [`${l.practice_id}|${l.day}`, l.count]))
export const doneOn = (p, counts, day) => (counts.get(`${p.id}|${day}`) || 0) >= (p.target || 1)

/** Streak (planned days in a row that were done; today not done yet doesn't break it), and the last-30-days rate. */
export function practiceStats(p, counts, today) {
  let streak = 0
  for (let i = 0, d = today; i < 800; i++, d = addDays(d, -1)) {
    if (d < firstDay(p)) break
    if (!dueOn(p, d)) continue
    if (doneOn(p, counts, d)) streak++
    else if (d === today) continue
    else break
  }
  let due = 0
  let done = 0
  for (let i = 0, d = today; i < 30; i++, d = addDays(d, -1)) {
    if (d < firstDay(p)) break
    if (!dueOn(p, d) || (d === today && !doneOn(p, counts, d))) continue
    due++
    if (doneOn(p, counts, d)) done++
  }
  return { streak, due, done, rate: due ? done / due : null }
}

/** Done / planned inside a period (days up to today), for all practices together and for each. */
export function practicesReport(practices, counts, period, today) {
  const to = period.to < today ? period.to : today
  const rows = practices.map((p) => {
    let due = 0
    let done = 0
    for (let d = period.from; d <= to; d = addDays(d, 1)) {
      if (d < firstDay(p) || !dueOn(p, d)) continue
      if (d === today && !doneOn(p, counts, d)) continue
      due++
      if (doneOn(p, counts, d)) done++
    }
    return { p, due, done, rate: due ? done / due : null }
  })
  const due = rows.reduce((a, r) => a + r.due, 0)
  const done = rows.reduce((a, r) => a + r.done, 0)
  return { rows: rows.filter((r) => r.due > 0), due, done, rate: due ? done / due : null }
}

/** Plain text for the AI (English; it answers in the app's language). */
export function practicesSummary(faith, practices, counts, period, today) {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const to = period.to < today ? period.to : today
  return [
    `Faith: ${faithOf(faith)?.name || 'own practices'}.`,
    ...practices.map((p) => {
      const missed = [0, 0, 0, 0, 0, 0, 0]
      let due = 0
      let done = 0
      for (let d = period.from; d <= to; d = addDays(d, 1)) {
        if (d < firstDay(p) || !dueOn(p, d) || (d === today && !doneOn(p, counts, d))) continue
        due++
        if (doneOn(p, counts, d)) done++
        else missed[parseDay(d).getDay()]++
      }
      const s = practiceStats(p, counts, today)
      return (
        `PRACTICE "${p.title}"${p.kind === 'count' ? ` (target ${p.target} ${p.unit || ''} a day)` : ''}` +
        `${p.days?.length ? ` on ${p.days.map((x) => WD[x]).join('/')}` : ' every day'}${p.time ? ` at ${p.time}` : ''}: ` +
        `done ${done} of ${due} planned days in this period; current streak ${s.streak}; missed by weekday: ${WD.map((w, i) => `${w} ${missed[i]}`).join(', ')}`
      )
    }),
  ].join('\n')
}

/* ----------------------------- Shabbat ----------------------------- */

/**
 * Candle lighting (18 minutes before sunset) and when Shabbat ends (about 42 minutes after Saturday's sunset —
 * customs differ, so it is shown as "about"). friday = "YYYY-MM-DD". Needs a city (lat/lon).
 */
export function shabbatTimes(place, friday) {
  if (!place?.lat) return null
  try {
    const sunsetOf = (day) => {
      const t = timesFor({ ...place, method: 'MuslimWorldLeague' }, day) // only sunset is used, which doesn't depend on the method
      return t.sunset || t.maghrib
    }
    const fri = sunsetOf(friday)
    const sat = sunsetOf(addDays(friday, 1))
    return { candles: new Date(fri.getTime() - 18 * 60000), ends: new Date(sat.getTime() + 42 * 60000) }
  } catch {
    return null
  }
}

/** The coming Friday (today if it is Friday). */
export const nextFriday = (today) => addDays(today, (5 - parseDay(today).getDay() + 7) % 7)
