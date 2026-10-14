import { useMemo, useState } from 'react'
import { PRAYERS } from '../lib/prayer'

const W = 340
const H = 168
const PAD = { l: 22, r: 58, t: 14, b: 24 }
const GREEN = '#2f7a3f' // prayed
const BLUE = '#2f5d93' // on time (dashed)

const shift = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const label = (day, opts) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts)
}

/**
 * Line chart for the last 30 full days (ending yesterday): how many of the 5 prayers were prayed each day (green)
 * and how many of them on time (blue, dashed). Hover or tap for a day's numbers.
 */
export default function PrayerChart({ logs, today, days = 30 }) {
  const [hover, setHover] = useState(null)

  const data = useMemo(() => {
    let first = today
    for (const k of logs.keys()) {
      const d = k.split('|')[0]
      if (d < first) first = d
    }
    // the chart ends yesterday: today isn't finished yet
    return Array.from({ length: days }, (_, i) => {
      const day = shift(today, i - days)
      if (day < first) return { day, prayed: null, onTime: null }
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
  const todayDone = PRAYERS.filter((p) => logs.has(`${today}|${p.key}`)).length
  if (tracked.length < 2)
    return <p className="muted small">The graph appears after 2 days of marking your prayers.</p>

  const x = (i) => PAD.l + (i / (days - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / 5) * (H - PAD.t - PAD.b)
  const line = (key) =>
    data
      .map((d, i) => (d[key] === null ? null : `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`))
      .reduce((acc, pt, i) => (!pt ? acc : acc + (i === 0 || data[i - 1][key] === null ? ` M${pt}` : ` L${pt}`)), '')
      .trim()

  // trend: last 7 days vs the 7 before
  const avg = (arr, k) => (arr.length ? arr.reduce((a, d) => a + d[k], 0) / arr.length : null)
  const recent = tracked.slice(-7)
  const before = tracked.slice(-14, -7)
  const r = avg(recent, 'prayed')
  const b = avg(before, 'prayed')
  let trend = `${r.toFixed(1)} of 5 a day this week`
  if (b !== null && before.length >= 5) {
    const diff = r - b
    trend = Math.abs(diff) < 0.2 ? `Steady · ${r.toFixed(1)} of 5 a day` : `${diff > 0 ? 'Improving' : 'Slipping'} · ${r.toFixed(1)} of 5 a day (was ${b.toFixed(1)})`
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.max(0, Math.min(days - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days - 1))))
    setHover(data[i].prayed === null ? null : i)
  }
  const hv = hover !== null ? data[hover] : null
  const last = data[days - 1]
  // keep the two end labels apart when the lines end close together
  const endY = { prayed: y(last.prayed), onTime: y(last.onTime) }
  if (Math.abs(endY.prayed - endY.onTime) < 12) endY.onTime = endY.prayed + 12

  return (
    <figure className="prayer-chart">
      <figcaption className="prayer-chart__head">
        <span className="prayer-chart__legend">
          <span className="lg lg--prayed" /> Prayed <span className="lg lg--ontime" /> On time
        </span>
      </figcaption>
      <p className="habit-chart__info">
        {hv
          ? `${label(hv.day, { weekday: 'short', day: 'numeric', month: 'short' })} · prayed ${hv.prayed} of 5 · ${hv.onTime} on time`
          : trend}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Prayers per day over the last ${days} days. ${trend}.`}
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

        {/* end points + direct labels */}
        <circle cx={x(days - 1)} cy={y(last.prayed)} r="4" fill={GREEN} stroke="#fff" strokeWidth="2" />
        <circle cx={x(days - 1)} cy={y(last.onTime)} r="4" fill={BLUE} stroke="#fff" strokeWidth="2" />
        <text x={x(days - 1) + 8} y={endY.prayed + 4} className="hc-tick prayer-chart__end">
          Prayed {last.prayed}
        </text>
        <text x={x(days - 1) + 8} y={endY.onTime + 4} className="hc-tick prayer-chart__end">
          On time {last.onTime}
        </text>

        {hv && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} className="hc-cross" />
            <circle cx={x(hover)} cy={y(hv.prayed)} r="5" fill={GREEN} stroke="#fff" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(hv.onTime)} r="5" fill={BLUE} stroke="#fff" strokeWidth="2" />
          </>
        )}

        <text x={PAD.l} y={H - 5} className="hc-tick">
          {label(data[0].day, { day: 'numeric', month: 'short' })}
        </text>
        <text x={W - PAD.r} y={H - 5} className="hc-tick" textAnchor="end">
          Yesterday
        </text>
      </svg>

      <p className="muted small">Today so far: {todayDone} of 5 prayed.</p>
      <ul className="prayer-rates" aria-label="Each prayer over the same days">
        {perPrayer.map((p) => (
          <li key={p.key}>
            <span className="prayer-rates__name">{p.name}</span>
            <span className="prayer-rates__bar" aria-hidden>
              <span className="is-ontime" style={{ width: `${((p.done - p.late) / p.of) * 100}%` }} />
              <span className="is-late" style={{ width: `${(p.late / p.of) * 100}%` }} />
            </span>
            <span className="prayer-rates__num">
              {p.done}/{p.of}
              {p.late ? <span className="muted"> · {p.late} late</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
