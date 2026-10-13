import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRows } from '../lib/useRows'
import { addDays, today, ymd } from '../lib/dates'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader } from '../components/ui'

export default function Habits() {
  const habits = useRows('habits', { ascending: true })
  const [logs, setLogs] = useState([])
  const [name, setName] = useState('')
  const [target, setTarget] = useState(1)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('habit_logs')
      .select('*')
      .then(({ data, error }) => (error ? setError(error.message) : setLogs(data)))
  }, [])

  const setCount = async (habit, count) => {
    const day = today()
    count = Math.max(0, count)
    const prev = logs
    setLogs((l) => {
      const i = l.findIndex((x) => x.habit_id === habit.id && x.day === day)
      if (i === -1) return [...l, { habit_id: habit.id, day, count }]
      const copy = [...l]
      copy[i] = { ...copy[i], count }
      return copy
    })
    const { error } = await supabase
      .from('habit_logs')
      .upsert({ habit_id: habit.id, day, count }, { onConflict: 'habit_id,day' })
    if (error) {
      setError(error.message)
      setLogs(prev)
    }
  }

  const add = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const ok = await habits.insert({ name: name.trim(), target: Math.max(1, Number(target) || 1) })
    if (ok) {
      setName('')
      setTarget(1)
    }
  }

  const doneToday = habits.rows.filter((h) => countOn(logs, h.id, today()) >= h.target).length

  return (
    <div className="page">
      <PageHeader title="Habits" subtitle={`${doneToday} of ${habits.rows.length} done today`} />
      <ErrorBar error={error || habits.error} onClose={() => (setError(null), habits.setError(null))} />

      <form className="card form" onSubmit={add}>
        <div className="row-2 row-2--wide-first">
          <label className="field">
            <span>New habit</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Read 10 pages" required />
          </label>
          <label className="field">
            <span>Times / day</span>
            <input type="number" min="1" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>
        <div className="form-foot form-foot--end">
          <button className="btn">Add habit</button>
        </div>
      </form>

      {habits.loading ? (
        <Loading />
      ) : habits.rows.length === 0 ? (
        <Empty>No habits yet. Add one to start tracking.</Empty>
      ) : (
        <ul className="list">
          {habits.rows.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              logs={logs}
              onCount={(n) => setCount(h, n)}
              onDelete={() => {
                habits.remove(h.id)
                setLogs((l) => l.filter((x) => x.habit_id !== h.id))
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

const countOn = (logs, id, day) => logs.find((x) => x.habit_id === id && x.day === day)?.count || 0

function HabitCard({ habit, logs, onCount, onDelete }) {
  const stats = useMemo(() => {
    const mine = logs.filter((x) => x.habit_id === habit.id)
    const total = mine.reduce((a, x) => a + x.count, 0)
    const daysDone = mine.filter((x) => x.count >= habit.target).length
    const done = (d) => countOn(mine, habit.id, ymd(d)) >= habit.target
    // streak: consecutive days ending today (or yesterday if today isn't done yet)
    let d = new Date()
    if (!done(d)) d = addDays(d, -1)
    let streak = 0
    while (done(d)) {
      streak++
      d = addDays(d, -1)
    }
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(new Date(), i - 6)
      const c = countOn(mine, habit.id, ymd(day))
      return { key: ymd(day), label: day.toLocaleDateString(undefined, { weekday: 'narrow' }), c, full: c >= habit.target }
    })
    return { total, daysDone, streak, week }
  }, [logs, habit])

  const todayCount = countOn(logs, habit.id, today())
  const isDone = todayCount >= habit.target

  return (
    <li className={`item habit ${isDone ? 'habit--done' : ''}`}>
      <div className="habit__head">
        <div>
          <h3 dir="auto">{habit.name}</h3>
          <p className="muted small">{isDone ? 'Done today ✓' : 'Not done today'}</p>
        </div>
        <DeleteButton label={`Delete habit "${habit.name}"`} onClick={onDelete} />
      </div>

      <div className="habit__counter">
        <button type="button" className="round-btn" onClick={() => onCount(todayCount - 1)} disabled={todayCount === 0} aria-label="Minus one">
          −
        </button>
        <div className="habit__today">
          <strong>{todayCount}</strong>
          <span className="muted">/ {habit.target} today</span>
        </div>
        <button type="button" className="round-btn round-btn--solid" onClick={() => onCount(todayCount + 1)} aria-label="Plus one">
          +
        </button>
      </div>

      <div className="habit__week">
        {stats.week.map((d) => (
          <div key={d.key} className="day">
            <span className={`day__box ${d.full ? 'is-full' : d.c > 0 ? 'is-part' : ''}`}>{d.c > 0 ? d.c : ''}</span>
            <span className="day__label">{d.label}</span>
          </div>
        ))}
      </div>

      <div className="stats-row">
        <div>
          <strong>{stats.streak}</strong>
          <span>day streak</span>
        </div>
        <div>
          <strong>{stats.daysDone}</strong>
          <span>days done</span>
        </div>
        <div>
          <strong>{stats.total}</strong>
          <span>times total</span>
        </div>
      </div>
    </li>
  )
}
