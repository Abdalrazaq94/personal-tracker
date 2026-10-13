import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRows } from '../lib/useRows'
import { addDays, money, today, ymd } from '../lib/dates'
import { ALL_DAYS, TRIGGERS, WEEKDAYS, dayState, daysLabel, isBad, logOn, planned, stats, success } from '../lib/habits'
import AiPanel from '../components/AiPanel'
import HabitCharts from '../components/HabitCharts'
import { Sheet } from '../components/Collections'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader, Segmented } from '../components/ui'

const NEEDS_UPDATE =
  'The database needs a small update for this: run supabase/migrations/003_habits_v2.sql (and 002 if you haven’t) in the Supabase SQL Editor.'
const needsUpdate = (msg) => /column|schema cache|habits_kind_check|habits_target_check/i.test(msg || '')

export default function Habits() {
  const habits = useRows('habits', { ascending: true })
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // habit being edited
  const [slip, setSlip] = useState(null) // bad habit waiting for a trigger

  useEffect(() => {
    supabase
      .from('habit_logs')
      .select('*')
      .then(({ data, error }) => (error ? setError(error.message) : setLogs(data)))
  }, [])

  /** Change today's log for a habit (count, skipped, resisted, reasons), keeping the other fields. */
  const saveLog = async (habit, patch) => {
    const day = today()
    const current = logOn(logs, habit.id, day)
    const next = { habit_id: habit.id, day, count: current.count, skipped: current.skipped, resisted: current.resisted, reasons: current.reasons, ...patch }
    const prev = logs
    setLogs((l) => {
      const i = l.findIndex((x) => x.habit_id === habit.id && x.day === day)
      if (i === -1) return [...l, next]
      const copy = [...l]
      copy[i] = { ...copy[i], ...next }
      return copy
    })
    const { error } = await supabase.from('habit_logs').upsert(next, { onConflict: 'habit_id,day' })
    if (error) {
      setError(error.message)
      setLogs(prev)
    }
  }

  const plus = (h) => {
    if (isBad(h)) setSlip(h) // ask what triggered it
    else saveLog(h, { count: logOn(logs, h.id, today()).count + 1 })
  }
  const minus = (h) => {
    const cur = logOn(logs, h.id, today())
    if (cur.count === 0) return
    saveLog(h, { count: cur.count - 1, reasons: isBad(h) ? cur.reasons.slice(0, -1) : cur.reasons })
  }

  const shown = habits.rows.filter((h) => filter === 'all' || (filter === 'bad') === isBad(h))
  const onTrack = habits.rows.filter((h) => dayState(h, logs, new Date()) === 'ok').length
  const counts = { good: habits.rows.filter((h) => !isBad(h)).length, bad: habits.rows.filter(isBad).length }
  const shownError = error || habits.error

  return (
    <div className="page">
      <PageHeader title="Habits" subtitle={`${onTrack} of ${habits.rows.length} on track today`} />
      <ErrorBar
        error={needsUpdate(shownError) ? NEEDS_UPDATE : shownError}
        onClose={() => (setError(null), habits.setError(null))}
      />

      <HabitForm
        onSubmit={async (vals) => {
          const ok = await habits.insert(vals)
          return Boolean(ok)
        }}
      />

      {habits.rows.length > 0 && (
        <AiPanel kind="habits" examples={['What triggers my bad habits?', 'Which habit needs the most attention?']}>
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
              onPlus={() => plus(h)}
              onMinus={() => minus(h)}
              onResisted={() => saveLog(h, { resisted: logOn(logs, h.id, today()).resisted + 1 })}
              onSkip={(skipped) => saveLog(h, { skipped })}
              onEdit={() => setEditing(h)}
              onDelete={() => {
                habits.remove(h.id)
                setLogs((l) => l.filter((x) => x.habit_id !== h.id))
              }}
            />
          ))}
        </ul>
      )}

      {editing && (
        <Sheet title="Edit habit" onClose={() => setEditing(null)}>
          <HabitForm
            initial={editing}
            bare
            onSubmit={async (vals) => {
              await habits.update(editing.id, vals)
              setEditing(null)
              return true
            }}
          />
        </Sheet>
      )}

      {slip && (
        <TriggerSheet
          habit={slip}
          onClose={() => setSlip(null)}
          onPick={(reason) => {
            const cur = logOn(logs, slip.id, today())
            saveLog(slip, { count: cur.count + 1, reasons: reason ? [...cur.reasons, reason] : cur.reasons })
            setSlip(null)
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------- add / edit ------------------------------- */

function HabitForm({ initial, onSubmit, bare }) {
  const [kind, setKind] = useState(initial?.kind || 'good')
  const [name, setName] = useState(initial?.name || '')
  const [target, setTarget] = useState(initial ? initial.target : 1)
  const [days, setDays] = useState(initial?.days?.length ? initial.days : ALL_DAYS)
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost) : '')
  const [baseline, setBaseline] = useState(initial?.baseline ? String(initial.baseline) : '')
  const [more, setMore] = useState(Boolean(initial))
  const bad = kind === 'bad'

  const switchKind = (k) => {
    setKind(k)
    if (!initial) setTarget(k === 'good' ? 1 : 0)
  }
  const toggleDay = (n) => setDays((d) => (d.includes(n) ? (d.length > 1 ? d.filter((x) => x !== n) : d) : [...d, n].sort()))

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    const n = Math.max(0, Number(target) || 0)
    const vals = { name: name.trim(), kind, target: bad ? n : Math.max(1, n) }
    // only send the newer fields when they were used, so the form still works before the 003 update
    if (days.length !== 7 || initial) vals.days = days
    if (bad && (cost || baseline || initial)) {
      vals.cost = Math.max(0, Number(String(cost).replace(',', '.')) || 0)
      vals.baseline = Math.max(0, Number(baseline) || 0)
    }
    const ok = await onSubmit(vals)
    if (ok && !initial) {
      setName('')
      setTarget(bad ? 0 : 1)
      setDays(ALL_DAYS)
      setCost('')
      setBaseline('')
      setMore(false)
    }
  }

  return (
    <form className={bare ? 'form' : 'card form'} onSubmit={submit}>
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
          <span>{bad ? 'Habit to break' : 'Habit to build'}</span>
          <input
            dir="auto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={bad ? 'e.g. Smoking, sugar, social media' : 'e.g. Read 10 pages'}
            required
          />
        </label>
        <label className="field">
          <span>{bad ? 'Max / day' : 'Times / day'}</span>
          <input type="number" min={bad ? 0 : 1} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
      </div>

      {!more ? (
        bad && (
          <button type="button" className="link small more-link" onClick={() => setMore(true)}>
            + Track money saved (optional)
          </button>
        )
      ) : (
        <>
          {initial && (
          <div className="field">
            <span>Days · {daysLabel({ days })}</span>
            <div className="weekday-pick">
              {WEEKDAYS.map((w) => (
                <button
                  key={w.n}
                  type="button"
                  className={`wd ${days.includes(w.n) ? 'is-on' : ''}`}
                  aria-pressed={days.includes(w.n)}
                  aria-label={w.long}
                  onClick={() => toggleDay(w.n)}
                >
                  {w.short}
                </button>
              ))}
            </div>
          </div>
          )}
          {bad && (
            <div className="row-2">
              <label className="field">
                <span>Cost each time</span>
                <input inputMode="decimal" placeholder="e.g. 0.75" value={cost} onChange={(e) => setCost(e.target.value)} />
              </label>
              <label className="field">
                <span>Per day before</span>
                <input type="number" min="0" inputMode="numeric" placeholder="e.g. 10" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
              </label>
            </div>
          )}
        </>
      )}

      <p className="muted small">
        {bad
          ? 'Tap + each time it happens and pick what triggered it. The day stays clean while you stay at or under your max (0 = avoid).'
          : 'Tap + each time you do it. The day counts when you reach your target.'}
      </p>
      <div className="form-foot form-foot--end">
        <button className="btn">{initial ? 'Save' : 'Add habit'}</button>
      </div>
    </form>
  )
}

/* ---------------------------- "what triggered it?" ---------------------------- */

function TriggerSheet({ habit, onPick, onClose }) {
  return (
    <Sheet title="What triggered it?" onClose={onClose}>
      <p className="muted small" dir="auto">
        {habit.name} · picking a reason helps the AI find your patterns.
      </p>
      <div className="trigger-grid">
        {TRIGGERS.map((t) => (
          <button key={t} type="button" className="trigger" onClick={() => onPick(t)}>
            {t}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--ghost btn--block" onClick={() => onPick(null)}>
        Just count it
      </button>
    </Sheet>
  )
}

/* --------------------------------- card --------------------------------- */

const BOX = { ok: 'is-full', part: 'is-part', over: 'is-over', skipped: 'is-skip', off: 'is-off' }

function HabitCard({ habit, logs, onPlus, onMinus, onResisted, onSkip, onEdit, onDelete }) {
  const bad = isBad(habit)
  const s = useMemo(() => stats(habit, logs), [habit, logs])
  const log = logOn(logs, habit.id, today())
  const state = dayState(habit, logs, new Date())

  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(new Date(), i - 6)
        const key = ymd(day)
        return { key, label: day.toLocaleDateString(undefined, { weekday: 'narrow' }), c: logOn(logs, habit.id, key).count, state: dayState(habit, logs, day) }
      }),
    [logs, habit]
  )

  const status =
    state === 'skipped'
      ? 'Skipped today'
      : state === 'off'
        ? 'Rest day — not planned today'
        : bad
          ? log.count === 0
            ? 'Clean today ✓'
            : success(habit, log.count)
              ? `Within your limit today (${log.count}/${habit.target})`
              : 'Over your limit today'
          : state === 'ok'
            ? 'Done today ✓'
            : 'Not done yet today'

  return (
    <li className={`item habit ${state === 'ok' ? 'habit--done' : ''} ${bad ? 'habit--bad' : ''}`}>
      <div className="habit__head">
        <div className="habit__headtext">
          <div className="habit__title">
            <h3 dir="auto">{habit.name}</h3>
            <span className={`tag ${bad ? '' : 'tag--solid'}`}>{bad ? 'Bad' : 'Good'}</span>
          </div>
          <p className="muted small">
            {status}
            {(habit.days?.length ?? 7) < 7 && ` · ${daysLabel(habit)}`}
          </p>
        </div>
        <div className="row-actions">
          <button type="button" className="icon-btn" aria-label="Edit habit" title="Edit" onClick={onEdit}>
            ✎
          </button>
          <DeleteButton label={`Delete habit "${habit.name}"`} onClick={onDelete} />
        </div>
      </div>

      {s.milestone && (
        <p className="milestone">
          ★ {s.milestone}-day milestone{s.next ? ` · ${s.next - s.streak} more to ${s.next}` : ''}
        </p>
      )}

      <div className={`habit__counter ${log.skipped ? 'is-dim' : ''}`}>
        <button type="button" className="round-btn" onClick={onMinus} disabled={log.count === 0} aria-label="Minus one">
          −
        </button>
        <div className="habit__today">
          <strong>{log.count}</strong>
          <span className="muted">{bad ? `today · max ${habit.target}` : `/ ${habit.target} today`}</span>
        </div>
        <button type="button" className="round-btn round-btn--solid" onClick={onPlus} aria-label="Plus one">
          +
        </button>
      </div>

      <div className="habit__actions">
        {bad && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onResisted}>
            I resisted{log.resisted ? ` · ${log.resisted}` : ''}
          </button>
        )}
        {planned(habit, new Date()) && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onSkip(!log.skipped)}>
            {log.skipped ? 'Undo skip' : 'Skip today'}
          </button>
        )}
      </div>

      <div className="habit__week">
        {week.map((d) => (
          <div key={d.key} className="day">
            <span className={`day__box ${BOX[d.state] || ''}`} title={d.state}>
              {d.state === 'skipped' ? '–' : d.state === 'ok' && bad ? '✓' : d.c > 0 ? d.c : ''}
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
          <strong>{s.best}</strong>
          <span>best streak</span>
        </div>
        {bad && Number(habit.cost) > 0 ? (
          <div>
            <strong>{money(s.saved30)}</strong>
            <span>saved · 30 days</span>
          </div>
        ) : (
          <div>
            <strong>
              {s.okDays}/{s.trackedDays}
            </strong>
            <span>{bad ? 'clean days' : 'days done'}</span>
          </div>
        )}
      </div>

      {bad && (s.triggers.length > 0 || s.resistedTotal > 0 || Number(habit.cost) > 0) && (
        <div className="habit__insights">
          {s.triggers.length > 0 && (
            <p>
              <b>Top triggers:</b> {s.triggers.slice(0, 3).map((t) => `${t.name} (${t.n})`).join(' · ')}
            </p>
          )}
          {s.resistedTotal > 0 && (
            <p>
              <b>Urges resisted:</b> {s.resistedTotal} · slipped {s.total} times
            </p>
          )}
          {Number(habit.cost) > 0 && (
            <p>
              <b>Money:</b> {money(s.savedAll)} saved in total · {money(s.spent30)} spent on it in 30 days
            </p>
          )}
        </div>
      )}
    </li>
  )
}
