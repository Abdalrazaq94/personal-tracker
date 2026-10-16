import { T } from './i18n'

/**
 * Gym (needs supabase/migrations/021_gym.sql). Exercise photos and steps: Free Exercise DB (public domain),
 * stored in public/ex/<id>-0.webp and -1.webp (start and end of the movement).
 */
export const NEEDS_GYM_SQL = 'Gym needs a small database update: run supabase/migrations/021_gym.sql in Supabase → SQL Editor, then refresh.'
export const gymMissing = (e) => /gym_plans|workout|body_weights|relation .* does not exist|schema cache/i.test(e?.message || e || '')

export const photo = (id, k = 0) => `/ex/${id}-${k}.webp`

// item: { ex: exercise id, sets, reps } or { ex, sets, secs } — rest in seconds between sets
const r = (ex, sets, reps, rest = 75) => ({ ex, sets, reps, rest })
const s = (ex, sets, secs, rest = 30) => ({ ex, sets, secs, rest })

export const PROGRAMS = [
  {
    key: 'home',
    icon: '🏠',
    name: 'Home workout — no equipment',
    hint: '20–30 minutes, anywhere. Three workouts that take turns.',
    days: [1, 3, 5],
    workouts: [
      { key: 'home-a', title: 'Full body', emoji: '💪', items: [r('Bodyweight_Squat', 3, 12, 60), r('Incline_Push-Up', 3, 10, 60), r('Bodyweight_Walking_Lunge', 3, 10, 60), s('Plank', 3, 30), r('Single_Leg_Glute_Bridge', 3, 10, 45), s('Mountain_Climbers', 3, 30)] },
      { key: 'home-b', title: 'Core and cardio', emoji: '🔥', items: [s('Star_Jump', 3, 30), r('Superman', 3, 12, 45), r('Cross-Body_Crunch', 3, 15, 45), r('Push_Up_to_Side_Plank', 3, 8, 60), r('Step-up_with_Knee_Raise', 3, 10, 45), s('Flutter_Kicks', 3, 30)] },
      { key: 'home-c', title: 'Strength and stretch', emoji: '🧘', items: [r('Pushups', 3, 8, 75), r('Bodyweight_Squat', 3, 15, 60), r('Butt_Lift_Bridge', 3, 12, 45), s('Cat_Stretch', 2, 30, 15), s('Childs_Pose', 2, 40, 15), s('Hamstring_Stretch', 2, 30, 15), s('Kneeling_Hip_Flexor', 2, 30, 15)] },
    ],
  },
  {
    key: 'beginner',
    icon: '🏋️',
    name: 'Gym: beginner full body',
    hint: 'Three days a week, two workouts (A and B) that take turns.',
    days: [1, 3, 5],
    workouts: [
      { key: 'beg-a', title: 'Workout A', emoji: '🅰️', items: [r('Barbell_Squat', 3, 8, 120), r('Dumbbell_Bench_Press', 3, 10, 90), r('Seated_Cable_Rows', 3, 10, 90), r('Dumbbell_Shoulder_Press', 3, 10, 90), s('Plank', 3, 30, 45)] },
      { key: 'beg-b', title: 'Workout B', emoji: '🅱️', items: [r('Leg_Press', 3, 10, 120), r('Wide-Grip_Lat_Pulldown', 3, 10, 90), r('Incline_Dumbbell_Press', 3, 10, 90), r('Romanian_Deadlift', 3, 8, 120), r('Dumbbell_Bicep_Curl', 2, 12, 60), r('Triceps_Pushdown', 2, 12, 60)] },
    ],
  },
  {
    key: 'ppl',
    icon: '🔁',
    name: 'Gym: push / pull / legs',
    hint: 'Three to six days a week: push, then pull, then legs.',
    days: [1, 2, 3, 4, 5, 6],
    workouts: [
      { key: 'ppl-push', title: 'Push (chest, shoulders, triceps)', emoji: '🫸', items: [r('Barbell_Bench_Press_-_Medium_Grip', 4, 8, 150), r('Incline_Dumbbell_Press', 3, 10, 90), r('Dumbbell_Shoulder_Press', 3, 10, 90), r('Side_Lateral_Raise', 3, 15, 60), r('Triceps_Pushdown', 3, 12, 60), r('Dips_-_Triceps_Version', 3, 10, 90)] },
      { key: 'ppl-pull', title: 'Pull (back, biceps)', emoji: '🫷', items: [r('Pullups', 3, 8, 120), r('Bent_Over_Barbell_Row', 4, 8, 120), r('One-Arm_Dumbbell_Row', 3, 10, 75), r('Face_Pull', 3, 15, 60), r('Hammer_Curls', 3, 12, 60), r('Dumbbell_Bicep_Curl', 2, 12, 60)] },
      { key: 'ppl-legs', title: 'Legs', emoji: '🦵', items: [r('Barbell_Squat', 4, 8, 150), r('Romanian_Deadlift', 3, 10, 120), r('Leg_Press', 3, 12, 90), r('Lying_Leg_Curls', 3, 12, 60), r('Leg_Extensions', 3, 12, 60), r('Standing_Calf_Raises', 4, 15, 45)] },
    ],
  },
  {
    key: 'custom',
    icon: '✏️',
    name: 'My own workouts',
    hint: 'Build your own workouts from the exercise library.',
    days: [1, 3, 5],
    workouts: [],
  },
]
export const programOf = (key) => PROGRAMS.find((p) => p.key === key) || PROGRAMS[0]
/** The workouts of a plan (built-in, or your own for "My own workouts"). */
export const workoutsOf = (plan) => (plan?.program === 'custom' ? plan.routines || [] : programOf(plan?.program).workouts)

/** Stretching for rest days (short and gentle). */
export const REST_DAY = { key: 'rest-stretch', title: 'Rest-day stretch', emoji: '🌿', items: [s('Cat_Stretch', 2, 30, 10), s('Childs_Pose', 2, 40, 10), s('Hamstring_Stretch', 2, 30, 10), s('Kneeling_Hip_Flexor', 2, 30, 10), s('Shoulder_Stretch', 2, 30, 10), s('Calf_Stretch_Hands_Against_Wall', 2, 30, 10)] }

/** Today's "lesson": one short tip, a new one each day. */
export const LESSONS = [
  { t: 'Warm up first', d: 'Spend 5 minutes walking, cycling or doing light sets before you start. Warm muscles move better and get injured less.' },
  { t: 'Form before weight', d: 'Use a weight you can lift with good form for every rep. Add weight only when the last set feels controlled.' },
  { t: 'Progress a little', d: 'Each week, try one more rep or a little more weight (1–2.5 kg). Small steps add up fast.' },
  { t: 'Breathe', d: 'Breathe out as you push or lift, and in as you lower. Never hold your breath for a whole set.' },
  { t: 'Rest between sets', d: '60–90 seconds for most exercises, 2–3 minutes for heavy squats, deadlifts and presses.' },
  { t: 'Sleep builds muscle', d: 'Muscles grow while you rest. Aim for 7–9 hours — your Sleep page shows how you are doing.' },
  { t: 'Protein in every meal', d: 'Eggs, chicken, fish, beans, lentils, yoghurt. Spread protein across your meals for better recovery.' },
  { t: 'Drink water', d: 'Have a glass before you train and sip between sets, especially on hot days.' },
  { t: 'Slow on the way down', d: 'Lower the weight in about 2–3 seconds. The slow part builds strength and protects your joints.' },
  { t: 'Full range of motion', d: 'Go all the way down and all the way up, as far as you can with good form.' },
  { t: 'Consistency wins', d: 'Three good workouts every week beat one huge workout and a week off.' },
  { t: 'Listen to pain', d: 'Muscle burn is normal. Sharp or joint pain is not — stop, and see a professional if it continues.' },
  { t: 'Rest days count', d: 'Walk, stretch and recover. Rest days are when your body adapts.' },
  { t: 'Write it down', d: 'Logging every set shows your progress and tells you what to lift next time.' },
]
export const lessonOf = (day) => {
  const n = Math.floor(Date.parse(day + 'T12:00:00Z') / 864e5)
  return LESSONS[((n % LESSONS.length) + LESSONS.length) % LESSONS.length]
}

/* ------------------------------ dates ------------------------------ */

const pad = (n) => String(n).padStart(2, '0')
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDay = (str) => {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (str, n) => {
  const d = parseDay(str)
  d.setDate(d.getDate() + n)
  return ymdOf(d)
}
export const mondayOf = (day) => addDays(day, -((parseDay(day).getDay() + 6) % 7))

/* ------------------------------ plan ------------------------------ */

export const isTrainingDay = (plan, day) => !!plan && (plan.days || []).includes(parseDay(day).getDay())

/** The workout to do next: the program's workouts take turns, after the last one you finished. */
export function nextWorkout(plan, workouts) {
  const list = workoutsOf(plan)
  if (!list.length) return null
  const done = workouts.filter((w) => w.finished_at && list.some((x) => x.key === w.workout_key)).sort((a, b) => (a.finished_at < b.finished_at ? 1 : -1))
  if (!done.length) return list[0]
  const i = list.findIndex((x) => x.key === done[0].workout_key)
  return list[(i + 1) % list.length]
}

/* ------------------------------ numbers ------------------------------ */

/** Estimated best single lift (Epley): weight × (1 + reps / 30). */
export const oneRepMax = (weight, reps) => (weight > 0 && reps > 0 ? weight * (1 + Math.min(reps, 12) / 30) : 0)
export const volumeOf = (sets) => sets.reduce((a, x) => a + (Number(x.weight) || 0) * (x.reps || 0), 0)

/** For each exercise: the last time's sets, the best weight and the best estimated 1-rep max. */
export function historyByExercise(workouts, sets) {
  const dayOf = new Map(workouts.map((w) => [w.id, w.day]))
  const by = new Map()
  for (const x of sets) {
    const day = dayOf.get(x.workout_id)
    if (!day) continue
    const h = by.get(x.exercise_id) || { last: null, lastDay: '', best: 0, bestDay: '', e1rm: 0, sessions: new Set(), first: null, firstDay: '9999' }
    h.sessions.add(x.workout_id)
    const w = Number(x.weight) || 0
    if (w > h.best) {
      h.best = w
      h.bestDay = day
    }
    h.e1rm = Math.max(h.e1rm, oneRepMax(w, x.reps))
    if (day > h.lastDay) {
      h.lastDay = day
      h.last = []
    }
    if (day === h.lastDay) h.last.push(x)
    if (day < h.firstDay) {
      h.firstDay = day
      h.first = []
    }
    if (day === h.firstDay) h.first.push(x)
    by.set(x.exercise_id, h)
  }
  for (const h of by.values()) {
    h.last?.sort((a, b) => a.set_no - b.set_no)
    h.count = h.sessions.size
    h.firstBest = Math.max(0, ...(h.first || []).map((x) => Number(x.weight) || 0))
  }
  return by
}

/** Weeks in a row (ending this week) with at least `target` workouts; this week counts once it reaches the target. */
export function weekStreak(workouts, today, target) {
  const per = new Map()
  for (const w of workouts) if (w.finished_at) per.set(mondayOf(w.day), (per.get(mondayOf(w.day)) || 0) + 1)
  let streak = 0
  for (let i = 0, m = mondayOf(today); i < 200; i++, m = addDays(m, -7)) {
    if ((per.get(m) || 0) >= target) streak++
    else if (i === 0) continue
    else break
  }
  return { streak, thisWeek: per.get(mondayOf(today)) || 0 }
}

/** Plain text for the AI (English; it answers in the app's language). */
export function gymSummary(plan, workouts, sets, period, exName, weights) {
  const inP = workouts.filter((w) => w.finished_at && w.day >= period.from && w.day <= period.to)
  const ids = new Set(inP.map((w) => w.id))
  const ps = sets.filter((x) => ids.has(x.workout_id))
  const byEx = new Map()
  for (const w of inP.sort((a, b) => (a.day < b.day ? -1 : 1)))
    for (const x of ps.filter((y) => y.workout_id === w.id)) {
      const k = x.exercise_id
      const arr = byEx.get(k) || []
      arr.push(`${w.day}: ${x.reps ?? '-'}${x.weight ? `×${x.weight}kg` : ''}${x.seconds ? ` ${x.seconds}s` : ''}`)
      byEx.set(k, arr)
    }
  const mins = inP.filter((w) => w.started_at && w.finished_at).map((w) => (Date.parse(w.finished_at) - Date.parse(w.started_at)) / 60000)
  const bw = weights.filter((x) => x.day >= period.from && x.day <= period.to).sort((a, b) => (a.day < b.day ? -1 : 1))
  return [
    `Program: ${programOf(plan?.program).name}; planned training days per week: ${(plan?.days || []).length}.`,
    `Workouts in this period: ${inP.length}${mins.length ? `, average ${Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)} min` : ''}; total volume ${Math.round(volumeOf(ps))} kg.`,
    `Workout days: ${inP.map((w) => `${w.day} ${w.title}`).join('; ') || 'none'}.`,
    ...[...byEx.entries()].slice(0, 25).map(([k, arr]) => `EXERCISE ${exName(k)}: ${arr.slice(-18).join(', ')}`),
    bw.length ? `Body weight: ${bw.map((x) => `${x.day} ${x.kg}kg`).join(', ')}` : 'Body weight: not logged.',
  ].join('\n')
}

export const muscleName = (m) => T(m.charAt(0).toUpperCase() + m.slice(1))
