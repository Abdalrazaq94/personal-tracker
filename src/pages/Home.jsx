import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, parseYmd, startOfMonth, today, ymd } from '../lib/dates'
import { dayState, isBad, logOn, planned, success } from '../lib/habits'
import { SpeakButton } from '../lib/speech'
import { BRIEF_EVENT, DayBrief, QuickAddAll, readBrief } from '../components/TodayAI'
import { inWords, nextPrayer, placeToday, prayerName, PRAYERS, timesFor } from '../lib/prayer'
import TaskChart from '../components/TaskChart'
import BlurText from '../components/bits/BlurText'
import CountUp from '../components/bits/CountUp'
import Reveal from '../components/bits/Reveal'
import GlareHover from '../components/reactbits/GlareHover'
import { currentStatus } from '../lib/push'
import { T, Tr, LOCALE } from '../lib/i18n'
import { savePrayerLog, statusOf } from '../lib/prayerStatus'
import { budgetStats, loadBudget } from '../lib/budget'
import { clockOf, hoursText, minutesSlept } from '../lib/sleep'
import { promiseStats } from '../lib/promises'
import { faithKey, followAccountLayout, getLayout, shownFeatures, shownSections, useLayout } from '../lib/layout'
import { countMap, doneOn, dueOn, faithOf } from '../lib/faith'
import { PracticeRow, usePractices } from '../components/Practices'
import { isTrainingDay, nextWorkout } from '../lib/gym'
import { WelcomePicker } from './Customize'
import Cat from '../components/Cat'

const PRIORITY = { doing: 0, todo: 1 }

// the buttons at the top of Home (two per row)

const addDays = (ymdStr, n) => {
  const d = parseYmd(ymdStr)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
function dayWord(day, t) {
  if (day < t) return T('Overdue')
  if (day === t) return T('Today')
  if (day === addDays(t, 1)) return T('Tomorrow')
  return parseYmd(day).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Picks the same few words all day, different ones tomorrow. */
function wordsOfTheDay(words, n = 3) {
  const seed = Number(today().replace(/-/g, ''))
  return [...words]
    .map((w, i) => ({ w, k: ((seed * 9301 + i * 49297) % 233280) / 233280 }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.w)
}

export default function Home({ session }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [reload, setReload] = useState(0)
  const [prayer, setPrayer] = useState(null) // the next prayer, if a city is chosen
  const [place, setPlace] = useState(undefined) // the city for prayer times (null = not chosen)
  const [prayerLogs, setPrayerLogs] = useState(null) // today's marked prayers: Map prayer → row
  const [remind, setRemind] = useState(null) // reminders on / off on this phone
  const [budget, setBudget] = useState(null) // monthly budget (null = none set)
  const [sleepRows, setSleepRows] = useState([]) // the last 2 nights (empty if Sleep isn't set up)
  const [gym, setGym] = useState(null) // { plan, workouts } (null until loaded / not set up)
  const [promises, setPromises] = useState(null) // { list, logs } of running promises (null until loaded / not set up)
  const layout = useLayout() // which features and cards you chose to show (Customise Home)
  const faith = faithKey(layout)
  const practices = usePractices(faith) // other faiths: today's practices (nothing is loaded for Islam)
  const practiceCounts = useMemo(() => countMap(practices.logs), [practices.logs])
  const [brief, setBrief] = useState(readBrief) // today's AI summary: the cat tells you the first line
  useEffect(() => {
    const on = (e) => setBrief(e.detail)
    window.addEventListener(BRIEF_EVENT, on)
    return () => window.removeEventListener(BRIEF_EVENT, on)
  }, [])
  const [welcome, setWelcome] = useState(false) // brand-new account: "What do you want to track?"
  const [tip, setTip] = useState(() => {
    try {
      return !getLayout().chosen && !localStorage.getItem('tracker-layout-tip')
    } catch {
      return false
    }
  })
  useEffect(() => {
    followAccountLayout().then((has) => {
      const created = Date.parse(session?.user?.created_at || 0)
      if (!has && Date.now() - created < 3 * 864e5) {
        setWelcome(true)
        setTip(false)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const hideTip = () => {
    setTip(false)
    try {
      localStorage.setItem('tracker-layout-tip', '1')
    } catch {
      /* fine */
    }
  }

  useEffect(() => {
    currentStatus()
      .then(setRemind)
      .catch(() => {})
    loadBudget()
      .then((b) => setBudget(b.budget))
      .catch(() => {})
    supabase
      .from('sleep_logs')
      .select('*')
      .order('night', { ascending: false })
      .limit(2)
      .then(({ data, error }) => !error && setSleepRows(data || []))
    Promise.all([supabase.from('promises').select('*').is('ended_at', null), supabase.from('promise_logs').select('*').gte('day', today())])
      .then(([p, l]) => !p.error && !l.error && setPromises({ list: p.data || [], logs: l.data || [] }))
      .catch(() => {})
    Promise.all([supabase.from('gym_plans').select('*').maybeSingle(), supabase.from('workouts').select('*').gte('day', addDays(today(), -60))])
      .then(([p, w]) => !p.error && !w.error && setGym({ plan: p.data || null, workouts: w.data || [] }))
      .catch(() => {})
    supabase.auth.getUser().then(async ({ data }) => {
      const pl = data?.user?.user_metadata?.prayer || null
      setPlace(pl)
      if (!pl) return
      const day = placeToday(pl.tz)
      try {
        setPrayer(nextPrayer(pl, day))
      } catch {
        /* no prayer times */
      }
      const { data: rows } = await supabase.from('prayer_logs').select('*').eq('day', day)
      setPrayerLogs(new Map((rows || []).map((r) => [r.prayer, r])))
    })
  }, [])

  // mark a prayer from Home: on time / late (in its time), Qada (prayed after its time) or didn't pray
  const markPrayer = async (key, status) => {
    const day = placeToday(place?.tz)
    const before = prayerLogs
    setPrayerLogs((m) => new Map(m || []).set(key, { prayer: key, status, late: status !== 'ontime' }))
    const { error } = await savePrayerLog(supabase, { day, prayer: key, status })
    if (error) {
      setError(error.message)
      setPrayerLogs(before)
    }
  }

  useEffect(() => {
    const t = today()
    const load = async () => {
      const [tasks, plans, habits, logs, words, spend, links, notes] = await Promise.all([
        supabase.from('tasks').select('*'),
        supabase.from('plans').select('*').lte('plan_date', addDays(t, 7)).eq('done', false),
        supabase.from('habits').select('*').order('created_at', { ascending: true }),
        supabase.from('habit_logs').select('*').eq('day', t),
        supabase.from('words').select('id, word, translation, status').neq('status', 'memorized'),
        supabase.from('expenses').select('amount, spent_on').gte('spent_on', ymd(startOfMonth())),
        supabase.from('links').select('id', { count: 'exact', head: true }),
        supabase.from('notes').select('id', { count: 'exact', head: true }),
      ])
      const err = [tasks, plans, habits, logs, words, spend].find((r) => r.error)?.error
      if (err) setError(err.message)
      setD({
        allTasks: tasks.data || [],
        tasks: (tasks.data || [])
          .filter((x) => x.status !== 'done')
          .sort(
            (a, b) =>
              (a.priority === 'important' ? 0 : 1) - (b.priority === 'important' ? 0 : 1) ||
              PRIORITY[a.status] - PRIORITY[b.status] ||
              new Date(b.created_at) - new Date(a.created_at),
          ),
        plans: (plans.data || []).sort((a, b) =>
          a.plan_date !== b.plan_date ? (a.plan_date < b.plan_date ? -1 : 1) : (a.plan_time || '99').localeCompare(b.plan_time || '99'),
        ),
        habits: habits.data || [],
        logs: logs.data || [],
        words: wordsOfTheDay(words.data || []),
        wordsLeft: (words.data || []).length,
        spend: spend.data || [],
        links: links.count || 0,
        notes: notes.count || 0,
      })
    }
    load()
  }, [reload])

  // ---- actions (update the screen immediately, then save) ----
  const doneTask = async (task) => {
    const next = task.status === 'done' ? 'todo' : 'done'
    const done_at = next === 'done' ? new Date().toISOString() : null
    setD((x) => ({
      ...x,
      tasks: x.tasks.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
      allTasks: x.allTasks.map((t) => (t.id === task.id ? { ...t, status: next, done_at } : t)),
    }))
    const { error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    if (error) setError(error.message)
  }
  const donePlan = async (plan) => {
    const next = !plan.done
    setD((x) => ({ ...x, plans: x.plans.map((p) => (p.id === plan.id ? { ...p, done: next } : p)) }))
    const { error } = await supabase.from('plans').update({ done: next }).eq('id', plan.id)
    if (error) setError(error.message)
  }
  const plusHabit = async (habit) => {
    const day = today()
    const count = logOn(d.logs, habit.id, day).count + 1
    setD((x) => {
      const has = x.logs.some((l) => l.habit_id === habit.id && l.day === day)
      return {
        ...x,
        logs: has ? x.logs.map((l) => (l.habit_id === habit.id && l.day === day ? { ...l, count } : l)) : [...x.logs, { habit_id: habit.id, day, count }],
      }
    })
    const { error } = await supabase.from('habit_logs').upsert({ habit_id: habit.id, day, count }, { onConflict: 'habit_id,day' })
    if (error) setError(error.message)
  }
  const addSpend = async (e) => {
    e.preventDefault()
    const n = Number(String(amount).replace(',', '.'))
    if (!n || n <= 0) return
    const row = { amount: n, note: note.trim(), spent_on: today() }
    setD((x) => ({ ...x, spend: [...x.spend, row] }))
    setAmount('')
    setNote('')
    const { error } = await supabase.from('expenses').insert(row)
    if (error) setError(error.message)
  }

  // ---- derived ----
  const now = new Date()
  const hour = now.getHours()
  const greet = hour < 12 ? T('Good morning') : hour < 18 ? T('Good afternoon') : T('Good evening')
  const date = now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })

  const todayHabits = useMemo(() => (d ? d.habits.filter((h) => planned(h, new Date()) && !logOn(d.logs, h.id, today()).skipped) : []), [d])
  const goodHabits = todayHabits.filter((h) => !isBad(h))
  const badHabits = todayHabits.filter(isBad)

  const t = today()
  const weekEnd = addDays(t, 7)

  // things with a day (and maybe a time): plans, and tasks with "Remind me"
  const upcoming = d
    ? [
        ...d.plans.map((p) => ({
          key: `p${p.id}`,
          day: p.plan_date,
          time: p.plan_time ? String(p.plan_time).slice(0, 5) : '',
          title: p.title,
          kind: 'Plan',
          important: p.important,
          done: p.done,
          toggle: () => donePlan(p),
        })),
        ...d.tasks
          .filter((x) => x.remind_at)
          .map((x) => {
            const at = new Date(x.remind_at)
            return {
              key: `t${x.id}`,
              day: ymd(at),
              time: hhmm(at),
              title: x.title,
              kind: 'Task',
              important: x.priority === 'important',
              done: x.status === 'done',
              toggle: () => doneTask(x),
            }
          })
          .filter((x) => x.day <= weekEnd),
      ].sort((a, b) => (a.day !== b.day ? (a.day < b.day ? -1 : 1) : (a.time || '99').localeCompare(b.time || '99')))
    : []
  const groups = []
  for (const it of upcoming) {
    const label = dayWord(it.day, t)
    const g = groups.find((x) => x[0] === label)
    if (g) g[1].push(it)
    else groups.push([label, [it]])
  }
  const openTasks = d
    ? [...d.tasks].sort((a, b) => (a.remind_at ? 0 : 1) - (b.remind_at ? 0 : 1) || (a.remind_at || '').localeCompare(b.remind_at || '')).slice(0, 8)
    : []
  const planGroups = groups.map(([label, list]) => [label, list.filter((x) => x.kind === 'Plan')]).filter(([, list]) => list.length)
  const allUntimed = d ? d.tasks.filter((x) => !x.remind_at) : []
  const untimed = allUntimed.slice(0, 6)
  const moreTasks = d ? Math.max(0, d.tasks.length - openTasks.length) : 0

  // little wins today, for Mochi the cat: tasks finished, plans done, good habits reached
  const wins = d
    ? d.allTasks.filter((x) => x.status === 'done' && x.done_at && ymd(new Date(x.done_at)) === t).length +
      d.plans.filter((p) => p.done).length +
      goodHabits.filter((h) => success(h, logOn(d.logs, h.id, t).count)).length
    : 0

  const spentToday = d ? d.spend.filter((x) => x.spent_on === t).reduce((a, x) => a + Number(x.amount), 0) : 0
  const spentMonth = d ? d.spend.reduce((a, x) => a + Number(x.amount), 0) : 0
  const bud = d && budget ? budgetStats(d.spend, budget, t) : null
  const sleepOpen = sleepRows.find((r) => !r.wake_at && Date.now() - Date.parse(r.bed_at) < 20 * 3600e3)
  const wakeUp = async () => {
    const at = new Date().toISOString()
    if (Date.now() - Date.parse(sleepOpen.bed_at) < 5 * 60000) {
      // tapped by mistake: nothing to save
      setSleepRows((l) => l.filter((r) => r.id !== sleepOpen.id))
      await supabase.from('sleep_logs').delete().eq('id', sleepOpen.id)
      return
    }
    setSleepRows((l) => l.map((r) => (r.id === sleepOpen.id ? { ...r, wake_at: at } : r)))
    const { error } = await supabase.from('sleep_logs').update({ wake_at: at, updated_at: at }).eq('id', sleepOpen.id)
    if (error) setError(error.message)
  }

  /** A plain summary of today, used when the AI can't answer. */
  function plainBrief() {
    if (!d) return ''
    const late = upcoming.filter((x) => x.day < t && !x.done)
    const todays = upcoming.filter((x) => x.day === t && !x.done)
    const next = todays.find((x) => x.time && x.time >= hhmm(new Date())) || todays[0]
    const important = d.tasks.filter((x) => x.priority === 'important' && x.status !== 'done')
    const parts = []
    parts.push(
      todays.length || untimed.length ? T('You have **{0} things** to do today.', [todays.length + allUntimed.length]) : T('Nothing planned for today.'),
    )
    if (next) parts.push(T('Next: **{0}**{1}.', [next.title, next.time ? ` at ${next.time}` : '']))
    if (late.length)
      parts.push(
        T('**{0} overdue**: {1}.', [
          late.length,
          late
            .slice(0, 2)
            .map((x) => x.title)
            .join(', '),
        ]),
      )
    if (important.length)
      parts.push(
        T('Important: {0}.', [
          important
            .slice(0, 2)
            .map((x) => `**${x.title}**`)
            .join(', '),
        ]),
      )
    if (goodHabits.length) parts.push(T('Habits: {0} of {1} done.', [goodHabits.filter((h) => dayState(h, d.logs, now) === 'ok').length, goodHabits.length]))
    parts.push(T('Spent {0} today.', [money(spentToday)]))
    return parts.join(' ')
  }

  /** The small line under each button. */
  function tileNote(to) {
    if (!d) return '…'
    switch (to) {
      case '/tasks': {
        const open = d.tasks.filter((x) => x.status !== 'done').length
        return open ? <>{Tr('{0} to do', <CountUp to={open} />)}</> : T('All done')
      }
      case '/plan': {
        const late = d.plans.filter((p) => !p.done && p.plan_date < t).length
        const todayN = d.plans.filter((p) => !p.done && p.plan_date === t).length
        return late ? T('{0} overdue', [late]) : todayN ? T('{0} today', [todayN]) : T('Nothing today')
      }
      case '/habits':
        return goodHabits.length
          ? T('{0} of {1} today', [goodHabits.filter((h) => dayState(h, d.logs, now) === 'ok').length, goodHabits.length])
          : T('Track habits')
      case '/spend':
        if (bud) return bud.left < 0 ? T('{0} over budget', [money(-bud.left)]) : Tr('{0} left', <CountUp to={bud.left} format={money} />)
        return Tr('{0} today', <CountUp to={spentToday} format={money} />)
      case '/words':
        return d.wordsLeft ? <>{Tr('{0} to learn', <CountUp to={d.wordsLeft} />)}</> : T('Add words')
      case '/commit': {
        if (faith === 'islam') return prayer ? T('{0} in {1}', [prayerName(prayer), inWords(prayer.inMs)]) : T('Prayer times')
        const due = (practices.list || []).filter((p) => dueOn(p, t))
        if (!due.length) return T('Nothing planned today')
        return T('{0} of {1} done today', [due.filter((p) => doneOn(p, practiceCounts, t)).length, due.length])
      }
      case '/notes':
        return T('{0} notes', [d.notes])
      case '/links':
        return T('{0} saved', [d.links])
      case '/jobs':
        return T('Applications')
      case '/review':
        return T('Your week, month or year at a glance')
      case '/sleep': {
        if (sleepOpen) return T('Sleeping since {0}', [clockOf(sleepOpen.bed_at)])
        const last = sleepRows.find((r) => r.wake_at)
        return last && last.night >= addDays(t, -1) ? T('{0} last night', [hoursText(minutesSlept(last))]) : T('Log your sleep')
      }
      case '/gym': {
        if (!gym?.plan) return T('Set up your training')
        if (gym.workouts.some((w) => w.day === t && w.finished_at)) return T('✓ Trained today')
        const nw = nextWorkout(gym.plan, gym.workouts)
        return isTrainingDay(gym.plan, t) && nw ? T('Today: {0}', [T(nw.title)]) : T('Rest day')
      }
      case '/promises': {
        if (!promises?.list.length) return T('Make a promise')
        const kept = promises.list.filter((p) => promiseStats(p, promises.logs, t).today === 'kept').length
        return T('{0} of {1} kept today', [kept, promises.list.length])
      }
      case '/reminders':
        return remind === 'on' ? T('On') : remind === 'blocked' ? T('Blocked') : T('Off')
      default:
        return ''
    }
  }

  // the cards under the Home buttons, shown in the order you chose (Customise Home)
  const cards = d && {
    quickadd: (
      <>
        <QuickAddAll onChanged={() => setReload((n) => n + 1)} />
        <DayBrief fallback={plainBrief()} />
      </>
    ),
    tasks: (
      <>
        <Reveal as="section" className="today-card today-card--tasks">
          <SectionHead title={T('Daily tasks')} to="/tasks" note={T('{0} to do', [d.tasks.filter((x) => x.status !== 'done').length])} />
          <TaskChart tasks={d.allTasks} today={t} />
          {d.allTasks.length > 0 && !d.allTasks.some((x) => 'done_at' in x) && (
            <p className="muted small">{T('To see what you finish each day, run supabase/migrations/011_task_done_at.sql in Supabase once.')}</p>
          )}
          {openTasks.length === 0 ? (
            <p className="muted small">{Tr('No tasks to do. {0}', <Link to="/tasks">{T('Add a task')}</Link>)}</p>
          ) : (
            <ul className="today-list">
              {openTasks.map((task) => (
                <li key={task.id} className={task.status === 'done' ? 'is-done' : ''}>
                  <button className={`check ${task.status === 'done' ? 'is-on' : ''}`} aria-label={T('Done')} onClick={() => doneTask(task)}>
                    {task.status === 'done' ? '✓' : ''}
                  </button>
                  <span dir="auto" className="today-list__text">
                    {task.remind_at && <strong className="plan__time">{whenShort(task.remind_at)}</strong>}
                    {task.title}
                  </span>
                  {task.priority === 'important' && <span className="tag tag--solid">!</span>}
                  {task.status === 'doing' && <span className="tag">{T('Doing')}</span>}
                </li>
              ))}
            </ul>
          )}
          {moreTasks > 0 && (
            <Link to="/tasks" className="today-more">
              {Tr('+{0} more tasks →', moreTasks)}
            </Link>
          )}
        </Reveal>
      </>
    ),
    plans: (
      <>
        <Reveal as="section" className="today-card today-card--plans">
          <SectionHead title={T('Plans')} to="/plan" />
          {planGroups.length === 0 ? (
            <p className="muted small">{Tr('No plans for the next 7 days. {0}', <Link to="/plan">{T('Plan something')}</Link>)}</p>
          ) : (
            planGroups.map(([label, list]) => (
              <div key={label} className="up-group">
                <h3 className={`up-day ${label === T('Overdue') ? 'is-late' : ''}`}>{label}</h3>
                <ul className="today-list">
                  {list.map((it) => (
                    <li key={it.key} className={it.done ? 'is-done' : ''}>
                      <button className={`check ${it.done ? 'is-on' : ''}`} aria-label={T('Done')} onClick={it.toggle}>
                        {it.done ? '✓' : ''}
                      </button>
                      <span dir="auto" className="today-list__text">
                        {it.time && <strong className="plan__time">{it.time}</strong>}
                        {it.title}
                      </span>
                      {it.important && <span className="tag tag--solid">!</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Reveal>
      </>
    ),
    prayers: (
      <>
        {faith === 'islam' ? (
          <PrayerToday place={place} logs={prayerLogs} onMark={markPrayer} />
        ) : (
          <PracticesToday faith={faith} practices={practices} counts={practiceCounts} today={t} />
        )}
      </>
    ),
    gym: gym && <GymToday gym={gym} today={t} />,
    habits: todayHabits.length > 0 && (
      <Reveal as="section" className="today-card">
        <SectionHead title={T('Habits')} to="/habits" />
        <ul className="today-list">
          {goodHabits.map((h) => {
            const c = logOn(d.logs, h.id, t).count
            const ok = c >= h.target
            return (
              <li key={h.id} className={ok ? 'is-done' : ''}>
                <span className={`check ${ok ? 'is-on' : ''}`} aria-hidden>
                  {ok ? '✓' : ''}
                </span>
                <span dir="auto" className="today-list__text">
                  {h.name}
                </span>
                <span className="today-count">
                  {c}/{h.target}
                </span>
                <button className="round-btn round-btn--solid round-btn--sm" aria-label={T('Add one to {0}', [h.name])} onClick={() => plusHabit(h)}>
                  +
                </button>
              </li>
            )
          })}
          {badHabits.map((h) => {
            const c = logOn(d.logs, h.id, t).count
            const clean = c <= h.target
            return (
              <li key={h.id}>
                <span className={`check ${clean ? 'is-on' : 'is-bad'}`} aria-hidden>
                  {clean ? '✓' : '!'}
                </span>
                <span dir="auto" className="today-list__text">
                  {h.name}
                </span>
                <span className="today-count">{c === 0 ? T('None today') : T('{0} today', [c])}</span>
                <button className="round-btn round-btn--sm" aria-label={T('I did {0} once more', [h.name])} onClick={() => plusHabit(h)}>
                  +
                </button>
              </li>
            )
          })}
        </ul>
      </Reveal>
    ),
    words: d.words.length > 0 && (
      <Reveal as="section" className="today-card">
        <SectionHead title={T('Words to practise')} to="/words" note={T('{0} not memorized', [d.wordsLeft])} />
        <ul className="today-words">
          {d.words.map((w) => (
            <li key={w.id} className={`word--${w.status}`}>
              <div>
                <strong>{w.word}</strong>
                {w.translation && (
                  <span dir="auto" className="muted">
                    {w.translation}
                  </span>
                )}
              </div>
              <SpeakButton text={w.word} label={T('Hear "{0}"', [w.word])} />
            </li>
          ))}
        </ul>
        <Link to="/words" className="btn btn--ghost btn--sm today-cta">
          {T('✦ Practise these words')}
        </Link>
      </Reveal>
    ),
    spending: (
      <>
        <Reveal as="section" className="today-card">
          <SectionHead title={T('Spending')} to="/spend" />
          <div className="today-money">
            <div>
              <span>{T('Today')}</span>
              <strong>
                <CountUp to={spentToday} format={money} />
              </strong>
            </div>
            <div>
              <span>{T('This month')}</span>
              <strong>
                <CountUp to={spentMonth} format={money} />
              </strong>
            </div>
          </div>
          {bud && (
            <div className={`today-budget budget--${bud.state}`}>
              <div className="budget__bar" aria-hidden>
                <span className="budget__fill" style={{ width: `${Math.min(100, bud.pct * 100)}%` }} />
                <span className="budget__mark" style={{ insetInlineStart: `${Math.min(100, bud.share * 100)}%` }} />
              </div>
              <p>
                {bud.left < 0
                  ? T('{0} over your {1} budget', [money(-bud.left), money(bud.budget)])
                  : T('{0} left of {1} · about {2} a day', [money(bud.left), money(bud.budget), money(bud.perDay)])}
              </p>
            </div>
          )}
          <form className="today-spend" onSubmit={addSpend}>
            <input inputMode="decimal" placeholder="0.00" aria-label={T('Amount')} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input dir="auto" placeholder={T('What for?')} aria-label={T('What for')} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn--sm" disabled={!amount}>
              {T('Add')}
            </button>
          </form>
        </Reveal>
      </>
    ),
  }

  return (
    <div className="page">
      <header className={`home-header ${layout.look.cat.on ? 'home-header--cat' : ''}`}>
        <div>
          <p className="muted">{date}</p>
          <BlurText as="h1" className="display" text={`${greet}.`} />
        </div>
        {layout.look.cat.on && (
          <Cat
            look={layout.look.cat}
            wins={wins}
            brief={brief}
            onBrief={() => document.getElementById('your-day')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          />
        )}
      </header>

      {error && (
        <div className="error-bar" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>
            {T('Dismiss')}
          </button>
        </div>
      )}

      {/* ------------------------------ all sections, two per row ------------------------------ */}
      <nav className="home-tiles" aria-label={T('Sections')}>
        {shownFeatures(layout).map((x, i) => (
          <GlareHover
            key={x.to}
            className={`home-glare ${x.wide ? 'home-glare--wide' : ''}`}
            style={{ '--i': i }}
            background="var(--tile, var(--tile-bg))"
            borderColor="var(--tile-line)"
            borderRadius="16px"
            glareColor="var(--glare)"
            glareOpacity={0.3}
            glareAngle={-35}
            glareSize={55}
            variant="sheen"
            blendMode="var(--glare-blend)"
            transitionDuration={700}
          >
            <Link to={x.to} className="home-tile">
              <span className="home-tile__icon" aria-hidden>
                {x.icon}
              </span>
              <span className="home-tile__text">
                <strong>{T(x.label)}</strong>
                <span>{tileNote(x.to)}</span>
              </span>
            </Link>
          </GlareHover>
        ))}
      </nav>
      <div className="home-custom">
        <Link to="/settings" className="link small">
          {T('⚙︎ Settings: colours, cat and Home')}
        </Link>
      </div>

      {welcome && <WelcomePicker onDone={() => setWelcome(false)} />}
      {tip && !welcome && (
        <section className="card home-tip">
          <span aria-hidden>✨</span>
          <span>
            <strong>{T('New: make Home yours')}</strong>
            <span className="muted small">{T('Hide what you don’t use and put your favourites first.')}</span>
          </span>
          <span className="home-tip__acts">
            <Link to="/settings" className="btn btn--sm" onClick={hideTip}>
              {T('Customise')}
            </Link>
            <button type="button" className="icon-btn" aria-label={T('Close')} onClick={hideTip}>
              ×
            </button>
          </span>
        </section>
      )}

      {sleepOpen && (
        <section className="card sleep-wake">
          <span aria-hidden>🌙</span>
          <Link to="/sleep" className="sleep-wake__text">
            <strong>{T('Sleeping since {0}', [clockOf(sleepOpen.bed_at)])}</strong>
            <span className="muted small">{T('{0} so far', [hoursText((Date.now() - Date.parse(sleepOpen.bed_at)) / 60000)])}</span>
          </Link>
          <button className="btn btn--sm" onClick={wakeUp}>
            {T('☀️ I’m awake')}
          </button>
        </section>
      )}

      {!d ? (
        <div className="empty muted loading-text">{T('Loading your day…')}</div>
      ) : (
        <>
          {shownSections(layout).map((c) => (
            <Fragment key={c.key}>{cards[c.key]}</Fragment>
          ))}
        </>
      )}

      <footer className="home-footer">
        <span className="muted">{session.user.email}</span>
        <button className="btn btn--ghost btn--sm" onClick={() => supabase.auth.signOut()}>
          {T('Sign out')}
        </button>
      </footer>
    </div>
  )
}

/** "15:40", or "Tue 15:40" when it isn't today. */
function whenShort(iso) {
  const at = new Date(iso)
  const time = hhmm(at)
  return ymd(at) === today() ? time : `${at.toLocaleDateString(LOCALE, { weekday: 'short' })} ${time}`
}

/** Today's 5 prayers at a glance: done, late, now, missed or coming, with quick buttons for the ones not marked yet. */
function PrayerToday({ place, logs, onMark }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  if (place === undefined) return null
  if (!place)
    return (
      <Reveal as="section" className="today-card today-card--prayers">
        <SectionHead title={T('Prayers')} to="/commit" />
        <p className="muted small">{Tr('Choose your city in {0} to see prayer times here.', <Link to="/commit">{T('Prayers')}</Link>)}</p>
      </Reveal>
    )

  const day = placeToday(place.tz)
  let times
  try {
    times = timesFor(place, day)
  } catch {
    return null
  }
  const now = Date.now()
  const rows = PRAYERS.map((p, i) => {
    const start = times[p.key].getTime()
    // Fajr's time ends at sunrise, the others when the next prayer starts
    const end = p.key === 'fajr' ? times.sunrise.getTime() : i < PRAYERS.length - 1 ? times[PRAYERS[i + 1].key].getTime() : start + 6 * 3600 * 1000
    const st = statusOf(logs?.get(p.key))
    const STATE = { ontime: 'done', late: 'late', qada: 'qada', missed: 'notprayed' }
    // after Fajr's time but before Dhuhr, Fajr still waits for an answer ("missed" = passed, not marked)
    const state = st ? STATE[st] : now < start ? 'coming' : now < end ? 'now' : 'missed'
    return { ...p, at: times[p.key], state }
  })
  const next = nextPrayer(place, day)
  const current = rows.find((r) => r.state === 'now')
  const missed = rows.filter((r) => r.state === 'missed')
  const word = { done: '✓', late: T('Late'), qada: T('Qada'), notprayed: '✕', now: T('Now'), missed: T('Not marked'), coming: '' }
  const clock = (date, tz) => {
    try {
      return date.toLocaleTimeString(LOCALE || 'en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz || undefined })
    } catch {
      return date.toLocaleTimeString(LOCALE || 'en-GB', { hour: '2-digit', minute: '2-digit' })
    }
  }

  return (
    <Reveal as="section" className="today-card today-card--prayers">
      <SectionHead title={T('Prayers')} to="/commit" note={T('Next: {0} {1} · in {2}', [prayerName(next), clock(next.at, place.tz), inWords(next.inMs)])} />
      <ul className="pt-row" aria-label={T("Today's prayers")}>
        {rows.map((r) => (
          <li key={r.key} className={`pt pt--${r.state}`}>
            <strong>{prayerName(r)}</strong>
            <span>{word[r.state] || clock(r.at, place.tz)}</span>
          </li>
        ))}
      </ul>
      {current && (
        <div className="pt-act">
          <span>{Tr('It’s {0} time now', <b>{prayerName(current)}</b>)}</span>
          <span className="pt-act__btns">
            <button className="btn btn--sm" onClick={() => onMark(current.key, 'ontime')}>
              {T('✓ On time')}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => onMark(current.key, 'late')}>
              {T('Late')}
            </button>
          </span>
        </div>
      )}
      {missed.map((r) => (
        <div key={r.key} className="pt-act pt-act--missed">
          <span>{Tr('{0} ({1}) has passed', <b>{prayerName(r)}</b>, clock(r.at, place.tz))}</span>
          <span className="pt-act__btns">
            <button className="btn btn--ghost btn--sm" title={T('Made up later, after its time')} onClick={() => onMark(r.key, 'qada')}>
              {T('Prayed Qada')}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => onMark(r.key, 'missed')}>
              {T('Didn’t pray')}
            </button>
          </span>
        </div>
      ))}
      {!current && missed.length === 0 && rows.some((r) => r.state !== 'coming') && <p className="muted small">{T('All prayers so far are marked. ✓')}</p>}
    </Reveal>
  )
}

/** Gym: today's workout (or rest day) with a Start button. */
function GymToday({ gym, today }) {
  if (!gym.plan)
    return (
      <Reveal as="section" className="today-card">
        <SectionHead title={T('Gym')} to="/gym" />
        <p className="muted small">{Tr('Choose a program in {0} to get a daily workout with photos.', <Link to="/gym">{T('Gym')}</Link>)}</p>
      </Reveal>
    )
  const trained = gym.workouts.filter((w) => w.day === today && w.finished_at)
  const nw = nextWorkout(gym.plan, gym.workouts)
  const training = isTrainingDay(gym.plan, today)
  return (
    <Reveal as="section" className="today-card gym-home">
      <SectionHead title={T('Gym')} to="/gym" />
      {trained.length ? (
        <p className="gym-done">{T('✓ Done today: {0}. Well done!', [trained.map((w) => T(w.title)).join(', ')])}</p>
      ) : training && nw ? (
        <div className="gym-home__row">
          <span className="gym-home__imgs" aria-hidden>
            {nw.items.slice(0, 3).map((it) => (
              <img key={it.ex} src={`/ex/${it.ex}-1.webp`} alt="" loading="lazy" width="54" height="36" />
            ))}
          </span>
          <span className="gym-home__text">
            <strong>
              {nw.emoji} {T(nw.title)}
            </strong>
            <span className="muted small">{T('{0} exercises', [nw.items.length])}</span>
          </span>
          <Link to="/gym" className="btn btn--sm">
            {T('▶ Start')}
          </Link>
        </div>
      ) : (
        <p className="muted small">{T('Rest day. A short stretch or a walk helps you recover.')}</p>
      )}
    </Reveal>
  )
}

/** Other faiths: today's practices, tick or count right here. */
function PracticesToday({ faith, practices, counts, today }) {
  const info = faithOf(faith)
  if (!info || !practices.list) return null
  const due = practices.list.filter((p) => dueOn(p, today))
  const done = due.filter((p) => doneOn(p, counts, today)).length
  return (
    <Reveal as="section" className="today-card today-card--prayers">
      <SectionHead title={`${info.icon} ${T(info.feature)}`} to="/commit" note={due.length ? T('{0} of {1} done', [done, due.length]) : null} />
      {due.length === 0 ? (
        <p className="muted small">{practices.list.length ? T('Nothing planned today.') : Tr('Add your practices in {0}.', <Link to="/commit">{T(info.feature)}</Link>)}</p>
      ) : (
        <ul className="faith-list">
          {due.map((p) => (
            <PracticeRow key={p.id} p={p} count={counts.get(`${p.id}|${today}`) || 0} onCount={(n) => practices.setCount(p, today, n)} />
          ))}
        </ul>
      )}
    </Reveal>
  )
}

function SectionHead({ title, to, note }) {
  return (
    <div className="today-head">
      <h2>
        {title}
        {note && <span className="muted small"> · {note}</span>}
      </h2>
      <Link to={to} aria-label={T('Open {0}', [title])}>
        {T('Open →')}
      </Link>
    </div>
  )
}
