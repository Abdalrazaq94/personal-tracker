import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRows } from '../lib/useRows'
import { useBackToClose } from '../lib/useBack'
import { ErrorBar, PageHeader } from '../components/ui'
import { Markdown } from '../components/AiPanel'
import { callAi } from '../lib/ai'
import PrayerChart from '../components/PrayerChart'
import { METHODS, PRAYERS, clock, currentPrayer, findPlaces, hijri, inWords, nextPrayer, placeToday, timesFor } from '../lib/prayer'

const NEEDS_TABLE =
  'Prayer needs a small database update: in Supabase open SQL Editor, paste the file supabase/migrations/006_prayers.sql and press Run. Then refresh this page.'
const missingTable = (e) => /prayer_logs|relation .* does not exist|schema cache/i.test(e || '')

const shiftDay = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const niceDay = (day, today) => {
  if (day === today) return 'Today'
  if (day === shiftDay(today, -1)) return 'Yesterday'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
}

export default function Commit() {
  const [place, setPlace] = useState(undefined) // undefined = loading, null = not chosen yet
  const [picking, setPicking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [day, setDay] = useState(null)
  const [, tick] = useState(0)
  const { rows, setRows, error, setError } = useRows('prayer_logs', { order: 'day' })

  // the chosen city is kept with your account
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setPlace(data?.user?.user_metadata?.prayer || null))
  }, [])
  // keep "next prayer in …" fresh
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const savePlace = async (p) => {
    const next = { method: 'MoonsightingCommittee', madhab: 'shafi', ...place, ...p }
    setPlace(next)
    setPicking(false)
    const { error } = await supabase.auth.updateUser({ data: { prayer: next } })
    if (error) setError(error.message)
    // the reminder server reads the city from here (ignored if the reminders update isn't installed yet)
    const { data: u } = await supabase.auth.getUser()
    if (u?.user) await supabase.from('user_settings').upsert({ user_id: u.user.id, prayer_place: next, updated_at: new Date().toISOString() })
  }

  const today = place ? placeToday(place.tz) : null
  const shown = day || today

  const logs = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(`${r.day}|${r.prayer}`, r)
    return m
  }, [rows])

  const mark = async (prayer, late) => {
    const k = `${shown}|${prayer}`
    const old = logs.get(k)
    setError(null)
    if (old && old.late === late) {
      // tapping the chosen answer again = not prayed
      setRows((r) => r.filter((x) => x !== old))
      const q = old.id ? supabase.from('prayer_logs').delete().eq('id', old.id) : supabase.from('prayer_logs').delete().eq('day', shown).eq('prayer', prayer)
      const { error } = await q
      if (error) setError(error.message)
      return
    }
    const row = { day: shown, prayer, late }
    setRows((r) => [{ ...old, ...row }, ...r.filter((x) => x !== old)])
    const { data, error } = await supabase.from('prayer_logs').upsert(row, { onConflict: 'user_id,day,prayer' }).select().single()
    if (error) setError(error.message)
    else if (data) setRows((r) => [data, ...r.filter((x) => !(x.day === data.day && x.prayer === data.prayer))])
  }

  const shownError = missingTable(error) ? NEEDS_TABLE : error
  useBackToClose(picking && !!place, () => setPicking(false)) // back closes "Change city"
  useBackToClose(!!day && day !== today, () => setDay(null)) // back from an earlier day returns to today

  return (
    <div className="page">
      <PageHeader title="Commitments" subtitle="Keep the promises you make to yourself" />
      <ErrorBar error={shownError} onClose={() => setError(null)} />

      {place && !picking && <PrayerInsights logs={logs} today={today} />}

      {place === undefined ? (
        <div className="empty muted">Loading…</div>
      ) : !place || picking ? (
        <PlacePicker current={place} onPick={savePlace} onCancel={place ? () => setPicking(false) : null} />
      ) : (
        <PrayerCard
          place={place}
          today={today}
          day={shown}
          setDay={(d) => setDay(d >= today ? null : d)}
          logs={logs}
          mark={mark}
          onChangePlace={() => setPicking(true)}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          savePlace={savePlace}
        />
      )}

      {place && !picking && <PrayerWeek place={place} today={today} logs={logs} onPick={(d) => setDay(d === today ? null : d)} picked={shown} />}

    </div>
  )
}

/* ------------------------------------------------------------------ */

const QUESTIONS = [
  { label: 'How am I doing?', q: '' },
  { label: 'Which prayer do I miss most?', q: 'Which prayer do I miss or delay most, and why might that be?' },
  { label: 'How can I pray Fajr on time?', q: 'Give me a simple plan to pray Fajr on time.' },
  { label: 'Am I improving?', q: 'Am I improving this month? Compare the weeks.' },
]

/** Always at the top: the 30-day line chart, then four AI questions (no typing). */
function PrayerInsights({ logs, today }) {
  const [asked, setAsked] = useState(null)
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')
  const [err, setErr] = useState(null)

  const ask = async (item) => {
    setAsked(item.label)
    setBusy(true)
    setErr(null)
    setAnswer('')
    try {
      const data = await callAi({ kind: 'prayers', question: item.q, today: today })
      setAnswer(data?.text || 'No answer.')
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  return (
    <section className="card prayer-insights">
      <div className="prayer-sec">
        <h2>How it’s going</h2>
        <span className="muted small">last 30 days</span>
      </div>
      <PrayerChart logs={logs} today={today} />
      <div className="prayer-ask">
        <p className="prayer-ask__title">
          <span className="ai-spark" aria-hidden>
            ✦
          </span>{' '}
          Ask the AI
        </p>
        <div className="prayer-ask__chips">
          {QUESTIONS.map((item) => (
            <button key={item.label} type="button" className={`chip${asked === item.label ? ' is-active' : ''}`} disabled={busy} onClick={() => ask(item)}>
              {item.label}
            </button>
          ))}
        </div>
        {busy && <div className="ai-loading">Thinking…</div>}
        {err && <p className="error-text">{err}</p>}
        {answer && !busy && <Markdown text={answer} />}
      </div>
    </section>
  )
}

function PrayerCard({ place, today, day, setDay, logs, mark, onChangePlace, showSettings, setShowSettings, savePlace }) {
  const times = timesFor(place, day)
  const isToday = day === today
  const now = Date.now()
  const next = isToday ? nextPrayer(place, today) : null
  const current = isToday ? currentPrayer(place, today) : null
  const done = PRAYERS.filter((p) => logs.has(`${day}|${p.key}`)).length
  const method = METHODS.find((m) => m.key === place.method)?.label || 'Moonsighting Committee'

  return (
    <section className="card prayer">
      <div className="prayer__head">
        <div>
          <h2>Prayer</h2>
          <p className="muted small">
            {place.name}
            {place.region ? `, ${place.region}` : ''} ·{' '}
            <button className="link small" onClick={onChangePlace}>
              Change city
            </button>
          </p>
        </div>
        <div className="prayer__count" aria-label={`${done} of 5 prayed`}>
          <strong>{done}</strong>/5
        </div>
      </div>

      <div className="prayer__days">
        <button className="icon-btn" aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))}>
          ‹
        </button>
        <div className="prayer__date">
          <strong>{niceDay(day, today)}</strong>
          <span className="muted small">{hijri(day)}</span>
        </div>
        <button className="icon-btn" aria-label="Next day" disabled={isToday} onClick={() => setDay(shiftDay(day, 1))}>
          ›
        </button>
      </div>

      {next && (
        <p className="prayer__next">
          Next: <strong>{next.name}</strong> at {clock(next.at, place.tz)}
          {next.tomorrow ? ' tomorrow' : ''} · in {inWords(next.inMs)}
        </p>
      )}

      <ul className="prayer__list">
        {PRAYERS.map((p) => {
          const log = logs.get(`${day}|${p.key}`)
          const notYet = isToday && times[p.key].getTime() > now
          return (
            <li
              key={p.key}
              className={`prayer-row${log ? ' is-done' : ''}${log?.late ? ' is-late' : ''}${current === p.key && !log ? ' is-now' : ''}`}
            >
              <span className="prayer-row__check" aria-hidden>
                {log ? '✓' : ''}
              </span>
              <span className="prayer-row__name">
                <strong>{p.name}</strong>
                <span dir="rtl" lang="ar">
                  {p.ar}
                </span>
              </span>
              <span className="prayer-row__time">{clock(times[p.key], place.tz)}</span>
              {notYet ? (
                <span className="prayer-row__wait muted small">Not yet</span>
              ) : (
                <span className="prayer-row__acts" role="group" aria-label={`${p.name}: prayed?`}>
                  <button className={log && !log.late ? 'is-on' : ''} aria-pressed={!!log && !log.late} onClick={() => mark(p.key, false)}>
                    On time
                  </button>
                  <button className={log?.late ? 'is-on' : ''} aria-pressed={!!log?.late} onClick={() => mark(p.key, true)}>
                    Late
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="muted small prayer__sunrise">
        Sunrise {clock(times.sunrise, place.tz)} · Tap a chosen answer again to undo.
      </p>

      <button className="link small" onClick={() => setShowSettings(!showSettings)}>
        {showSettings ? 'Hide settings' : `Times: ${method}${place.madhab === 'hanafi' ? ' · Hanafi Asr' : ''}. Change`}
      </button>
      {showSettings && (
        <div className="prayer__settings">
          <label className="field">
            <span>Calculation method</span>
            <select value={place.method || 'MoonsightingCommittee'} onChange={(e) => savePlace({ method: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Asr time</span>
            <div className="segmented segmented--small">
              <button className={place.madhab !== 'hanafi' ? 'is-active' : ''} onClick={() => savePlace({ madhab: 'shafi' })}>
                Standard
              </button>
              <button className={place.madhab === 'hanafi' ? 'is-active' : ''} onClick={() => savePlace({ madhab: 'hanafi' })}>
                Hanafi (later)
              </button>
            </div>
          </div>
          <p className="muted small">Pick the method your local mosque uses so the times match its timetable.</p>
        </div>
      )}
    </section>
  )
}

function PrayerWeek({ place, today, logs, onPick, picked }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6))
  let prayed = 0
  let late = 0
  let possible = 0
  for (const d of days) {
    const t = d === today ? timesFor(place, d) : null
    for (const p of PRAYERS) {
      if (t && t[p.key].getTime() > Date.now()) continue
      possible++
      const l = logs.get(`${d}|${p.key}`)
      if (l) {
        prayed++
        if (l.late) late++
      }
    }
  }
  // days in a row with all 5 prayed (today counts once it's complete)
  let streak = 0
  for (let i = 0; i < 400; i++) {
    const d = shiftDay(today, -i)
    const all = PRAYERS.every((p) => logs.has(`${d}|${p.key}`))
    if (all) streak++
    else if (i === 0) continue
    else break
  }

  return (
    <section className="card">
      <div className="prayer-sec">
        <h2>Last 7 days</h2>
        <span className="muted small">
          {prayed} of {possible} prayed{late ? ` · ${late} late` : ''}
          {streak > 1 ? ` · ${streak} full days in a row` : ''}
        </span>
      </div>
      <div className="prayer-week">
        <span />
        {days.map((d) => {
          const [y, m, dd] = d.split('-').map(Number)
          return (
            <button key={d} className={`prayer-week__day${d === picked ? ' is-on' : ''}`} onClick={() => onPick(d)}>
              {new Date(y, m - 1, dd).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
            </button>
          )
        })}
        {PRAYERS.map((p) => (
          <Row key={p.key} p={p} days={days} logs={logs} place={place} today={today} />
        ))}
      </div>
      <p className="prayer-legend muted small">
        <span className="prayer-dot is-done" /> On time <span className="prayer-dot is-late" /> Late <span className="prayer-dot" /> Not marked
      </p>
    </section>
  )
}

function Row({ p, days, logs, place, today }) {
  const t = timesFor(place, today)
  return (
    <>
      <span className="prayer-week__name">{p.name}</span>
      {days.map((d) => {
        const l = logs.get(`${d}|${p.key}`)
        const future = d === today && t[p.key].getTime() > Date.now()
        const cls = l ? (l.late ? 'is-late' : 'is-done') : future ? 'is-future' : ''
        return <span key={d} className={`prayer-dot ${cls}`} title={`${p.name} ${d}: ${l ? (l.late ? 'late' : 'on time') : future ? 'not yet' : 'not marked'}`} />
      })}
    </>
  )
}

function PlacePicker({ current, onPick, onCancel }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setBusy(true)
      setMsg('')
      try {
        const r = await findPlaces(q)
        setResults(r)
        if (!r.length) setMsg('No city found. Check the spelling.')
      } catch (e) {
        setMsg(e.message)
      }
      setBusy(false)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const useMyLocation = () => {
    if (!navigator.geolocation) return setMsg('This browser can’t share your location.')
    setMsg('Finding you…')
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onPick({
          name: 'My location',
          region: '',
          lat: Math.round(pos.coords.latitude * 1000) / 1000,
          lon: Math.round(pos.coords.longitude * 1000) / 1000,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      () => setMsg('Location was not allowed. Search for your city instead.'),
      { timeout: 15000 }
    )
  }

  return (
    <section className="card prayer-pick">
      <h2>{current ? 'Change city' : 'Prayer times: choose your city'}</h2>
      <p className="muted small">Search any city in the world. The 5 prayer times are calculated for it every day.</p>
      <input autoFocus dir="auto" placeholder="e.g. Glasgow" value={q} onChange={(e) => setQ(e.target.value)} aria-label="City" />
      {busy && <p className="muted small">Searching…</p>}
      {results.length > 0 && (
        <ul className="prayer-pick__list">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button onClick={() => onPick(r)}>
                <strong>{r.name}</strong>
                <span className="muted small">{r.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="muted small">{msg}</p>}
      <div className="prayer-pick__acts">
        <button className="btn btn--ghost btn--sm" onClick={useMyLocation}>
          Use my location
        </button>
        {onCancel && (
          <button className="link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  )
}
