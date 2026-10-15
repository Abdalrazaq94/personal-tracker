import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { today as todayYmd } from '../lib/dates'
import { previousOf } from '../lib/review'
import { callAi } from '../lib/ai'
import { statusOf } from '../lib/prayerStatus'
import {
  NEEDS_SLEEP_SQL,
  addDays,
  clockFromNoon,
  clockOf,
  hoursText,
  loadSleepGoal,
  minutesSlept,
  nightOf,
  saveSleepGoal,
  sleepStats,
  sleepSummary,
  sleepTableMissing,
  timesFromClock,
  ymdOf,
} from '../lib/sleep'
import { T, Tr, LANG } from '../lib/i18n'
import { DeleteButton, ErrorBar, PageHeader } from '../components/ui'
import PeriodPicker, { fmtDay, usePeriod } from '../components/PeriodPicker'
import SleepChart from '../components/SleepChart'
import { Markdown } from '../components/AiPanel'
import Reveal from '../components/bits/Reveal'

export const FACES = ['😫', '😕', '😐', '🙂', '😄']
const FACE_NAMES = ['Slept very badly', 'Slept badly', 'Slept OK', 'Slept well', 'Slept very well']

export default function Sleep() {
  const pick = usePeriod('week')
  const { period } = pick
  const prev = useMemo(() => previousOf(period), [period.from, period.to, period.kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = todayYmd()

  const [rows, setRows] = useState(null) // nights from the previous period's start to now
  const [recent, setRecent] = useState([]) // the last few nights (for "sleeping now")
  const [extra, setExtra] = useState({})
  const [goal, setGoal] = useState(8)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | row
  const [rateRow, setRateRow] = useState(null) // just woke up: ask "how did you sleep?"
  const [, tick] = useState(0)

  useEffect(() => {
    loadSleepGoal().then(setGoal).catch(() => {})
    const id = setInterval(() => tick((n) => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const loadRecent = async () => {
    const { data, error } = await supabase.from('sleep_logs').select('*').order('night', { ascending: false }).limit(3)
    if (error) setError(sleepTableMissing(error) ? T(NEEDS_SLEEP_SQL) : error.message)
    else setRecent(data || [])
  }
  useEffect(() => {
    loadRecent()
  }, [])

  useEffect(() => {
    let alive = true
    setRows(null)
    ;(async () => {
      const to = period.to < t ? period.to : t
      const [logs, fajr, tasks] = await Promise.all([
        supabase.from('sleep_logs').select('*').gte('night', prev.from).lte('night', to).order('night'),
        supabase.from('prayer_logs').select('*').eq('prayer', 'fajr').gte('day', period.from).lte('day', to),
        supabase.from('tasks').select('done_at').gte('done_at', period.from).not('done_at', 'is', null),
      ])
      if (!alive) return
      if (logs.error) {
        setError(sleepTableMissing(logs.error) ? T(NEEDS_SLEEP_SQL) : logs.error.message)
        setRows([])
        return
      }
      const fajrMap = new Map((fajr.data || []).map((l) => [l.day, statusOf(l)]))
      const done = new Map()
      for (const x of tasks.data || []) {
        const d = ymdOf(new Date(x.done_at))
        done.set(d, (done.get(d) || 0) + 1)
      }
      setExtra({ fajr: fajrMap, tasksDone: done })
      setRows(logs.data || [])
    })()
    return () => {
      alive = false
    }
  }, [period.from, period.to, prev.from, t])

  // ---- the night going on right now (bed time saved, no wake-up yet) ----
  const open = recent.find((r) => !r.wake_at && Date.now() - Date.parse(r.bed_at) < 20 * 3600e3)
  const lastNight = recent.find((r) => r.wake_at)

  const upsertRow = (row) => {
    setRecent((list) => [row, ...list.filter((x) => x.night !== row.night)].sort((a, b) => (a.night < b.night ? 1 : -1)))
    setRows((list) => (list ? [...list.filter((x) => x.night !== row.night), row] : list))
  }

  const goToSleep = async () => {
    setError(null)
    const now = new Date()
    const row = { night: nightOf(now), bed_at: now.toISOString(), wake_at: null, updated_at: now.toISOString() }
    const { data, error } = await supabase.from('sleep_logs').upsert(row, { onConflict: 'user_id,night' }).select().single()
    if (error) return setError(sleepTableMissing(error) ? T(NEEDS_SLEEP_SQL) : error.message)
    upsertRow(data)
  }
  const wakeUp = async () => {
    setError(null)
    const now = new Date()
    if (now - Date.parse(open.bed_at) < 5 * 60000) {
      // tapped by mistake: nothing to save
      await cancelSleep()
      return setError(T('That was less than 5 minutes, so it wasn’t saved.'))
    }
    const { data, error } = await supabase.from('sleep_logs').update({ wake_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', open.id).select().single()
    if (error) return setError(error.message)
    upsertRow(data)
    setRateRow(data)
  }
  const cancelSleep = async () => {
    const { error } = await supabase.from('sleep_logs').delete().eq('id', open.id)
    if (error) return setError(error.message)
    setRecent((l) => l.filter((x) => x.id !== open.id))
    setRows((l) => l && l.filter((x) => x.id !== open.id))
  }
  const rate = async (row, q) => {
    setRateRow(null)
    const { data, error } = await supabase.from('sleep_logs').update({ quality: q, updated_at: new Date().toISOString() }).eq('id', row.id).select().single()
    if (error) return setError(error.message)
    upsertRow(data)
  }
  const remove = async (row) => {
    const { error } = await supabase.from('sleep_logs').delete().eq('id', row.id)
    if (error) return setError(error.message)
    setRecent((l) => l.filter((x) => x.id !== row.id))
    setRows((l) => l && l.filter((x) => x.id !== row.id))
  }

  const now = rows && sleepStats(rows, { from: period.from, to: period.to < t ? period.to : t }, goal, extra)
  const before = rows && sleepStats(rows, prev, goal)
  const future = period.from > t

  return (
    <div className="page sleep">
      <PageHeader title={T('Sleep')} subtitle={T('When you sleep and wake, and what it does to your day')} />
      <ErrorBar error={error} onClose={() => setError(null)} />

      {/* ------------------------------ right now ------------------------------ */}
      <Reveal as="section" className={`card sleep-now ${open ? 'is-asleep' : ''}`}>
        {open ? (
          <>
            <div className="sleep-now__icon" aria-hidden>
              🌙
            </div>
            <div className="sleep-now__text">
              <strong>{T('Sleeping since {0}', [clockOf(open.bed_at)])}</strong>
              <span className="muted small">{T('{0} so far', [hoursText((Date.now() - Date.parse(open.bed_at)) / 60000)])}</span>
            </div>
            <div className="sleep-now__acts">
              <button className="btn" onClick={wakeUp}>
                {T('☀️ I’m awake')}
              </button>
              <button className="link small" onClick={cancelSleep}>
                {T('Cancel')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sleep-now__icon" aria-hidden>
              {new Date().getHours() >= 17 || new Date().getHours() < 4 ? '🌙' : '☀️'}
            </div>
            <div className="sleep-now__text">
              {lastNight ? (
                <>
                  <strong>{T('Last night: {0}', [hoursText(minutesSlept(lastNight))])}</strong>
                  <span className="muted small">
                    {clockOf(lastNight.bed_at)} → {clockOf(lastNight.wake_at)}
                    {lastNight.quality ? ` · ${FACES[lastNight.quality - 1]}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <strong>{T('Track your sleep')}</strong>
                  <span className="muted small">{T('Tap “Going to sleep” at bedtime and “I’m awake” in the morning.')}</span>
                </>
              )}
            </div>
            <div className="sleep-now__acts">
              <button className="btn" onClick={goToSleep}>
                {T('🌙 Going to sleep')}
              </button>
              <button className="link small" onClick={() => setEditing('new')}>
                {T('Add a night')}
              </button>
            </div>
          </>
        )}
        {rateRow && (
          <div className="sleep-rate">
            <span>{T('Good morning! How did you sleep?')}</span>
            <div className="sleep-faces">
              {FACES.map((f, i) => (
                <button key={f} type="button" aria-label={T(FACE_NAMES[i])} title={T(FACE_NAMES[i])} onClick={() => rate(rateRow, i + 1)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
      </Reveal>

      {editing && (
        <NightForm
          row={editing === 'new' ? null : editing}
          today={t}
          onCancel={() => setEditing(null)}
          onSaved={(r) => {
            upsertRow(r)
            setEditing(null)
          }}
          onError={setError}
        />
      )}

      <GoalLine goal={goal} setGoal={setGoal} onError={setError} />

      <PeriodPicker state={pick} />

      {future ? (
        <div className="empty muted">{T('This period hasn’t started yet.')}</div>
      ) : !now ? (
        <div className="empty muted loading-text">{T('Loading…')}</div>
      ) : !now.count ? (
        <div className="empty muted">{T('No nights logged in this period yet.')}</div>
      ) : (
        <>
          <div className="review-kpis sleep-kpis">
            <Kpi label={T('Average sleep')} value={hoursText(now.avgMin)} note={before.count ? diffText(now.avgMin - before.avgMin, true) : null} good={before.count ? now.avgMin >= before.avgMin : null} />
            <Kpi label={T('Bedtime')} value={clockFromNoon(now.avgBed)} note={before.count ? shiftText(now.avgBed - before.avgBed) : null} />
            <Kpi label={T('Wake-up')} value={clockFromNoon(now.avgWake)} note={before.count ? shiftText(now.avgWake - before.avgWake) : null} />
            <Kpi
              label={T('Consistency')}
              value={now.consistency == null ? '—' : `${now.consistency}/100`}
              note={now.bedSd != null ? T('±{0} min bedtime', [Math.round(now.bedSd)]) : T('needs 2+ nights')}
              good={before.consistency != null && now.consistency != null ? now.consistency >= before.consistency : null}
            />
          </div>

          <Reveal as="section" className="card review-card">
            <h2>{T('Your nights')}</h2>
            <SleepChart stats={now} period={period} today={t} />
          </Reveal>

          <Reveal as="section" className="card review-card">
            <h2>{T('What stands out')}</h2>
            <ul className="sleep-insights">
              {insights(now).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Reveal>

          <SleepAi period={period} label={pick.label} now={now} before={before} goal={goal} />

          <Reveal as="section" className="card review-card">
            <h2>{T('Nights')}</h2>
            <ul className="sleep-list">
              {[...now.nights].reverse().map((r) => (
                <li key={r.id}>
                  <button type="button" className="sleep-list__main" onClick={() => setEditing(r)}>
                    <span className="sleep-list__day">{fmtDay(r.night, { weekday: 'short', day: 'numeric' })}</span>
                    <span className="sleep-list__times">
                      {clockOf(r.bed_at)} → {clockOf(r.wake_at)}
                    </span>
                    <strong className={r.min >= now.goal - 15 ? 'is-good' : ''}>{hoursText(r.min)}</strong>
                    <span aria-hidden>{r.quality ? FACES[r.quality - 1] : ''}</span>
                  </button>
                  <DeleteButton label={T('Delete this night')} onClick={() => remove(r)} />
                </li>
              ))}
            </ul>
          </Reveal>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

const diffText = (min, more) => {
  if (Math.abs(min) < 5) return T('same as before')
  return min > 0 ? T(more ? '{0} more than before' : '{0} later than before', [hoursText(min)]) : T(more ? '{0} less than before' : '{0} earlier than before', [hoursText(-min)])
}
const shiftText = (min) => (Math.abs(min) < 5 ? T('same as before') : min > 0 ? T('{0} later than before', [hoursText(min)]) : T('{0} earlier than before', [hoursText(-min)]))

function Kpi({ label, value, note, good }) {
  return (
    <div className="review-kpi">
      <span className="review-kpi__label">{label}</span>
      <strong className="review-kpi__value">{value}</strong>
      <span className={`review-kpi__delta ${good == null ? '' : good ? 'is-good' : 'is-bad'}`}>{note || T('nothing to compare')}</span>
    </div>
  )
}

/** Short, plain findings worked out on the phone (the AI goes deeper). */
function insights(s) {
  const out = []
  out.push(
    Tr('You slept {0} on average and met your {1} goal on {2} of {3} nights.', <b>{hoursText(s.avgMin)}</b>, hoursText(s.goal), <b>{s.metGoal}</b>, s.count)
  )
  if (s.debt >= 60) out.push(Tr('Altogether you were {0} short of your goal.', <b>{hoursText(s.debt)}</b>))
  if (s.consistency != null)
    out.push(
      s.consistency >= 70
        ? Tr('Your times are steady (bedtime varies by about {0}). Keep it up.', <b>{T('{0} min', [Math.round(s.bedSd)])}</b>)
        : Tr('Your bedtime varies by about {0}. A steadier bedtime usually makes waking up easier.', <b>{T('{0} min', [Math.round(s.bedSd)])}</b>)
    )
  if (s.jetLag != null && Math.abs(s.jetLag) >= 45)
    out.push(Tr('At weekends your sleep shifts by {0} (you wake up at {1} instead of {2}).', <b>{hoursText(Math.abs(s.jetLag))}</b>, clockFromNoon(s.weekendWake), clockFromNoon(s.weekdayWake)))
  if (s.fajr)
    out.push(
      Tr(
        'On mornings you prayed Fajr on time you went to bed at {0}, and at {1} on the other mornings.',
        <b>{clockFromNoon(s.fajr.onBed)}</b>,
        <b>{clockFromNoon(s.fajr.offBed)}</b>
      )
    )
  if (s.tasks && Math.abs(s.tasks.good - s.tasks.short) >= 0.5)
    out.push(
      Tr('After a good night you finished {0} tasks on average, after a short night {1}.', <b>{s.tasks.good.toFixed(1)}</b>, <b>{s.tasks.short.toFixed(1)}</b>)
    )
  if (s.count >= 3)
    out.push(
      Tr(
        'Longest: {0} ({1}). Shortest: {2} ({3}).',
        <b>{hoursText(s.longest.min)}</b>,
        fmtDay(s.longest.night, { weekday: 'short', day: 'numeric', month: 'short' }),
        <b>{hoursText(s.shortest.min)}</b>,
        fmtDay(s.shortest.night, { weekday: 'short', day: 'numeric', month: 'short' })
      )
    )
  return out
}

/* ------------------------------ AI ------------------------------ */

const ASK = [
  { label: 'Why am I tired?', q: 'Why might I feel tired? Look at my sleep length, timing and consistency.' },
  { label: 'Best bedtime for Fajr', q: 'What bedtime and wake-up time would help me pray Fajr on time and still meet my sleep goal?' },
  { label: 'Sleep more regularly', q: 'Give me a simple plan to make my sleep times more regular.' },
]

function SleepAi({ period, label, now, before, goal }) {
  const key = `sleep-ai|${LANG}|${period.from}|${period.to}`
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(key) || ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    try {
      setText(localStorage.getItem(key) || '')
    } catch {
      setText('')
    }
  }, [key])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [asked, setAsked] = useState(null)

  const run = async (item) => {
    setBusy(true)
    setError(null)
    setAsked(item?.label || null)
    try {
      const r = await callAi({
        kind: 'sleep',
        label,
        from: period.from,
        to: period.to,
        goal,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        summary: sleepSummary(now, before, goal),
        question: item?.q || '',
      })
      setText(r.text)
      if (!item)
        try {
          localStorage.setItem(key, r.text)
        } catch {
          /* fine */
        }
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <Reveal as="section" className="card review-ai sleep-ai">
      <h2>{Tr('{0} Deep analysis', <span className="ai-spark" aria-hidden>✦</span>)}</h2>
      {!text && !busy && <p className="small">{T('The AI looks at your bedtimes, wake-ups, weekends, Fajr and how much you get done, and suggests your best routine.')}</p>}
      <div className="chips-row">
        <button type="button" className={`chip ${!asked && text ? 'is-active chip--solid' : ''}`} disabled={busy} onClick={() => run(null)}>
          {text && !asked ? T('↻ Analyse again') : T('✦ Analyse my sleep')}
        </button>
        {ASK.map((x) => (
          <button key={x.label} type="button" className={`chip ${asked === x.label ? 'is-active chip--solid' : ''}`} disabled={busy} onClick={() => run(x)}>
            {T(x.label)}
          </button>
        ))}
      </div>
      {busy && <div className="ai-loading">{T('Thinking…')}</div>}
      {error && <p className="error-text">{error}</p>}
      {text && !busy && <Markdown text={text} />}
    </Reveal>
  )
}

/* ------------------------------ forms ------------------------------ */

function NightForm({ row, today, onCancel, onSaved, onError }) {
  const [night, setNight] = useState(row?.night || today)
  const [bed, setBed] = useState(row ? clockOf(row.bed_at) : '23:00')
  const [wake, setWake] = useState(row?.wake_at ? clockOf(row.wake_at) : '07:00')
  const [quality, setQuality] = useState(row?.quality || null)
  const [note, setNote] = useState(row?.note || '')
  const [busy, setBusy] = useState(false)

  const preview = (() => {
    try {
      const x = timesFromClock(night, bed, wake)
      return minutesSlept(x)
    } catch {
      return null
    }
  })()

  const save = async (e) => {
    e.preventDefault()
    const times = timesFromClock(night, bed, wake)
    const min = minutesSlept(times)
    if (!(min > 0 && min < 20 * 60)) return onError(T('Check the times: that’s not a possible night.'))
    setBusy(true)
    const payload = { night, ...times, quality, note: note.trim().slice(0, 300), updated_at: new Date().toISOString() }
    const q = row
      ? supabase.from('sleep_logs').update(payload).eq('id', row.id).select().single()
      : supabase.from('sleep_logs').upsert(payload, { onConflict: 'user_id,night' }).select().single()
    const { data, error } = await q
    setBusy(false)
    if (error) return onError(sleepTableMissing(error) ? T(NEEDS_SLEEP_SQL) : /duplicate|unique/i.test(error.message) ? T('That night is already saved. Edit it from the list.') : error.message)
    onSaved(data)
  }

  return (
    <form className="card form sleep-form" onSubmit={save}>
      <h2>{row ? T('Edit night') : T('Add a night')}</h2>
      <label className="field">
        <span>{T('The morning you woke up')}</span>
        <input type="date" value={night} max={addDays(today, 0)} onChange={(e) => e.target.value && setNight(e.target.value)} />
      </label>
      <div className="row-2">
        <label className="field">
          <span>{T('Went to bed')}</span>
          <input type="time" value={bed} onChange={(e) => e.target.value && setBed(e.target.value)} required />
        </label>
        <label className="field">
          <span>{T('Woke up')}</span>
          <input type="time" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} required />
        </label>
      </div>
      <p className="muted small">
        {preview != null && preview > 0 ? T('{0} of sleep (the night before {1})', [hoursText(preview), fmtDay(night, { weekday: 'long', day: 'numeric', month: 'short' })]) : T('Check the times.')}
      </p>
      <div className="field">
        <span>{T('How did you sleep? (optional)')}</span>
        <div className="sleep-faces">
          {FACES.map((f, i) => (
            <button
              key={f}
              type="button"
              className={quality === i + 1 ? 'is-on' : ''}
              aria-pressed={quality === i + 1}
              aria-label={T(FACE_NAMES[i])}
              title={T(FACE_NAMES[i])}
              onClick={() => setQuality(quality === i + 1 ? null : i + 1)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>{T('Note (optional)')}</span>
        <input dir="auto" maxLength={300} placeholder={T('e.g. coffee late, phone in bed, woke up at night')} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="form-foot form-foot--end">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {T('Cancel')}
        </button>
        <button className="btn" disabled={busy}>
          {busy ? '…' : T('Save')}
        </button>
      </div>
    </form>
  )
}

function GoalLine({ goal, setGoal, onError }) {
  const [open, setOpen] = useState(false)
  const choices = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
  return (
    <div className="sleep-goal">
      <span className="muted small">{T('Your goal: {0} a night', [hoursText(goal * 60)])}</span>
      {open ? (
        <div className="chips-row">
          {choices.map((h) => (
            <button
              key={h}
              type="button"
              className={`chip ${h === goal ? 'is-active chip--solid' : ''}`}
              onClick={async () => {
                setGoal(h)
                setOpen(false)
                try {
                  await saveSleepGoal(h)
                } catch (e) {
                  onError(e.message)
                }
              }}
            >
              {hoursText(h * 60)}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="link small" onClick={() => setOpen(true)}>
          {T('Change')}
        </button>
      )}
    </div>
  )
}
