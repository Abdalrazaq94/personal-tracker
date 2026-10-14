import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, parseYmd, startOfMonth, today, ymd } from '../lib/dates'
import { dayState, isBad, logOn, planned } from '../lib/habits'
import { SpeakButton } from '../lib/speech'
import { DayBrief, QuickAddAll } from '../components/TodayAI'
import { fmtMins, sortApps } from '../lib/screentime'

const PRIORITY = { doing: 0, todo: 1 }

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

  useEffect(() => {
    const t = today()
    const load = async () => {
      const [tasks, plans, habits, logs, words, spend, links, notes, phone] = await Promise.all([
        supabase.from('tasks').select('*').neq('status', 'done'),
        supabase.from('plans').select('*').lte('plan_date', t).eq('done', false),
        supabase.from('habits').select('*').order('created_at', { ascending: true }),
        supabase.from('habit_logs').select('*').eq('day', t),
        supabase.from('words').select('id, word, translation, status').neq('status', 'memorized'),
        supabase.from('expenses').select('amount, spent_on').gte('spent_on', ymd(startOfMonth())),
        supabase.from('links').select('id', { count: 'exact', head: true }),
        supabase.from('notes').select('id', { count: 'exact', head: true }),
        supabase.from('screen_time').select('day, total_minutes, apps').gte('day', ymd(new Date(Date.now() - 8 * 864e5))),
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
        plans: (plans.data || []).sort((a, b) => (a.plan_date < b.plan_date ? -1 : 1)),
        habits: habits.data || [],
        logs: logs.data || [],
        words: wordsOfTheDay(words.data || []),
        wordsLeft: (words.data || []).length,
        spend: spend.data || [],
        links: links.count || 0,
        notes: notes.count || 0,
        phone: phone.error ? null : phone.data || [], // null = Phone time not set up yet
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

  const shownTasks = d ? d.tasks.slice(0, 6) : []
  const moreTasks = d ? Math.max(0, d.tasks.length - shownTasks.length) : 0

  const items = d
    ? [
        ...shownTasks.map((t) => t.status === 'done'),
        ...d.plans.map((p) => p.done),
        ...goodHabits.map((h) => dayState(h, d.logs, now) === 'ok'),
      ]
    : []
  const doneCount = items.filter(Boolean).length

  const t = today()
  const spentToday = d ? d.spend.filter((x) => x.spent_on === t).reduce((a, x) => a + Number(x.amount), 0) : 0
  const spentMonth = d ? d.spend.reduce((a, x) => a + Number(x.amount), 0) : 0

  return (
    <div className="page">
      <header className="home-header">
        <p className="muted">{date}</p>
        <h1 className="display">{greet}.</h1>
      </header>

      <QuickAddAll onChanged={() => setReload((n) => n + 1)} />
      <DayBrief />

      {error && (
        <div className="error-bar" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {!d ? (
        <div className="empty muted">Loading your day…</div>
      ) : (
        <>
          {items.length > 0 && (
            <div className="today-progress">
              <div className="today-progress__text">
                <strong>
                  {doneCount} of {items.length}
                </strong>{' '}
                done today
                {doneCount === items.length && ' — great work ✓'}
              </div>
              <div className="progress">
                <span style={{ width: `${(doneCount / items.length) * 100}%` }} />
              </div>
            </div>
          )}

          {/* ------------------------------ tasks ------------------------------ */}
          <section className="today-card">
            <SectionHead title="Tasks" to="/tasks" />
            {shownTasks.length === 0 && d.plans.length === 0 ? (
              <p className="muted small">
                Nothing to do. <Link to="/tasks">Add a task</Link> or <Link to="/plan">plan tomorrow</Link>.
              </p>
            ) : (
              <ul className="today-list">
                {d.plans.map((p) => (
                  <li key={`p${p.id}`} className={p.done ? 'is-done' : ''}>
                    <button className={`check ${p.done ? 'is-on' : ''}`} aria-label="Done" onClick={() => donePlan(p)}>
                      {p.done ? '✓' : ''}
                    </button>
                    <span dir="auto" className="today-list__text">
                      {p.title}
                    </span>
                    <span className="tag">
                      {p.plan_date < t
                        ? `Overdue · ${parseYmd(p.plan_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                        : 'Planned'}
                    </span>
                  </li>
                ))}
                {shownTasks.map((task) => (
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
            )}
            {moreTasks > 0 && (
              <Link to="/tasks" className="today-more">
                +{moreTasks} more tasks →
              </Link>
            )}
          </section>

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

          {/* ------------------------------ phone time ------------------------------ */}
          <PhoneCard rows={d.phone} />

          {/* ------------------------------ everything else ------------------------------ */}
          <nav className="today-more-grid" aria-label="More sections">
            <Link to="/plan">Plan tomorrow →</Link>
            <Link to="/notes">Notes · {d.notes}</Link>
            <Link to="/links">Saved links · {d.links}</Link>
            <Link to="/jobs">Jobs applied →</Link>
          </nav>
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

/** Today's phone time; tap for the details. */
function PhoneCard({ rows }) {
  if (rows === null) return null
  const t = today()
  const yesterday = ymd(new Date(Date.now() - 864e5))
  const shown = rows.find((r) => r.day === t) || rows.find((r) => r.day === yesterday)
  const others = rows.filter((r) => r !== shown)
  const avg = others.length ? Math.round(others.reduce((a, r) => a + r.total_minutes, 0) / others.length) : 0
  const diff = shown && avg ? shown.total_minutes - avg : 0
  const top = shown ? sortApps(shown.apps).slice(0, 3) : []
  return (
    <Link to="/phone" className="today-card phone-card" aria-label="Phone time: open details">
      <div className="today-head">
        <h2>Phone time</h2>
        <span className="phone-card__open">Details →</span>
      </div>
      {shown ? (
        <>
          <div className="phone-card__main">
            <strong className="phone-card__big">{fmtMins(shown.total_minutes)}</strong>
            <span className="muted small">
              {shown.day === t ? 'Today' : 'Yesterday'}
              {avg > 0 && (Math.abs(diff) < 5 ? ' · about your average' : ` · ${fmtMins(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than usual`)}
            </span>
          </div>
          {top.length > 0 && (
            <p className="phone-card__apps small">
              {top.map((a) => (
                <span key={a.name}>
                  <span dir="auto">{a.name}</span> {fmtMins(a.minutes)}
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <p className="muted small">No phone time for today yet. Tap to add a screenshot from Digital Wellbeing.</p>
      )}
    </Link>
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
