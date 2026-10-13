import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRows } from '../lib/useRows'
import { addDays, today, ymd } from '../lib/dates'
import { countOn, isBad, startDay, stats, success } from '../lib/habits'
import AiPanel from '../components/AiPanel'
import HabitCharts from '../components/HabitCharts'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader, Segmented } from '../components/ui'

export default function Habits() {
  const habits = useRows('habits', { ascending: true })
  const [logs, setLogs] = useState([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState('good')
  const [target, setTarget] = useState(1)
  const [filter, setFilter] = useState('all')
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
    const n = Math.max(0, Number(target) || 0)
    const ok = await habits.insert({ name: name.trim(), kind, target: kind === 'good' ? Math.max(1, n) : n })
    if (ok) {
      setName('')
      setTarget(kind === 'good' ? 1 : 0)
    }
  }

  const switchKind = (k) => {
    setKind(k)
    setTarget(k === 'good' ? 1 : 0)
  }

  const shown = habits.rows.filter((h) => filter === 'all' || (filter === 'bad') === isBad(h))
  const onTrack = habits.rows.filter((h) => success(h, countOn(logs, h.id, today()))).length
  const counts = {
    good: habits.rows.filter((h) => !isBad(h)).length,
    bad: habits.rows.filter(isBad).length,
  }

  return (
    <div className="page">
      <PageHeader title="Habits" subtitle={`${onTrack} of ${habits.rows.length} on track today`} />
      <ErrorBar
        error={
          /'kind' column|column .*kind|habits_target_check/i.test(habits.error || '')
            ? 'The database needs a small update for good/bad habits: run supabase/migrations/002_good_bad_habits.sql in the Supabase SQL Editor.'
            : error || habits.error
        }
        onClose={() => (setError(null), habits.setError(null))}
      />

      <form className="card form" onSubmit={add}>
        <Segmented
          value={kind}
          onChange={switchKind}
          options={[
            { value: 'good', label: '＋ Good habit' },
            { value: 'bad', label: '− Bad habit' },
          ]}
        />
        <div className="row-2 row-2--wide-first">
          <label className="field">
            <span>{kind === 'good' ? 'Habit to build' : 'Habit to break'}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'good' ? 'e.g. Read 10 pages' : 'e.g. Smoking, sugar, social media'}
              required
            />
          </label>
          <label className="field">
            <span>{kind === 'good' ? 'Times / day' : 'Max / day'}</span>
            <input
              type="number"
              min={kind === 'good' ? 1 : 0}
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        </div>
        <p className="muted small">
          {kind === 'good'
            ? 'Tap + each time you do it. The day counts when you reach your target.'
            : 'Tap + each time it happens. The day stays clean while you stay at or under your max (0 = avoid completely).'}
        </p>
        <div className="form-foot form-foot--end">
          <button className="btn">Add habit</button>
        </div>
      </form>

      {habits.rows.length > 0 && (
        <AiPanel kind="habits" examples={['Which habit needs the most attention?', 'How can I keep my streaks going?']}>
          <HabitCharts habits={habits.rows} logs={logs} />
        </AiPanel>
      )}

      {counts.good > 0 && counts.bad > 0 && (
        <Segmented
          small
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: habits.rows.length },
            { value: 'good', label: 'Good', count: counts.good },
            { value: 'bad', label: 'Bad', count: counts.bad },
          ]}
        />
      )}

      {habits.loading ? (
        <Loading />
      ) : habits.rows.length === 0 ? (
        <Empty>No habits yet. Add a good habit to build or a bad habit to break.</Empty>
      ) : (
        <ul className="list">
          {shown.map((h) => (
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

function HabitCard({ habit, logs, onCount, onDelete }) {
  const bad = isBad(habit)
  const s = useMemo(() => stats(habit, logs), [habit, logs])
  const week = useMemo(() => {
    const start = startDay(habit)
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(new Date(), i - 6)
      const key = ymd(day)
      const c = countOn(logs, habit.id, key)
      const before = key < start
      return {
        key,
        label: day.toLocaleDateString(undefined, { weekday: 'narrow' }),
        c,
        state: before ? 'none' : success(habit, c) ? 'ok' : bad ? 'over' : c > 0 ? 'part' : 'none',
      }
    })
  }, [logs, habit, bad])

  const todayCount = countOn(logs, habit.id, today())
  const ok = success(habit, todayCount)
  const status = bad
    ? todayCount === 0
      ? 'Clean today ✓'
      : ok
        ? `Within your limit today (${todayCount}/${habit.target})`
        : 'Over your limit today'
    : ok
      ? 'Done today ✓'
      : 'Not done today'

  return (
    <li className={`item habit ${ok ? 'habit--done' : ''} ${bad ? 'habit--bad' : ''}`}>
      <div className="habit__head">
        <div>
          <div className="habit__title">
            <h3 dir="auto">{habit.name}</h3>
            <span className={`tag ${bad ? '' : 'tag--solid'}`}>{bad ? 'Bad' : 'Good'}</span>
          </div>
          <p className="muted small">{status}</p>
        </div>
        <DeleteButton label={`Delete habit "${habit.name}"`} onClick={onDelete} />
      </div>

      <div className="habit__counter">
        <button type="button" className="round-btn" onClick={() => onCount(todayCount - 1)} disabled={todayCount === 0} aria-label="Minus one">
          −
        </button>
        <div className="habit__today">
          <strong>{todayCount}</strong>
          <span className="muted">{bad ? `today · max ${habit.target}` : `/ ${habit.target} today`}</span>
        </div>
        <button type="button" className="round-btn round-btn--solid" onClick={() => onCount(todayCount + 1)} aria-label="Plus one">
          +
        </button>
      </div>

      <div className="habit__week">
        {week.map((d) => (
          <div key={d.key} className="day">
            <span className={`day__box ${d.state === 'ok' ? 'is-full' : d.state === 'part' ? 'is-part' : d.state === 'over' ? 'is-over' : ''}`}>
              {d.state === 'ok' && bad ? '✓' : d.c > 0 ? d.c : ''}
            </span>
            <span className="day__label">{d.label}</span>
          </div>
        ))}
      </div>

      <div className="stats-row">
        <div>
          <strong>{s.streak}</strong>
          <span>{bad ? 'clean streak' : 'day streak'}</span>
        </div>
        <div>
          <strong>
            {s.okDays}/{s.trackedDays}
          </strong>
          <span>{bad ? 'clean days' : 'days done'}</span>
        </div>
        <div>
          <strong>{s.total}</strong>
          <span>{bad ? 'times slipped' : 'times total'}</span>
        </div>
      </div>
    </li>
  )
}
