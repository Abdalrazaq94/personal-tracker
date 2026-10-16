import { T } from './i18n'
import { currentPrayer, inWords, nextPrayer, prayerName, PRAYERS, timesFor } from './prayer'
import { isTrainingDay, nextWorkout } from './gym'
import { ymd } from './dates'

const SOON = 60 * 60e3 // say it up to an hour before
const LATE = 3 * 60 * 60e3 // and keep saying it up to 3 hours after, until it's done
const clip = (s, n = 40) => (String(s || '').length > n ? String(s).slice(0, n - 1).trimEnd() + '…' : String(s || ''))

/**
 * What your buddy on Home reminds you about, most urgent first:
 * - prayer: "It's time for Asr" (started, not marked yet) or "Asr in 20m"
 * - tasks with a reminder time, and plans with a time today: "in 20m" or "Time for: …"
 * - today's workout, and "Time for your workout" once your gym reminder time has passed
 * Each note: { key, text, to (page to open), urgent, at (ms) }.
 */
export function buddyNotes({ now = new Date(), tasks, plans, prayer, gym }) {
  const out = []
  const t = now.getTime()
  const today = ymd(now)

  // prayer
  if (prayer?.place) {
    try {
      const { place, logs, day } = prayer
      const cur = currentPrayer(place, day)
      const times = timesFor(place, day)
      const started = cur ? times[cur].getTime() : 0
      const p = PRAYERS.find((x) => x.key === cur)
      if (p && !logs?.has?.(cur) && t - started < 90 * 60e3) {
        out.push({ key: 'pray-' + cur, text: T('It’s time for {0} 🕌', [prayerName(p)]), to: '/commit', urgent: true, at: started })
      } else {
        const next = nextPrayer(place, day)
        if (next && next.inMs <= 45 * 60e3)
          out.push({ key: 'pray-next-' + next.key, text: T('{0} in {1} 🕌', [prayerName(next), inWords(next.inMs)]), to: '/commit', urgent: next.inMs <= 10 * 60e3, at: next.at.getTime() })
      }
    } catch {
      /* no prayer times for this place */
    }
  }

  // tasks with "Remind me"
  for (const x of tasks || []) {
    if (!x.remind_at || x.status === 'done') continue
    const at = Date.parse(x.remind_at)
    const diff = at - t
    if (diff <= 0 && -diff < LATE) out.push({ key: 'task-' + x.id, text: T('Time for: {0} ⏰', [clip(x.title)]), to: '/tasks', urgent: true, at })
    else if (diff > 0 && diff <= SOON) out.push({ key: 'task-' + x.id, text: T('{0} in {1} ⏰', [clip(x.title), inWords(diff)]), to: '/tasks', urgent: diff <= 10 * 60e3, at })
  }

  // plans with a time today
  for (const p of plans || []) {
    if (p.done || p.plan_date !== today || !p.plan_time) continue
    const [h, m] = String(p.plan_time).split(':').map(Number)
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m || 0).getTime()
    const diff = at - t
    if (diff <= 0 && -diff < LATE) out.push({ key: 'plan-' + p.id, text: T('Time for: {0} 📅', [clip(p.title)]), to: '/plan', urgent: true, at })
    else if (diff > 0 && diff <= SOON) out.push({ key: 'plan-' + p.id, text: T('{0} in {1} 📅', [clip(p.title), inWords(diff)]), to: '/plan', urgent: diff <= 10 * 60e3, at })
  }

  // today's workout
  if (gym?.plan && isTrainingDay(gym.plan, today) && !(gym.workouts || []).some((w) => w.day === today && w.finished_at)) {
    const nw = nextWorkout(gym.plan, gym.workouts || [])
    const rt = gym.plan.remind && gym.plan.remind_time ? gym.plan.remind_time.split(':').map(Number) : null
    const due = rt && now.getHours() * 60 + now.getMinutes() >= rt[0] * 60 + rt[1]
    const hour = now.getHours()
    if (nw && (due || (hour >= 8 && hour < 21)))
      out.push({
        key: 'gym-' + today,
        text: due ? T('Time for your workout: {0} 🏋️', [T(nw.title)]) : T('Workout today: {0} 🏋️', [T(nw.title)]),
        to: '/gym',
        urgent: !!due,
        at: due ? t : t + 12 * 3600e3,
      })
  }

  return out.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.at - b.at).slice(0, 5)
}
