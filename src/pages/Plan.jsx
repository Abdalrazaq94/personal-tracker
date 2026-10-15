import { useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import { addDays, dayLabel, today, tomorrow, ymd } from '../lib/dates'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader, Segmented } from '../components/ui'
import { REMIND } from '../components/TodayAI'

/** The moment a plan is due (local time), or null if it has no time. */
const dueAt = (p) => (p.plan_time ? new Date(`${p.plan_date}T${String(p.plan_time).slice(0, 5)}:00`).getTime() : null)

export default function Plan() {
  const { rows, loading, error, setError, insert, update, remove } = useRows('plans', { order: 'plan_date', ascending: true })
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(tomorrow())
  const [time, setTime] = useState('')
  const [important, setImportant] = useState(false)
  const [remind, setRemind] = useState(0)
  const [view, setView] = useState('tomorrow')

  const shown = useMemo(() => {
    const t = today()
    const tm = tomorrow()
    const weekEnd = ymd(addDays(new Date(), 7))
    let list = rows
    if (view === 'tomorrow') list = rows.filter((r) => r.plan_date === tm)
    else if (view === 'week') list = rows.filter((r) => r.plan_date >= t && r.plan_date <= weekEnd)
    else list = rows.filter((r) => r.plan_date >= t || !r.done) // upcoming + anything unfinished
    const map = new Map()
    ;[...list]
      .sort((a, b) =>
        a.plan_date !== b.plan_date
          ? a.plan_date < b.plan_date ? -1 : 1
          : a.done - b.done || (a.plan_time || '99').localeCompare(b.plan_time || '99')
      )
      .forEach((r) => {
        const key = r.plan_date < t ? 'overdue' : r.plan_date
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(r)
      })
    return [...map.entries()]
  }, [rows, view])

  const add = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    const extra = { ...(important ? { important: true } : {}), ...(time && remind ? { remind_before: remind } : {}) }
    let ok = await insert({ title: title.trim(), plan_date: date, ...(time ? { plan_time: time } : {}), ...extra })
    if (!ok && (time || important)) {
      // database not updated for times yet: keep the time in the title
      setError(null)
      ok = await insert({ title: `${title.trim()} · ${time}`, plan_date: date })
    }
    if (ok) {
      setTitle('')
      setTime('')
      setImportant(false)
      setRemind(0)
    }
  }

  // stop the reminder for an hour, or move the plan to tomorrow (same time)
  const postpone = (p, how) => {
    if (how === 'hour') return update(p.id, { snoozed_until: new Date(Date.now() + 3600e3).toISOString() })
    const d = new Date(`${p.plan_date}T00:00:00`)
    d.setDate(d.getDate() + 1)
    return update(p.id, { plan_date: ymd(d < new Date(today() + 'T00:00:00') ? addDays(new Date(), 1) : d), notify_count: 0, last_notified: null, snoozed_until: null })
  }

  const quick = [
    { label: 'Today', value: today() },
    { label: 'Tomorrow', value: tomorrow() },
    { label: 'In 2 days', value: ymd(addDays(new Date(), 2)) },
  ]

  return (
    <div className="page">
      <PageHeader title="Plan" subtitle="Plan tomorrow and the week ahead" />
      <ErrorBar error={error} onClose={() => setError(null)} />

      <form className="card form" onSubmit={add}>
        <label className="field">
          <span>Task</span>
          <input dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What will you do?" required />
        </label>
        <div className="field">
          <span>When</span>
          <div className="when">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                className={`chip ${date === q.value ? 'is-active chip--solid' : ''}`}
                onClick={() => setDate(q.value)}
              >
                {q.label}
              </button>
            ))}
            <input type="date" className="date-inline" value={date} min={today()} onChange={(e) => setDate(e.target.value || tomorrow())} />
            <input type="time" className="date-inline" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" title="Time (optional)" />
          </div>
        </div>
        <div className="plan-opts">
          <label className="qa-check">
            <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} /> Important
          </label>
          {time && (
            <select value={remind} onChange={(e) => setRemind(Number(e.target.value))} aria-label="Remind me">
              {REMIND.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="form-foot form-foot--end">
          <button className="btn">Add to plan</button>
        </div>
      </form>

      <Segmented
        small
        value={view}
        onChange={setView}
        options={[
          { value: 'tomorrow', label: 'Tomorrow' },
          { value: 'week', label: 'Next 7 days' },
          { value: 'all', label: 'All' },
        ]}
      />

      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>Nothing planned here yet.</Empty>
      ) : (
        shown.map(([key, items]) => (
          <section key={key} className="group">
            <h2 className="group__title">
              <span>{key === 'overdue' ? 'Overdue' : dayLabel(key)}</span>
              <span>
                {items.filter((x) => x.done).length}/{items.length}
              </span>
            </h2>
            <ul className="list list--tight">
              {items.map((p) => (
                <li key={p.id} className={`item plan ${p.done ? 'plan--done' : ''}`}>
                  <button
                    type="button"
                    className={`check ${p.done ? 'is-on' : ''}`}
                    aria-label={p.done ? 'Mark not done' : 'Mark done'}
                    onClick={() => update(p.id, { done: !p.done })}
                  >
                    {p.done ? '✓' : ''}
                  </button>
                  <span className="plan__title" dir="auto">
                    {p.plan_time && <strong className="plan__time">{String(p.plan_time).slice(0, 5)}</strong>}
                    {p.important && <span className="plan__imp" title="Important">!</span>}
                    {p.title}
                    {key === 'overdue' && <small className="muted"> · {dayLabel(p.plan_date)}</small>}
                    {!p.done && dueAt(p) && dueAt(p) <= Date.now() && (
                      <span className="plan__postpone">
                        <button type="button" className="chip" onClick={() => postpone(p, 'hour')}>
                          Postpone 1 h
                        </button>
                        <button type="button" className="chip" onClick={() => postpone(p, 'tomorrow')}>
                          Tomorrow
                        </button>
                      </span>
                    )}
                  </span>
                  <DeleteButton label="Delete this plan" onClick={() => remove(p.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
