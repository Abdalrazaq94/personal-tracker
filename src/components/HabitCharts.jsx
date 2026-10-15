import { useMemo, useState } from 'react'
import { isBad, series, success } from '../lib/habits'
import { T } from '../lib/i18n'

const W = 320
const H = 132
const PAD = { l: 26, r: 10, t: 12, b: 22 }

/** One small line chart per habit: daily count for the last 30 days + dashed target / limit line. */
export default function HabitCharts({ habits, logs, days = 30 }) {
  if (!habits.length) return null
  return (
    <div className="habit-charts">
      {habits.map((h) => (
        <HabitChart key={h.id} habit={h} logs={logs} days={days} />
      ))}
    </div>
  )
}

function HabitChart({ habit, logs, days }) {
  const data = useMemo(() => series(habit, logs, days), [habit, logs, days])
  const [hover, setHover] = useState(null)
  const bad = isBad(habit)

  const tracked = data.filter((d) => d.count !== null)
  const max = Math.max(1, habit.target, ...tracked.map((d) => d.count))
  const yMax = max + Math.max(1, Math.round(max * 0.15))
  const x = (i) => PAD.l + (i / (days - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b)

  // line segments only over days the habit existed
  const path = data
    .map((d, i) => (d.count === null ? null : `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`))
    .reduce((acc, p, i) => {
      if (!p) return acc
      const prevNull = i === 0 || data[i - 1].count === null
      return acc + (prevNull ? ` M${p}` : ` L${p}`)
    }, '')
    .trim()

  // trend: last 7 days vs the 7 before
  const avg = (arr) => (arr.length ? arr.reduce((a, d) => a + d.count, 0) / arr.length : null)
  const recent = avg(tracked.slice(-7))
  const before = avg(tracked.slice(-14, -7))
  let trend = 'Not enough data yet'
  if (recent !== null && before !== null && tracked.length >= 10) {
    const diff = recent - before
    const better = bad ? diff < 0 : diff > 0
    trend =
      Math.abs(diff) < 0.15
        ? `Steady · ${recent.toFixed(1)} a day`
        : `${better ? 'Improving' : 'Slipping'} · ${recent.toFixed(1)} a day (was ${before.toFixed(1)})`
  } else if (recent !== null) trend = `${recent.toFixed(1)} a day this week`

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days - 1))
    const clamped = Math.max(0, Math.min(days - 1, i))
    setHover(data[clamped].count === null ? null : clamped)
  }

  const hv = hover !== null ? data[hover] : null
  const label = (d) => d.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  return (
    <figure className="habit-chart">
      <figcaption>
        <span className="habit-chart__name" dir="auto">
          {habit.name}
        </span>
        <span className={`tag ${bad ? '' : 'tag--solid'}`}>{bad ? T("Bad") : T("Good")}</span>
      </figcaption>
      <p className="habit-chart__info">
        {hv
          ? `${hv.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hv.count} ${
              hv.count === 1 ? 'time' : 'times'
            } · ${success(habit, hv.count) ? (bad ? 'clean ✓' : 'done ✓') : bad ? 'over limit' : 'missed'}`
          : trend}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={T("{0}: daily count over the last {1} days. {2}.", [habit.name, days, trend])}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* y grid: 0 and max */}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="hc-axis" />
        <text x={PAD.l - 6} y={y(0) + 4} className="hc-tick" textAnchor="end">
          0
        </text>
        <text x={PAD.l - 6} y={y(yMax) + 8} className="hc-tick" textAnchor="end">
          {yMax}
        </text>

        {/* target / limit */}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(habit.target)} y2={y(habit.target)} className="hc-target" />
        <text x={W - PAD.r} y={y(habit.target) - 4} className="hc-tick" textAnchor="end">
          {bad ? `limit ${habit.target}` : `target ${habit.target}`}
        </text>

        {/* the line */}
        {path && <path d={path} className="hc-line" />}

        {/* today's point */}
        {data[days - 1].count !== null && <circle cx={x(days - 1)} cy={y(data[days - 1].count)} r="3.5" className="hc-dot" />}

        {/* hover crosshair */}
        {hv && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} className="hc-cross" />
            <circle cx={x(hover)} cy={y(hv.count)} r="5" className="hc-hover" />
          </>
        )}

        {/* x labels */}
        <text x={PAD.l} y={H - 4} className="hc-tick">
          {label(data[0])}
        </text>
        <text x={W - PAD.r} y={H - 4} className="hc-tick" textAnchor="end">{T("Today")}</text>
      </svg>
    </figure>
  );
}
