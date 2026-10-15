import { useMemo, useState } from 'react'
import { PRAYERS, prayerName } from '../lib/prayer'
import { T, Tr, LOCALE } from '../lib/i18n'
import { chartColors, useTheme } from '../lib/theme'

const W = 340
const H = 168
const PAD = { l: 22, r: 58, t: 14, b: 24 }

const shift = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const label = (day, opts) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE, opts)
}

/**
 * Line chart for the last 30 days (ending today): how many of the 5 prayers were prayed each day (green)
 * and how many of them on time (blue, dashed). Always drawn, even on day one. Hover or tap for a day's numbers.
 */
export default function PrayerChart({ logs, today, days = 30 }) {
  const { green: GREEN, blue: BLUE, ring: RING } = chartColors(useTheme()) // brighter lines in dark mode
  const [hover, setHover] = useState(null)

  const data = useMemo(() => {
    let first = today
    for (const k of logs.keys()) {
      const d = k.split('|')[0]
      if (d < first) first = d
    }
    return Array.from({ length: days }, (_, i) => {
      const day = shift(today, i - (days - 1))
      if (day < first) return { day, prayed: null, onTime: null }
      // today isn't finished: show it only once something is marked, so the line doesn't drop to 0
      if (day === today && !PRAYERS.some((p) => logs.has(`${today}|${p.key}`))) return { day, prayed: null, onTime: null }
      let prayed = 0
      let onTime = 0
      for (const p of PRAYERS) {
        const l = logs.get(`${day}|${p.key}`)
        if (l) {
          prayed++
          if (!l.late) onTime++
        }
      }
      return { day, prayed, onTime }
    })
  }, [logs, today, days])

  const perPrayer = useMemo(() => {
    const tracked = data.filter((d) => d.prayed !== null).map((d) => d.day)
    return PRAYERS.map((p) => {
      let done = 0
      let late = 0
      for (const day of tracked) {
        const l = logs.get(`${day}|${p.key}`)
        if (l) {
          done++
          if (l.late) late++
        }
      }
      return { ...p, done, late, of: tracked.length }
    })
  }, [data, logs])

  const tracked = data.filter((d) => d.prayed !== null)
  const finished = tracked.filter((d) => d.day !== today) // whole days only, for averages
  const todayDone = PRAYERS.filter((p) => logs.has(`${today}|${p.key}`)).length
  const lastIdx = (() => {
    for (let i = days - 1; i >= 0; i--) if (data[i].prayed !== null) return i
    return -1
  })()

  const x = (i) => PAD.l + (i / (days - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / 5) * (H - PAD.t - PAD.b)
  const line = (key) =>
    data
      .map((d, i) => (d[key] === null ? null : `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`))
      .reduce((acc, pt, i) => (!pt ? acc : acc + (i === 0 || data[i - 1][key] === null ? ` M${pt}` : ` L${pt}`)), '')
      .trim()

  // trend: last 7 days vs the 7 before
  const avg = (arr, k) => (arr.length ? arr.reduce((a, d) => a + d[k], 0) / arr.length : null)
  const recent = finished.slice(-7)
  const before = finished.slice(-14, -7)
  const r = avg(recent, 'prayed')
  const b = avg(before, 'prayed')
  let trend = r === null ? T('Your graph starts today · {0} of 5 prayed so far', [todayDone]) : T('{0} of 5 a day this week', [r.toFixed(1)])
  if (r !== null && b !== null && before.length >= 5) {
    const diff = r - b
    trend = Math.abs(diff) < 0.2 ? T('Steady · {0} of 5 a day', [r.toFixed(1)]) : T('{0} · {1} of 5 a day (was {2})', [diff > 0 ? T('Improving') : T('Slipping'), r.toFixed(1), b.toFixed(1)])
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.max(0, Math.min(days - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days - 1))))
    setHover(data[i].prayed === null ? null : i)
  }
  const hv = hover !== null ? data[hover] : null
  const last = lastIdx >= 0 ? data[lastIdx] : null
  // keep the two end labels apart when the lines end close together
  const endY = last ? { prayed: y(last.prayed), onTime: y(last.onTime) } : null
  if (endY && Math.abs(endY.prayed - endY.onTime) < 12) endY.onTime = endY.prayed + 12

  return (
    <figure className="prayer-chart">
      <figcaption className="prayer-chart__head">
        <span className="prayer-chart__legend">{Tr(
            "{0} Prayed {1} On time",
            <span className="lg lg--prayed" />,
            <span className="lg lg--ontime" />
          )}</span>
      </figcaption>
      <p className="habit-chart__info">
        {hv
          ? T("{0} · prayed {1} of 5 · {2} on time", [
          label(hv.day, { weekday: 'short', day: 'numeric', month: 'short' }),
          hv.prayed,
          hv.onTime
        ])
          : trend}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={T("Prayers per day over the last {0} days. {1}.", [days, trend])}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 5].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'hc-axis' : 'hc-grid'} />
            <text x={PAD.l - 6} y={y(v) + 4} className="hc-tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}

        <path d={line('prayed')} fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line('onTime')} fill="none" stroke={BLUE} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />

        {/* a small dot for every day, so even one day shows */}
        {data.map((d, i) =>
          d.prayed === null ? null : (
            <g key={d.day}>
              <circle cx={x(i)} cy={y(d.prayed)} r="2.5" fill={GREEN} />
              <circle cx={x(i)} cy={y(d.onTime)} r="2.5" fill={BLUE} />
            </g>
          )
        )}

        {/* end points + direct labels */}
        {last && (
          <>
            <circle cx={x(lastIdx)} cy={y(last.prayed)} r="4" fill={GREEN} stroke={RING} strokeWidth="2" />
            <circle cx={x(lastIdx)} cy={y(last.onTime)} r="4" fill={BLUE} stroke={RING} strokeWidth="2" />
            <text x={x(lastIdx) + 8} y={endY.prayed + 4} className="hc-tick prayer-chart__end">{Tr("Prayed {0}", last.prayed)}</text>
            <text x={x(lastIdx) + 8} y={endY.onTime + 4} className="hc-tick prayer-chart__end">{Tr("On time {0}", last.onTime)}</text>
          </>
        )}
        {!last && (
          <text x={(PAD.l + W - PAD.r) / 2} y={H / 2} className="hc-tick" textAnchor="middle">{T("Mark a prayer below and your line starts here")}</text>
        )}

        {hv && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} className="hc-cross" />
            <circle cx={x(hover)} cy={y(hv.prayed)} r="5" fill={GREEN} stroke={RING} strokeWidth="2" />
            <circle cx={x(hover)} cy={y(hv.onTime)} r="5" fill={BLUE} stroke={RING} strokeWidth="2" />
          </>
        )}

        <text x={PAD.l} y={H - 5} className="hc-tick">
          {label(data[0].day, { day: 'numeric', month: 'short' })}
        </text>
        <text x={W - PAD.r} y={H - 5} className="hc-tick" textAnchor="end">{T("Today")}</text>
      </svg>

      {tracked.length > 0 && <ul className="prayer-rates" aria-label={T("Each prayer over the same days")}>
        {perPrayer.map((p) => (
          <li key={p.key}>
            <span className="prayer-rates__name">{prayerName(p)}</span>
            <span className="prayer-rates__bar" aria-hidden>
              <span className="is-ontime" style={{ width: `${p.of ? ((p.done - p.late) / p.of) * 100 : 0}%` }} />
              <span className="is-late" style={{ width: `${p.of ? (p.late / p.of) * 100 : 0}%` }} />
            </span>
            <span className="prayer-rates__num">
              {p.done}/{p.of}
              {p.late ? <span className="muted">{T(' · {0} late', [p.late])}</span> : null}
            </span>
          </li>
        ))}
      </ul>}
    </figure>
  );
}
