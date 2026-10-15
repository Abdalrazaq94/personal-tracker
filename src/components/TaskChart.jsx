import { useMemo, useState } from 'react'
import { T, Tr } from '../lib/i18n'

const W = 340
const H = 150
const PAD = { l: 22, r: 62, t: 14, b: 24 }
const GREEN = '#2f7a3f' // done
const BLUE = '#2f5d93' // added (dashed)

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return ymdOf(new Date(y, m - 1, d + n))
}
const label = (day, opts) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts)
}

/**
 * Daily tasks over the last 14 days: how many you finished each day (green) and how many you added (blue, dashed).
 * Hover or tap the chart to see a day's numbers.
 */
export default function TaskChart({ tasks, today, days = 14 }) {
  const [hover, setHover] = useState(null)

  const data = useMemo(() => {
    const done = new Map()
    const added = new Map()
    let first = today
    for (const t of tasks) {
      const a = ymdOf(new Date(t.created_at))
      added.set(a, (added.get(a) || 0) + 1)
      if (a < first) first = a
      if (t.done_at) {
        const d = ymdOf(new Date(t.done_at))
        done.set(d, (done.get(d) || 0) + 1)
      }
    }
    return Array.from({ length: days }, (_, i) => {
      const day = shift(today, i - (days - 1))
      if (day < first) return { day, done: null, added: null }
      return { day, done: done.get(day) || 0, added: added.get(day) || 0 }
    })
  }, [tasks, today, days])

  const shown = data.filter((d) => d.done !== null)
  const top = Math.max(3, ...shown.map((d) => Math.max(d.done, d.added)))
  const lastIdx = days - 1
  const last = data[lastIdx]

  const x = (i) => PAD.l + (i / (days - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b)
  const line = (key) =>
    data
      .map((d, i) => (d[key] === null ? null : `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`))
      .reduce((acc, pt, i) => (!pt ? acc : acc + (i === 0 || data[i - 1][key] === null ? ` M${pt}` : ` L${pt}`)), '')
      .trim()

  // this week vs last week
  const sum = (arr) => arr.reduce((a, d) => a + (d.done || 0), 0)
  const thisWeek = sum(data.slice(-7))
  const lastWeek = sum(data.slice(-14, -7))
  const summary =
    lastWeek && data[days - 14]?.done !== null
      ? `${thisWeek} done this week · ${thisWeek > lastWeek ? 'up' : thisWeek < lastWeek ? 'down' : 'same as'} ${thisWeek === lastWeek ? 'last week' : `from ${lastWeek} last week`}`
      : `${thisWeek} done this week · ${last.done} today`

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.max(0, Math.min(days - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (days - 1))))
    setHover(data[i].done === null ? null : i)
  }
  const hv = hover !== null ? data[hover] : null
  const endY = last.done !== null ? { done: y(last.done), added: y(last.added) } : null
  if (endY && Math.abs(endY.done - endY.added) < 12) endY.added = endY.done + (endY.done > H / 2 ? -12 : 12)

  return (
    <figure className="prayer-chart">
      <figcaption className="prayer-chart__head">
        <span className="prayer-chart__legend">{Tr(
            "{0} Done {1} Added",
            <span className="lg lg--prayed" />,
            <span className="lg lg--ontime" />
          )}</span>
      </figcaption>
      <p className="habit-chart__info">
        {hv ? T("{0} · {1} done · {2} added", [
          label(hv.day, { weekday: 'short', day: 'numeric', month: 'short' }),
          hv.done,
          hv.added
        ]) : summary}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={T(
          "Tasks done and added per day over the last {0} days. {1}.",
          [days, summary]
        )}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, top].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'hc-axis' : 'hc-grid'} />
            <text x={PAD.l - 6} y={y(v) + 4} className="hc-tick" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path d={line('added')} fill="none" stroke={BLUE} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line('done')} fill="none" stroke={GREEN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) =>
          d.done === null ? null : (
            <g key={d.day}>
              <circle cx={x(i)} cy={y(d.added)} r="2.5" fill={BLUE} />
              <circle cx={x(i)} cy={y(d.done)} r="2.5" fill={GREEN} />
            </g>
          )
        )}
        {endY && (
          <>
            <circle cx={x(lastIdx)} cy={y(last.added)} r="4" fill={BLUE} stroke="#fff" strokeWidth="2" />
            <circle cx={x(lastIdx)} cy={y(last.done)} r="4" fill={GREEN} stroke="#fff" strokeWidth="2" />
            <text x={x(lastIdx) + 8} y={endY.done + 4} className="hc-tick prayer-chart__end">{Tr("Done {0}", last.done)}</text>
            <text x={x(lastIdx) + 8} y={endY.added + 4} className="hc-tick prayer-chart__end">{Tr("Added {0}", last.added)}</text>
          </>
        )}
        {hv && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} className="hc-cross" />
            <circle cx={x(hover)} cy={y(hv.added)} r="5" fill={BLUE} stroke="#fff" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(hv.done)} r="5" fill={GREEN} stroke="#fff" strokeWidth="2" />
          </>
        )}
        <text x={PAD.l} y={H - 5} className="hc-tick">
          {label(data[0].day, { day: 'numeric', month: 'short' })}
        </text>
        <text x={W - PAD.r} y={H - 5} className="hc-tick" textAnchor="end">{T("Today")}</text>
      </svg>
    </figure>
  );
}
