import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRows } from '../lib/useRows'
import { useBackToClose } from '../lib/useBack'
import { ErrorBar, PageHeader } from '../components/ui'
import { Markdown } from '../components/AiPanel'
import { callAi } from '../lib/ai'
import PrayerChart from '../components/PrayerChart'
import { METHODS, PRAYERS, clock, currentPrayer, findPlaces, hijri, inWords, nextPrayer, placeToday, prayerName, timesFor } from '../lib/prayer'
import { T, Tr, isAr, LOCALE } from '../lib/i18n'
import { STATUSES, STATUS_HINT, isPrayed, savePrayerLog, statusLabel, statusOf } from '../lib/prayerStatus'

const NEEDS_TABLE =
  'Prayer needs a small database update: in Supabase open SQL Editor, paste the file supabase/migrations/006_prayers.sql and press Run. Then refresh this page.'
const missingTable = (e) => /prayer_logs|relation .* does not exist|schema cache/i.test(e || '')

const shiftDay = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const niceDay = (day, today) => {
  if (day === today) return T("Today");
  if (day === shiftDay(today, -1)) return T("Yesterday");
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' })
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

  const mark = async (prayer, status) => {
    const k = `${shown}|${prayer}`
    const old = logs.get(k)
    setError(null)
    if (old && statusOf(old) === status) {
      // tapping the chosen answer again = not prayed
      setRows((r) => r.filter((x) => x !== old))
      const q = old.id ? supabase.from('prayer_logs').delete().eq('id', old.id) : supabase.from('prayer_logs').delete().eq('day', shown).eq('prayer', prayer)
      const { error } = await q
      if (error) setError(error.message)
      return
    }
    const row = { day: shown, prayer, status, late: status !== 'ontime' }
    setRows((r) => [{ ...old, ...row }, ...r.filter((x) => x !== old)])
    const { data, error } = await savePrayerLog(supabase, row, { select: true })
    if (error) {
      setError(error.message)
      setRows((r) => (old ? [old, ...r.filter((x) => !(x.day === shown && x.prayer === prayer))] : r.filter((x) => !(x.day === shown && x.prayer === prayer))))
    }
    else if (data) setRows((r) => [data, ...r.filter((x) => !(x.day === data.day && x.prayer === data.prayer))])
  }

  const shownError = missingTable(error) ? NEEDS_TABLE : error
  useBackToClose(picking && !!place, () => setPicking(false)) // back closes "Change city"
  useBackToClose(!!day && day !== today, () => setDay(null)) // back from an earlier day returns to today

  return (
    <div className="page">
      <PageHeader title={T("Commitments")} subtitle={T("Keep the promises you make to yourself")} />
      <ErrorBar error={shownError} onClose={() => setError(null)} />

      {place && !picking && <PrayerInsights logs={logs} today={today} />}

      {place === undefined ? (
        <div className="empty muted">{T("Loading…")}</div>
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
  );
}

/* ------------------------------------------------------------------ */

const QUESTIONS = [
  { label: T("How am I doing?"), q: '' },
  { label: T("Which prayer do I miss most?"), q: 'Which prayer do I miss or delay most, and why might that be?' },
  { label: T("How can I pray Fajr on time?"), q: 'Give me a simple plan to pray Fajr on time.' },
  { label: T("Am I improving?"), q: 'Am I improving this month? Compare the weeks.' },
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
      setAnswer(data?.text || T('No answer.'))
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  return (
    <section className="card prayer-insights">
      <div className="prayer-sec">
        <h2>{T("How it’s going")}</h2>
        <span className="muted small">{T("last 30 days")}</span>
      </div>
      <PrayerChart logs={logs} today={today} />
      <div className="prayer-ask">
        <p className="prayer-ask__title">{Tr("{0} Ask the AI", <span className="ai-spark" aria-hidden>
            ✦
          </span>)}</p>
        <div className="prayer-ask__chips">
          {QUESTIONS.map((item) => (
            <button key={item.label} type="button" className={`chip${asked === item.label ? ' is-active' : ''}`} disabled={busy} onClick={() => ask(item)}>
              {item.label}
            </button>
          ))}
        </div>
        {busy && <div className="ai-loading">{T("Thinking…")}</div>}
        {err && <p className="error-text">{err}</p>}
        {answer && !busy && <Markdown text={answer} />}
      </div>
    </section>
  );
}

function PrayerCard({ place, today, day, setDay, logs, mark, onChangePlace, showSettings, setShowSettings, savePlace }) {
  const times = timesFor(place, day)
  const isToday = day === today
  const now = Date.now()
  const next = isToday ? nextPrayer(place, today) : null
  const current = isToday ? currentPrayer(place, today) : null
  const done = PRAYERS.filter((p) => isPrayed(logs.get(`${day}|${p.key}`))).length
  const method = METHODS.find((m) => m.key === place.method)?.label || 'Moonsighting Committee'

  return (
    <section className="card prayer">
      <div className="prayer__head">
        <div>
          <h2>{T("Prayer")}</h2>
          <p className="muted small">
            {place.name}
            {place.region ? `, ${place.region}` : ''} ·{' '}
            <button className="link small" onClick={onChangePlace}>{T("Change city")}</button>
          </p>
        </div>
        <div className="prayer__count" aria-label={T("{0} of 5 prayed", [done])}>
          <strong>{done}</strong>/5
        </div>
      </div>

      <div className="prayer__days">
        <button className="icon-btn" aria-label={T("Previous day")} onClick={() => setDay(shiftDay(day, -1))}>
          ‹
        </button>
        <div className="prayer__date">
          <strong>{niceDay(day, today)}</strong>
          <span className="muted small">{hijri(day)}</span>
        </div>
        <button className="icon-btn" aria-label={T("Next day")} disabled={isToday} onClick={() => setDay(shiftDay(day, 1))}>
          ›
        </button>
      </div>

      {next && (
        <p className="prayer__next">{Tr(
            "Next: {0} at {1}{2} · in {3}",
            <strong>{prayerName(next)}</strong>,
            clock(next.at, place.tz),
            next.tomorrow ? T(' tomorrow') : '',
            inWords(next.inMs)
          )}</p>
      )}

      <ul className="prayer__list">
        {PRAYERS.map((p) => {
          const log = logs.get(`${day}|${p.key}`)
          const st = statusOf(log)
          const notYet = isToday && times[p.key].getTime() > now
          // still in its time: on time / late. After its time has passed: Qada / didn't pray are offered too.
          const passed =
            !isToday ||
            PRAYERS.findIndex((x) => x.key === p.key) < PRAYERS.findIndex((x) => x.key === current) ||
            (p.key === 'fajr' && now > times.sunrise.getTime()) // Fajr's time ends at sunrise
          const choices = passed || st === 'qada' || st === 'missed' ? STATUSES : ['ontime', 'late']
          return (
            <li
              key={p.key}
              className={`prayer-row${isPrayed(log) ? ' is-done' : ''}${st ? ` is-${st}` : ''}${current === p.key && !log ? ' is-now' : ''}`}
            >
              <span className="prayer-row__check" aria-hidden>
                {st === 'missed' ? '✕' : log ? '✓' : ''}
              </span>
              <span className="prayer-row__name">
                <strong>{prayerName(p)}</strong>
                {!isAr && (
                  <span dir="rtl" lang="ar">
                    {p.ar}
                  </span>
                )}
              </span>
              <span className="prayer-row__time">{clock(times[p.key], place.tz)}</span>
              {notYet ? (
                <span className="prayer-row__wait muted small">{T("Not yet")}</span>
              ) : (
                <span className={`prayer-row__acts${choices.length > 2 ? ' is-four' : ''}`} role="group" aria-label={T('{0}: prayed?', [prayerName(p)])}>
                  {choices.map((c) => (
                    <button key={c} className={`act-${c}${st === c ? ' is-on' : ''}`} aria-pressed={st === c} title={T(STATUS_HINT[c])} onClick={() => mark(p.key, c)}>
                      {statusLabel(c)}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small prayer__sunrise">{Tr(
          "Sunrise {0} · Qada = prayed after its time. Tap a chosen answer again to undo.",
          clock(times.sunrise, place.tz)
        )}</p>

      <button className="link small" onClick={() => setShowSettings(!showSettings)}>
        {showSettings ? T("Hide settings") : T(
          "Times: {0}{1}. Change",
          [method, place.madhab === 'hanafi' ? T(" · Hanafi Asr") : '']
        )}
      </button>
      {showSettings && (
        <div className="prayer__settings">
          <label className="field">
            <span>{T("Calculation method")}</span>
            <select value={place.method || 'MoonsightingCommittee'} onChange={(e) => savePlace({ method: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>{T("Asr time")}</span>
            <div className="segmented segmented--small">
              <button className={place.madhab !== 'hanafi' ? 'is-active' : ''} onClick={() => savePlace({ madhab: 'shafi' })}>{T("Standard")}</button>
              <button className={place.madhab === 'hanafi' ? 'is-active' : ''} onClick={() => savePlace({ madhab: 'hanafi' })}>{T("Hanafi (later)")}</button>
            </div>
          </div>
          <p className="muted small">{T("Pick the method your local mosque uses so the times match its timetable.")}</p>
        </div>
      )}
    </section>
  );
}

function PrayerWeek({ place, today, logs, onPick, picked }) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6))
  let prayed = 0
  let late = 0
  let qada = 0
  let missed = 0
  let possible = 0
  for (const d of days) {
    const t = d === today ? timesFor(place, d) : null
    for (const p of PRAYERS) {
      if (t && t[p.key].getTime() > Date.now()) continue
      possible++
      const st = statusOf(logs.get(`${d}|${p.key}`))
      if (st && st !== 'missed') prayed++
      if (st === 'late') late++
      if (st === 'qada') qada++
      if (st === 'missed') missed++
    }
  }
  // days in a row with all 5 prayed (today counts once it's complete)
  let streak = 0
  for (let i = 0; i < 400; i++) {
    const d = shiftDay(today, -i)
    const all = PRAYERS.every((p) => isPrayed(logs.get(`${d}|${p.key}`)))
    if (all) streak++
    else if (i === 0) continue
    else break
  }

  return (
    <section className="card">
      <div className="prayer-sec">
        <h2>{T("Last 7 days")}</h2>
        <span className="muted small">
          {T('{0} of {1} prayed', [prayed, possible])}{late ? T(" · {0} late", [late]) : ''}{qada ? T(' · {0} Qada', [qada]) : ''}{missed ? T(' · {0} not prayed', [missed]) : ''}
          {streak > 1 ? T(" · {0} full days in a row", [streak]) : ''}
        </span>
      </div>
      <div className="prayer-week">
        <span />
        {days.map((d) => {
          const [y, m, dd] = d.split('-').map(Number)
          return (
            <button key={d} className={`prayer-week__day${d === picked ? ' is-on' : ''}`} onClick={() => onPick(d)}>
              {new Date(y, m - 1, dd).toLocaleDateString(LOCALE, { weekday: 'short' }).slice(0, 2)}
            </button>
          )
        })}
        {PRAYERS.map((p) => (
          <Row key={p.key} p={p} days={days} logs={logs} place={place} today={today} />
        ))}
      </div>
      <p className="prayer-legend muted small">{Tr(
          "{0} On time {1} Late {2} Qada {3} Didn’t pray {4} Not marked",
          <span className="prayer-dot is-ontime" />,
          <span className="prayer-dot is-late" />,
          <span className="prayer-dot is-qada" />,
          <span className="prayer-dot is-missed" />,
          <span className="prayer-dot" />
        )}</p>
    </section>
  );
}

function Row({ p, days, logs, place, today }) {
  const t = timesFor(place, today)
  return (
    <>
      <span className="prayer-week__name">{prayerName(p)}</span>
      {days.map((d) => {
        const st = statusOf(logs.get(`${d}|${p.key}`))
        const future = d === today && t[p.key].getTime() > Date.now()
        const cls = st ? `is-${st}` : future ? 'is-future' : ''
        return <span key={d} className={`prayer-dot ${cls}`} title={`${prayerName(p)} ${d}: ${st ? statusLabel(st) : future ? T('not yet') : T('not marked')}`} />
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
        if (!r.length) setMsg(T("No city found. Check the spelling."))
      } catch (e) {
        setMsg(e.message)
      }
      setBusy(false)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const useMyLocation = () => {
    if (!navigator.geolocation) return setMsg(T("This browser can’t share your location."));
    setMsg(T("Finding you…"))
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        onPick({
          name: T('My location'),
          region: '',
          lat: Math.round(pos.coords.latitude * 1000) / 1000,
          lon: Math.round(pos.coords.longitude * 1000) / 1000,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      () => setMsg(T("Location was not allowed. Search for your city instead.")),
      { timeout: 15000 }
    )
  }

  return (
    <section className="card prayer-pick">
      <h2>{current ? T("Change city") : T("Prayer times: choose your city")}</h2>
      <p className="muted small">{T(
        "Search any city in the world. The 5 prayer times are calculated for it every day."
      )}</p>
      <input autoFocus dir="auto" placeholder={T("e.g. Glasgow")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={T("City")} />
      {busy && <p className="muted small">{T("Searching…")}</p>}
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
        <button className="btn btn--ghost btn--sm" onClick={useMyLocation}>{T("Use my location")}</button>
        {onCancel && (
          <button className="link" onClick={onCancel}>{T("Cancel")}</button>
        )}
      </div>
    </section>
  );
}
