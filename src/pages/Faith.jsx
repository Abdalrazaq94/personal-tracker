import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { today as todayYmd } from '../lib/dates'
import { callAi } from '../lib/ai'
import { faithKey, useLayout } from '../lib/layout'
import {
  EMOJIS,
  IDEAS,
  addDays,
  countMap,
  doneOn,
  dueOn,
  faithOf,
  firstDay,
  nextFriday,
  parseDay,
  practiceStats,
  practicesReport,
  practicesSummary,
  shabbatTimes,
} from '../lib/faith'
import { clock } from '../lib/prayer'
import { T, Tr, LANG, LOCALE, isAr } from '../lib/i18n'
import { DeleteButton, ErrorBar, PageHeader, Segmented } from '../components/ui'
import PeriodPicker, { usePeriod } from '../components/PeriodPicker'
import { Markdown } from '../components/AiPanel'
import Reveal from '../components/bits/Reveal'
import { PlacePicker } from './Commit'
import { PracticeRow, usePractices } from '../components/Practices'
import { AiCat } from '../components/Cat'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] // Monday first
const dayName = (d, style = 'short') => new Date(2026, 0, 4 + d).toLocaleDateString(LOCALE, { weekday: style }) // 4 Jan 2026 was a Sunday
const niceDay = (day, today) =>
  day === today ? T('Today') : day === addDays(today, -1) ? T('Yesterday') : parseDay(day).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })

/* ================================================================== */

export default function Faith() {
  const layout = useLayout()
  const faith = faithKey(layout)
  const info = faithOf(faith)
  const t = todayYmd()
  const { list, logs, error, setError, setCount, save, remove, move } = usePractices(faith)
  const counts = useMemo(() => countMap(logs), [logs])
  const [day, setDay] = useState(t)
  const [editing, setEditing] = useState(false)

  if (faith === 'none' || !info)
    return (
      <div className="page">
        <PageHeader title={T('Faith')} />
        <div className="card empty">
          <p>{T('You chose not to track a faith.')}</p>
          <Link to="/customize" className="btn btn--sm">
            {T('Choose a faith')}
          </Link>
        </div>
      </div>
    )

  return (
    <div className="page faith">
      <PageHeader
        title={`${info.icon} ${T(info.name)}`}
        subtitle={T('Your daily practices, one day at a time')}
        right={
          <Link to="/customize" className="link small">
            {T('Change faith')}
          </Link>
        }
      />
      <ErrorBar error={error} onClose={() => setError(null)} />

      {list === null ? (
        <div className="empty muted loading-text">{T('Loading…')}</div>
      ) : (
        <>
          {faith === 'jewish' && list.some((p) => p.special === 'shabbat') && <ShabbatCard today={t} />}

          <DayCard list={list} counts={counts} day={day} setDay={setDay} today={t} setCount={setCount} onEdit={() => setEditing(true)} faith={faith} />

          {editing && <ManageCard faith={faith} list={list} save={save} remove={remove} move={move} onClose={() => setEditing(false)} />}

          {list.length > 0 && (
            <>
              <WeekCard list={list} counts={counts} today={t} onPick={setDay} picked={day} />
              <StreaksCard list={list} counts={counts} today={t} />
              <FaithReport faith={faith} list={list} counts={counts} today={t} />
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------ one day ------------------------------ */

function DayCard({ list, counts, day, setDay, today, setCount, onEdit, faith }) {
  const due = list.filter((p) => dueOn(p, day) && day >= firstDay(p))
  const other = list.filter((p) => !dueOn(p, day))
  const done = due.filter((p) => doneOn(p, counts, day)).length
  return (
    <Reveal as="section" className="card faith-day">
      <div className="faith-day__nav">
        <button type="button" className="icon-btn" aria-label={T('Previous day')} onClick={() => setDay(addDays(day, -1))}>
          {isAr ? '›' : '‹'}
        </button>
        <div className="faith-day__date">
          <strong>{niceDay(day, today)}</strong>
          <span className="muted small">{due.length ? T('{0} of {1} done', [done, due.length]) : T('Nothing planned')}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={T('Next day')} disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>
          {isAr ? '‹' : '›'}
        </button>
      </div>
      {list.length === 0 ? (
        <div className="faith-empty">
          <p>{faith === 'custom' ? T('Add the practices you want to keep each day: prayer, meditation, reading, fasting…') : T('No practices yet.')}</p>
          <button type="button" className="btn btn--sm" onClick={onEdit}>
            {T('+ Add a practice')}
          </button>
        </div>
      ) : (
        <ul className="faith-list">
          {due.map((p) => (
            <PracticeRow key={p.id} p={p} count={counts.get(`${p.id}|${day}`) || 0} onCount={(n) => setCount(p, day, n)} />
          ))}
        </ul>
      )}
      {other.length > 0 && (
        <p className="muted small faith-other">
          {T('Not planned today: {0}', [other.map((p) => `${p.emoji} ${p.title} (${p.days.map((d) => dayName(d)).join(', ')})`).join(' · ')])}
        </p>
      )}
      {list.length > 0 && (
        <button type="button" className="link small" onClick={onEdit}>
          {T('Edit practices')}
        </button>
      )}
    </Reveal>
  )
}

/* ------------------------------ Shabbat ------------------------------ */

function ShabbatCard({ today }) {
  const [place, setPlace] = useState(undefined)
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setPlace(data?.user?.user_metadata?.prayer || null))
  }, [])
  const savePlace = async (p) => {
    const next = { method: 'MoonsightingCommittee', madhab: 'shafi', ...place, ...p }
    setPlace(next)
    setPicking(false)
    await supabase.auth.updateUser({ data: { prayer: next } })
    const { data: u } = await supabase.auth.getUser()
    if (u?.user) await supabase.from('user_settings').upsert({ user_id: u.user.id, prayer_place: next, updated_at: new Date().toISOString() })
  }
  if (place === undefined) return null
  if (!place || picking) return <PlacePicker current={place} onPick={savePlace} onCancel={place ? () => setPicking(false) : null} />
  const fri = nextFriday(today)
  const s = shabbatTimes(place, fri)
  if (!s) return null
  return (
    <Reveal as="section" className="card shabbat">
      <span className="shabbat__icon" aria-hidden>
        🕯️
      </span>
      <div className="shabbat__text">
        <strong>{fri === today ? T('Shabbat begins tonight') : T('Shabbat this {0}', [parseDay(fri).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })])}</strong>
        <span>{Tr('Candle lighting {0}', <b>{clock(s.candles, place.tz)}</b>)}</span>
        <span className="muted small">{T('Ends about {0} on Saturday (customs differ)', [clock(s.ends, place.tz)])}</span>
        <span className="muted small">
          {place.name}{' '}
          · <button type="button" className="link small" onClick={() => setPicking(true)}>{T('Change city')}</button>
        </span>
      </div>
    </Reveal>
  )
}

/* ------------------------------ last 7 days ------------------------------ */

function WeekCard({ list, counts, today, onPick, picked }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  return (
    <Reveal as="section" className="card">
      <h2 className="faith-sec">{T('Last 7 days')}</h2>
      <div className="faith-week" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(7, 26px)` }}>
        <span />
        {days.map((d) => (
          <button key={d} type="button" className={`prayer-week__day${d === picked ? ' is-on' : ''}`} onClick={() => onPick(d)}>
            {parseDay(d).toLocaleDateString(LOCALE, { weekday: 'narrow' })}
          </button>
        ))}
        {list.map((p) => (
          <Row key={p.id} p={p} days={days} counts={counts} today={today} />
        ))}
      </div>
      <p className="prayer-legend muted small">
        {Tr('{0} Done {1} Not done {2} Not planned', <span className="prayer-dot is-ontime" />, <span className="prayer-dot" />, <span className="prayer-dot is-future" />)}
      </p>
    </Reveal>
  )
}
function Row({ p, days, counts, today }) {
  return (
    <>
      <span className="faith-week__name" dir="auto">
        {p.emoji} {p.title}
      </span>
      {days.map((d) => {
        const planned = dueOn(p, d) && d >= firstDay(p)
        const done = doneOn(p, counts, d)
        const cls = done ? 'is-ontime' : !planned ? 'is-future' : d === today ? '' : ''
        return <span key={d} className={`prayer-dot ${cls}`} title={`${p.title} ${d}: ${done ? T('done') : planned ? T('not done') : T('not planned')}`} />
      })}
    </>
  )
}

/* ------------------------------ streaks ------------------------------ */

function StreaksCard({ list, counts, today }) {
  return (
    <Reveal as="section" className="card">
      <h2 className="faith-sec">{T('Streaks')}</h2>
      {list.map((p) => {
        const s = practiceStats(p, counts, today)
        return (
          <div key={p.id} className="review-meter">
            <div className="review-meter__head">
              <span dir="auto">
                {p.emoji} {p.title}
              </span>
              <strong>{s.streak ? T('🔥 {0} in a row', [s.streak]) : '—'}</strong>
            </div>
            <div className="review-meter__bar" aria-hidden>
              <span style={{ width: `${(s.rate || 0) * 100}%` }} />
            </div>
            <span className="muted small">{s.due ? T('{0} of {1} planned days in the last 30', [s.done, s.due]) : T('Starts counting from today')}</span>
          </div>
        )
      })}
    </Reveal>
  )
}

/* ------------------------------ edit practices ------------------------------ */

function ManageCard({ faith, list, save, remove, move, onClose }) {
  const [form, setForm] = useState(null) // null | 'new' | practice
  return (
    <Reveal as="section" className="card faith-manage">
      <div className="faith-manage__head">
        <h2 className="faith-sec">{T('Your practices')}</h2>
        <button type="button" className="icon-btn" aria-label={T('Close')} onClick={onClose}>
          ×
        </button>
      </div>
      <ul className="cust-list">
        {list.map((p, i) => (
          <li key={p.id}>
            <span className="cust-icon" aria-hidden>
              {p.emoji}
            </span>
            <button type="button" className="cust-text faith-manage__name" onClick={() => setForm(p)}>
              <strong dir="auto">{p.title}</strong>
              <span className="muted small">
                {p.days?.length ? p.days.map((d) => dayName(d)).join(', ') : T('Every day')}
                {p.time ? ` · ${p.time}` : ''}
                {p.remind ? ' · 🔔' : ''}
                {p.kind === 'count' ? ` · ${p.target} ${p.unit}` : ''}
              </span>
            </button>
            <span className="cust-move">
              <button type="button" className="icon-btn" aria-label={T('Move {0} up', [p.title])} disabled={i === 0} onClick={() => move(p, -1)}>
                ↑
              </button>
              <button type="button" className="icon-btn" aria-label={T('Move {0} down', [p.title])} disabled={i === list.length - 1} onClick={() => move(p, 1)}>
                ↓
              </button>
            </span>
            <DeleteButton label={T('Delete {0}', [p.title])} onClick={() => remove(p)} />
          </li>
        ))}
      </ul>
      {form ? (
        <PracticeForm faith={faith} practice={form === 'new' ? null : form} onCancel={() => setForm(null)} onSave={async (row) => (await save(row, form === 'new' ? null : form.id)) && setForm(null)} />
      ) : (
        <button type="button" className="btn btn--sm" onClick={() => setForm('new')}>
          {T('+ Add a practice')}
        </button>
      )}
    </Reveal>
  )
}

function PracticeForm({ faith, practice, onCancel, onSave }) {
  const [title, setTitle] = useState(practice?.title || '')
  const [emoji, setEmoji] = useState(practice?.emoji || '🙏')
  const [kind, setKind] = useState(practice?.kind || 'check')
  const [target, setTarget] = useState(String(practice?.target || 33))
  const [unit, setUnit] = useState(practice?.unit || '')
  const [days, setDays] = useState(practice?.days || [])
  const [time, setTime] = useState(practice?.time || '')
  const [remind, setRemind] = useState(!!practice?.remind)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    await onSave({
      title: title.trim().slice(0, 80),
      emoji,
      kind,
      target: kind === 'count' ? Math.max(1, Math.min(10000, Number(target) || 1)) : 1,
      unit: kind === 'count' ? unit.trim().slice(0, 30) : '',
      days: days.length && days.length < 7 ? [...days].sort() : null,
      time: time || null,
      remind: !!time && remind,
    })
    setBusy(false)
  }
  return (
    <form className="faith-form" onSubmit={submit}>
      <h3>{practice ? T('Edit practice') : T('New practice')}</h3>
      <label className="field">
        <span>{T('Name')}</span>
        <input dir="auto" required maxLength={80} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={T('e.g. Morning prayer')} />
      </label>
      {!practice && (IDEAS[faith] || []).length > 0 && (
        <div className="chips-row">
          {IDEAS[faith].map((x) => (
            <button key={x} type="button" className="chip" onClick={() => setTitle(T(x))}>
              {T(x)}
            </button>
          ))}
        </div>
      )}
      <div className="promise-emojis">
        {EMOJIS.map((x) => (
          <button key={x} type="button" className={emoji === x ? 'is-on' : ''} aria-pressed={emoji === x} onClick={() => setEmoji(x)}>
            {x}
          </button>
        ))}
      </div>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'check', label: T('Tick when done') },
          { value: 'count', label: T('Count (e.g. 108)') },
        ]}
      />
      {kind === 'count' && (
        <div className="row-2">
          <label className="field">
            <span>{T('Target each day')}</span>
            <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span>{T('Counting what? (optional)')}</span>
            <input dir="auto" maxLength={30} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={T('e.g. beads, pages')} />
          </label>
        </div>
      )}
      <div className="field">
        <span>{T('Which days? (none chosen = every day)')}</span>
        <div className="faith-days">
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" className={days.includes(d) ? 'is-on' : ''} aria-pressed={days.includes(d)} onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>
              {dayName(d)}
            </button>
          ))}
        </div>
      </div>
      <div className="row-2">
        <label className="field">
          <span>{T('Time (optional)')}</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="faith-remind">
          <input type="checkbox" className="rem-switch" checked={remind && !!time} disabled={!time} onChange={(e) => setRemind(e.target.checked)} />
          <span>{T('Remind me')}</span>
        </label>
      </div>
      <div className="form-foot form-foot--end">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {T('Cancel')}
        </button>
        <button className="btn" disabled={busy || !title.trim()}>
          {busy ? '…' : T('Save')}
        </button>
      </div>
    </form>
  )
}

/* ------------------------------ report + AI ------------------------------ */

function FaithReport({ faith, list, counts, today }) {
  const pick = usePeriod('month')
  const { period } = pick
  const r = practicesReport(list, counts, period, today)
  return (
    <>
      <h2 className="promise-report__title">{T('Progress report')}</h2>
      <PeriodPicker state={pick} />
      {period.from > today ? (
        <div className="empty muted">{T('This period hasn’t started yet.')}</div>
      ) : !r.rows.length ? (
        <div className="empty muted">{T('Nothing planned in this period yet.')}</div>
      ) : (
        <>
          <Reveal as="section" className="card review-card">
            <p className="review-note">{T('{0} of {1} planned practices done ({2}%)', [r.done, r.due, Math.round((r.rate || 0) * 100)])}</p>
            {r.rows.map(({ p, due, done, rate }) => (
              <div key={p.id} className="review-meter">
                <div className="review-meter__head">
                  <span dir="auto">
                    {p.emoji} {p.title}
                  </span>
                  <strong>{`${Math.round((rate || 0) * 100)}%`}</strong>
                </div>
                <div className="review-meter__bar" aria-hidden>
                  <span style={{ width: `${(rate || 0) * 100}%` }} />
                </div>
                <span className="muted small">{T('{0} of {1} planned days', [done, due])}</span>
              </div>
            ))}
          </Reveal>
          <FaithAi faith={faith} list={list} counts={counts} today={today} period={period} label={pick.label} />
        </>
      )}
    </>
  )
}

function FaithAi({ faith, list, counts, today, period, label }) {
  const key = `faith-ai|${LANG}|${faith}|${period.from}|${period.to}`
  const read = () => {
    try {
      return localStorage.getItem(key) || ''
    } catch {
      return ''
    }
  }
  const [text, setText] = useState(read)
  useEffect(() => setText(read()), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await callAi({ kind: 'faith', faith, label, from: period.from, to: period.to, today, summary: practicesSummary(faith, list, counts, period, today) })
      setText(r.text)
      try {
        localStorage.setItem(key, r.text)
      } catch {
        /* fine */
      }
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  return (
    <Reveal as="section" className="card review-ai">
      <h2>{Tr('{0} AI analysis', <AiCat />)}</h2>
      {!text && !busy && <p className="small">{T('The AI looks at which practices you keep, which days are hardest, and suggests a simple routine. It never gives religious rulings.')}</p>}
      <button type="button" className="btn btn--sm" disabled={busy} onClick={run}>
        {text ? T('↻ Analyse again') : T('✦ Analyse my practices')}
      </button>
      {busy && <div className="ai-loading">{T('Thinking…')}</div>}
      {err && <p className="error-text">{err}</p>}
      {text && !busy && <Markdown text={text} />}
    </Reveal>
  )
}
