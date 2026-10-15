import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, parseYmd, startOfMonth, today, ymd } from '../lib/dates'
import { dayState, isBad, logOn, planned } from '../lib/habits'
import { SpeakButton } from '../lib/speech'
import { DayBrief, QuickAddAll } from '../components/TodayAI'
import { inWords, nextPrayer, placeToday } from '../lib/prayer'
import { currentStatus } from '../lib/push'

const PRIORITY = { doing: 0, todo: 1 }

// the buttons at the top of Home (two per row)
const TILES = [
  { to: '/tasks', icon: '✅', label: 'Tasks' },
  { to: '/plan', icon: '🗓️', label: 'Plan' },
  { to: '/habits', icon: '🔁', label: 'Habits' },
  { to: '/spend', icon: '💷', label: 'Spend' },
  { to: '/words', icon: '📖', label: 'Words' },
  { to: '/commit', icon: '🕌', label: 'Prayers' },
  { to: '/notes', icon: '📝', label: 'Notes' },
  { to: '/links', icon: '🔗', label: 'Links' },
  { to: '/jobs', icon: '💼', label: 'Jobs' },
  { to: '/reminders', icon: '🔔', label: 'Reminders' },
]

const addDays = (ymdStr, n) => {
  const d = parseYmd(ymdStr)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
function dayWord(day, t) {
  if (day < t) return 'Overdue'
  if (day === t) return 'Today'
  if (day === addDays(t, 1)) return 'Tomorrow'
  return parseYmd(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
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
  const [remind, setRemind] = useState(null) // reminders on / off on this phone

  useEffect(() => {
    currentStatus()
      .then(setRemind)
      .catch(() => {})
    supabase.auth.getUser().then(({ data }) => {
      const place = data?.user?.user_metadata?.prayer
      if (!place) return
      try {
        setPrayer(nextPrayer(place, placeToday(place.tz)))
      } catch {
        /* no prayer times */
      }
    })
  }, [])

  useEffect(() => {
    const t = today()
    const load = async () => {
      const [tasks, plans, habits, logs, words, spend, links, notes] = await Promise.all([
        supabase.from('tasks').select('*').neq('status', 'done'),
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
        tasks: (tasks.data || []).sort(
          (a, b) =>
            (a.priority === 'important' ? 0 : 1) - (b.priority === 'important' ? 0 : 1) ||
            PRIORITY[a.status] - PRIORITY[b.status] ||
            new Date(b.created_at) - new Date(a.created_at)
        ),
        plans: (plans.data || []).sort((a, b) =>
          a.plan_date !== b.plan_date ? (a.plan_date < b.plan_date ? -1 : 1) : (a.plan_time || '99').localeCompare(b.plan_time || '99')
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
    setD((x) => ({ ...x, tasks: x.tasks.map((t) => (t.id === task.id ? { ...t, status: next } : t)) }))
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
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const todayHabits = useMemo(
    () => (d ? d.habits.filter((h) => planned(h, new Date()) && !logOn(d.logs, h.id, today()).skipped) : []),
    [d]
  )
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
  const allUntimed = d ? d.tasks.filter((x) => !x.remind_at) : []
  const untimed = allUntimed.slice(0, 6)
  const moreTasks = Math.max(0, allUntimed.length - untimed.length)

  const items = d
    ? [
        ...upcoming.filter((x) => x.day <= t).map((x) => x.done),
        ...untimed.map((x) => x.status === 'done'),
        ...goodHabits.map((h) => dayState(h, d.logs, now) === 'ok'),
      ]
    : []
  const doneCount = items.filter(Boolean).length
  const spentToday = d ? d.spend.filter((x) => x.spent_on === t).reduce((a, x) => a + Number(x.amount), 0) : 0
  const spentMonth = d ? d.spend.reduce((a, x) => a + Number(x.amount), 0) : 0

  /** A plain summary of today, used when the AI can't answer. */
  function plainBrief() {
    if (!d) return ''
    const late = upcoming.filter((x) => x.day < t && !x.done)
    const todays = upcoming.filter((x) => x.day === t && !x.done)
    const next = todays.find((x) => x.time && x.time >= hhmm(new Date())) || todays[0]
    const important = d.tasks.filter((x) => x.priority === 'important' && x.status !== 'done')
    const parts = []
    parts.push(
      todays.length || untimed.length
        ? `You have **${todays.length + allUntimed.length} things** to do today.`
        : 'Nothing planned for today.'
    )
    if (next) parts.push(`Next: **${next.title}**${next.time ? ` at ${next.time}` : ''}.`)
    if (late.length) parts.push(`**${late.length} overdue**: ${late.slice(0, 2).map((x) => x.title).join(', ')}.`)
    if (important.length) parts.push(`Important: ${important.slice(0, 2).map((x) => `**${x.title}**`).join(', ')}.`)
    if (goodHabits.length) parts.push(`Habits: ${goodHabits.filter((h) => dayState(h, d.logs, now) === 'ok').length} of ${goodHabits.length} done.`)
    parts.push(`Spent ${money(spentToday)} today.`)
    return parts.join(' ')
  }

  /** The small line under each button. */
  function tileNote(to) {
    if (!d) return '…'
    switch (to) {
      case '/tasks': {
        const open = d.tasks.filter((x) => x.status !== 'done').length
        return open ? `${open} to do` : 'All done'
      }
      case '/plan': {
        const late = d.plans.filter((p) => !p.done && p.plan_date < t).length
        const todayN = d.plans.filter((p) => !p.done && p.plan_date === t).length
        return late ? `${late} overdue` : todayN ? `${todayN} today` : 'Nothing today'
      }
      case '/habits':
        return goodHabits.length ? `${goodHabits.filter((h) => dayState(h, d.logs, now) === 'ok').length} of ${goodHabits.length} today` : 'Track habits'
      case '/spend':
        return `${money(spentToday)} today`
      case '/words':
        return d.wordsLeft ? `${d.wordsLeft} to learn` : 'Add words'
      case '/commit':
        return prayer ? `${prayer.name} in ${inWords(prayer.inMs)}` : 'Prayer times'
      case '/notes':
        return `${d.notes} notes`
      case '/links':
        return `${d.links} saved`
      case '/jobs':
        return 'Applications'
      case '/reminders':
        return remind === 'on' ? 'On' : remind === 'blocked' ? 'Blocked' : 'Off'
      default:
        return ''
    }
  }

  return (
    <div className="page">
      <header className="home-header">
        <p className="muted">{date}</p>
        <h1 className="display">{greet}.</h1>
      </header>

      {error && (
        <div className="error-bar" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* ------------------------------ all sections, two per row ------------------------------ */}
      <nav className="home-tiles" aria-label="Sections">
        {TILES.map((x) => (
          <Link key={x.to} to={x.to} className="home-tile">
            <span className="home-tile__icon" aria-hidden>
              {x.icon}
            </span>
            <span className="home-tile__text">
              <strong>{x.label}</strong>
              <span>{tileNote(x.to)}</span>
            </span>
          </Link>
        ))}
      </nav>

      {!d ? (
        <div className="empty muted">Loading your day…</div>
      ) : (
        <>
          {/* ------------------------------ upcoming ------------------------------ */}
          <section className="today-card">
            <div className="today-head">
              <h2>
                Upcoming
                {items.length > 0 && (
                  <span className="muted small">
                    {' '}
                    · {doneCount} of {items.length} done today
                  </span>
                )}
              </h2>
              <Link to="/plan">Plan →</Link>
            </div>
            {items.length > 0 && (
              <div className="progress">
                <span style={{ width: `${(doneCount / items.length) * 100}%` }} />
              </div>
            )}

            {upcoming.length === 0 && untimed.length === 0 ? (
              <p className="muted small">
                Nothing coming up. <Link to="/tasks">Add a task</Link> or <Link to="/plan">plan something</Link>.
              </p>
            ) : (
              <>
                {groups.map(([label, list]) => (
                  <div key={label} className="up-group">
                    <h3 className={`up-day ${label === 'Overdue' ? 'is-late' : ''}`}>{label}</h3>
                    <ul className="today-list">
                      {list.map((it) => (
                        <li key={it.key} className={it.done ? 'is-done' : ''}>
                          <button className={`check ${it.done ? 'is-on' : ''}`} aria-label="Done" onClick={it.toggle}>
                            {it.done ? '✓' : ''}
                          </button>
                          <span dir="auto" className="today-list__text">
                            {it.time && <strong className="plan__time">{it.time}</strong>}
                            {it.title}
                          </span>
                          {it.important && <span className="tag tag--solid">!</span>}
                          <span className="tag">{it.kind}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {untimed.length > 0 && (
                  <div className="up-group">
                    <h3 className="up-day">To do</h3>
                    <ul className="today-list">
                      {untimed.map((task) => (
                        <li key={task.id} className={task.status === 'done' ? 'is-done' : ''}>
                          <button className={`check ${task.status === 'done' ? 'is-on' : ''}`} aria-label="Done" onClick={() => doneTask(task)}>
                            {task.status === 'done' ? '✓' : ''}
                          </button>
                          <span dir="auto" className="today-list__text">
                            {task.title}
                          </span>
                          {task.priority === 'important' && <span className="tag tag--solid">!</span>}
                          {task.status === 'doing' && <span className="tag">Doing</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {moreTasks > 0 && (
              <Link to="/tasks" className="today-more">
                +{moreTasks} more tasks →
              </Link>
            )}
          </section>

          <QuickAddAll onChanged={() => setReload((n) => n + 1)} />
          <DayBrief fallback={plainBrief()} />

          {/* ------------------------------ habits ------------------------------ */}
          {todayHabits.length > 0 && (
            <section className="today-card">
              <SectionHead title="Habits" to="/habits" />
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
                      <button className="round-btn round-btn--solid round-btn--sm" aria-label={`Add one to ${h.name}`} onClick={() => plusHabit(h)}>
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
                      <span className="tag">{c === 0 ? 'Clean today' : clean ? `${c} · within limit` : `${c} · over limit`}</span>
                      <Link to="/habits" className="today-link" aria-label={`Open ${h.name}`}>
                        →
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* ------------------------------ words ------------------------------ */}
          {d.words.length > 0 && (
            <section className="today-card">
              <SectionHead title="Words to practise" to="/words" note={`${d.wordsLeft} not memorized`} />
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
                    <SpeakButton text={w.word} label={`Hear "${w.word}"`} />
                  </li>
                ))}
              </ul>
              <Link to="/words" className="btn btn--ghost btn--sm today-cta">
                ✦ Practise these words
              </Link>
            </section>
          )}

          {/* ------------------------------ spending ------------------------------ */}
          <section className="today-card">
            <SectionHead title="Spending" to="/spend" />
            <div className="today-money">
              <div>
                <span>Today</span>
                <strong>{money(spentToday)}</strong>
              </div>
              <div>
                <span>This month</span>
                <strong>{money(spentMonth)}</strong>
              </div>
            </div>
            <form className="today-spend" onSubmit={addSpend}>
              <input inputMode="decimal" placeholder="0.00" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input dir="auto" placeholder="What for?" aria-label="What for" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn--sm" disabled={!amount}>
                Add
              </button>
            </form>
          </section>

        </>
      )}

      <footer className="home-footer">
        <span className="muted">{session.user.email}</span>
        <button className="btn btn--ghost btn--sm" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </footer>
    </div>
  )
}

function SectionHead({ title, to, note }) {
  return (
    <div className="today-head">
      <h2>
        {title}
        {note && <span className="muted small"> · {note}</span>}
      </h2>
      <Link to={to} aria-label={`Open ${title}`}>
        Open →
      </Link>
    </div>
  )
}
