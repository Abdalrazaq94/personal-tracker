import { useEffect, useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import { addDays, dayLabel, parseYmd, today, ymd } from '../lib/dates'
import { appTotals, fmtMins, sortApps } from '../lib/screentime'
import { ErrorBar, PageHeader } from '../components/ui'
import PhoneConnect from '../components/PhoneConnect'

const NEEDS_TABLE =
  'Phone time needs a small database update: in Supabase open SQL Editor, paste the file supabase/migrations/005_screen_time.sql and press Run. Then refresh this page.'
const missingTable = (e) => /screen_time|relation .* does not exist|schema cache/i.test(e || '')

export default function Phone() {
  const { rows, loading, error, setError, reload } = useRows('screen_time', { order: 'day' })
  const [picked, setPicked] = useState(null) // selected day (YYYY-MM-DD)

  // new numbers arrive from the phone every hour: look again every minute while this page is open
  useEffect(() => {
    const t = setInterval(reload, 60000)
    return () => clearInterval(t)
  }, [reload])

  const fromPhone = rows.filter((r) => r.source === 'phone')
  const lastAt = fromPhone.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '')
  const lastUpdate = lastAt ? new Date(lastAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''

  const byDay = useMemo(() => new Map(rows.map((r) => [r.day, r])), [rows])
  const latest = rows[0]?.day
  const day = picked || (byDay.has(today()) ? today() : latest) || today()
  const sel = byDay.get(day)

  // last 7 days ending on the selected day's week (always ends today)
  const week = useMemo(() => {
    const out = []
    for (let i = 6; i >= 0; i--) {
      const d = ymd(addDays(new Date(), -i))
      out.push({ day: d, row: byDay.get(d) })
    }
    return out
  }, [byDay])
  const weekRows = week.map((w) => w.row).filter(Boolean)
  const avg = weekRows.length ? Math.round(weekRows.reduce((t, r) => t + r.total_minutes, 0) / weekRows.length) : 0
  const prevWeek = useMemo(() => {
    const list = []
    for (let i = 13; i >= 7; i--) {
      const r = byDay.get(ymd(addDays(new Date(), -i)))
      if (r) list.push(r)
    }
    return list.length ? Math.round(list.reduce((t, r) => t + r.total_minutes, 0) / list.length) : null
  }, [byDay])
  const topWeek = appTotals(weekRows).slice(0, 6)

  const shownError = missingTable(error) ? NEEDS_TABLE : error

  return (
    <div className="page">
      <PageHeader title="Phone time" subtitle="How long you used your phone, and on which apps" />
      <ErrorBar error={shownError} onClose={() => setError(null)} />

      <PhoneConnect connected={fromPhone.length > 0} lastUpdate={lastUpdate} />

      {loading ? (
        <div className="empty muted">Loading…</div>
      ) : !rows.length ? (
        <div className="empty">No phone time yet. Once Tracker Phone is set up, today’s time shows here by itself.</div>
      ) : (
        <>
          {/* ---------------- the chosen day ---------------- */}
          <section className="card phone-day">
            <div className="phone-day__head">
              <div>
                <p className="muted small">{dayLabel(day)}</p>
                <p className="phone-big">{sel ? fmtMins(sel.total_minutes) : 'No data'}</p>
                {sel && (
                  <p className="muted small">
                    {avg ? compare(sel.total_minutes, avg) : ''}
                    {sel.unlocks ? `${avg ? ' · ' : ''}Unlocked ${sel.unlocks} times` : ''}
                  </p>
                )}
              </div>
            </div>
            {sel?.apps?.length > 0 ? <AppBars apps={sel.apps} total={sel.total_minutes} /> : sel && <p className="muted small">No apps listed for this day.</p>}
          </section>

          {/* ---------------- last 7 days ---------------- */}
          <section className="card">
            <div className="phone-sec">
              <h2>Last 7 days</h2>
              <span className="muted small">
                {avg ? `${fmtMins(avg)} a day` : ''}
                {avg && prevWeek ? ` · ${weekChange(avg, prevWeek)}` : ''}
              </span>
            </div>
            <WeekBars week={week} picked={day} onPick={setPicked} avg={avg} />
          </section>

          {topWeek.length > 0 && (
            <section className="card">
              <div className="phone-sec">
                <h2>Most used this week</h2>
              </div>
              <AppBars apps={topWeek} total={weekRows.reduce((t, r) => t + r.total_minutes, 0)} perDay={weekRows.length} />
            </section>
          )}

          {/* ---------------- older days ---------------- */}
          {rows.length > 7 && (
            <section className="card">
              <div className="phone-sec">
                <h2>All days</h2>
              </div>
              <ul className="phone-days">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button className={r.day === day ? 'is-on' : ''} onClick={() => setPicked(r.day)}>
                      <span>{dayLabel(r.day)}</span>
                      <strong>{fmtMins(r.total_minutes)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

const compare = (m, avg) => {
  const diff = m - avg
  if (Math.abs(diff) < 5) return 'About your daily average'
  return `${fmtMins(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than your average`
}
const weekChange = (avg, prev) => {
  const pct = Math.round(((avg - prev) / prev) * 100)
  if (Math.abs(pct) < 3) return 'same as the week before'
  return `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than the week before`
}

function AppBars({ apps, total, perDay }) {
  const list = sortApps(apps)
  const top = list[0]?.minutes || 1
  return (
    <ul className="phone-apps">
      {list.map((a) => (
        <li key={a.name}>
          <div className="phone-apps__row">
            <span dir="auto" className="phone-apps__name">
              {a.name}
            </span>
            <span className="phone-apps__time">
              {fmtMins(a.minutes)}
              {perDay > 1 && <span className="muted"> · {fmtMins(a.minutes / perDay)}/day</span>}
              {!perDay && total > 0 && <span className="muted"> · {Math.round((a.minutes / total) * 100)}%</span>}
            </span>
          </div>
          <div className="phone-apps__bar">
            <span style={{ width: `${Math.max(2, (a.minutes / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function WeekBars({ week, picked, onPick, avg }) {
  const max = Math.max(60, ...week.map((w) => w.row?.total_minutes || 0))
  const busiest = week.reduce((b, w) => ((w.row?.total_minutes || 0) > (b?.row?.total_minutes || 0) ? w : b), null)
  return (
    <div className="phone-week" role="list">
      {avg > 0 && (
        <div className="phone-week__avg" style={{ bottom: `calc(28px + ${(avg / max) * 140}px)` }}>
          <span>avg {fmtMins(avg)}</span>
        </div>
      )}
      {week.map((w) => {
        const m = w.row?.total_minutes || 0
        const d = parseYmd(w.day)
        return (
          <button
            key={w.day}
            role="listitem"
            className={`phone-week__col ${w.day === picked ? 'is-on' : ''} ${w.row ? '' : 'is-empty'}`}
            onClick={() => w.row && onPick(w.day)}
            title={`${dayLabel(w.day)}: ${w.row ? fmtMins(m) : 'no data'}`}
            aria-label={`${dayLabel(w.day)}: ${w.row ? fmtMins(m) : 'no data'}`}
          >
            <span className="phone-week__val">{w.row && (w === busiest || w.day === picked) ? fmtMins(m) : ''}</span>
            <span className="phone-week__bar" style={{ height: `${w.row ? Math.max(4, (m / max) * 140) : 4}px` }} />
            <span className="phone-week__day">{d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</span>
          </button>
        )
      })}
    </div>
  )
}
