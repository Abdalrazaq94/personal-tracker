import { useMemo, useState } from 'react'
import { T, LOCALE } from '../lib/i18n'
import { chartColors, useTheme } from '../lib/theme'
import { addDays, clockFromNoon, hoursText } from '../lib/sleep'
import { parseYmd } from '../lib/dates'

const W = 340
const PAD = { l: 40, r: 10, t: 12, b: 22 }
const label = (day, opts) => parseYmd(day).toLocaleDateString(LOCALE, opts)

/**
 * Two small charts for the chosen period:
 *  1) "When you slept": one bar per night from bedtime (top) to wake-up (bottom), with your average times.
 *  2) "Hours slept": one bar per night, green when the goal was met, with the goal as a dashed line.
 * Up to ~2 months it shows each night; longer periods show one bar per week (averages).
 */
export default function SleepChart({ stats, period, today }) {
  const { green: GREEN, blue: BLUE } = chartColors(useTheme())
  const [hover, setHover] = useState(null)
  const goal = stats.goal

  const items = useMemo(() => {
    const to = period.to < today ? period.to : today
    const byNight = new Map(stats.nights.map((n) => [n.night, n]))
    const days = []
    for (let d = period.from; d <= to; d = addDays(d, 1)) days.push(d)
    if (days.length <= 62) return days.map((d) => ({ key: d, n: byNight.get(d) || null, days: 1 }))
    // one bar per week (Monday start): averages of the nights logged that week
    const weeks = new Map()
    for (const d of days) {
      const dt = parseYmd(d)
      const monday = addDays(d, -((dt.getDay() + 6) % 7))
      const w = weeks.get(monday) || []
      if (byNight.get(d)) w.push(byNight.get(d))
      weeks.set(monday, w)
    }
    const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length
    return [...weeks.entries()].map(([k, list]) => ({
      key: k,
      days: 7,
      count: list.length,
      n: list.length ? { night: k, bed: avg(list, 'bed'), wake: avg(list, 'wake'), min: avg(list, 'min') } : null,
    }))
  }, [stats.nights, period.from, period.to, today])

  const logged = items.filter((i) => i.n)
  if (!logged.length) return null
  const weekly = items[0]?.days === 7

  // ---- chart 1: the sleep window ----
  const H1 = 170
  const top = Math.floor((Math.min(...logged.map((i) => i.n.bed)) - 30) / 60) * 60
  const bottom = Math.ceil((Math.max(...logged.map((i) => i.n.wake)) + 30) / 60) * 60
  const n = items.length
  const slot = (W - PAD.l - PAD.r) / n
  const bw = Math.max(2, Math.min(18, slot * 0.62))
  const cx = (i) => PAD.l + slot * i + slot / 2
  const ty = (m) => PAD.t + ((m - top) / (bottom - top)) * (H1 - PAD.t - PAD.b)
  const hourTicks = []
  const step = bottom - top > 12 * 60 ? 180 : 120
  for (let m = top; m <= bottom; m += step) hourTicks.push(m)

  // ---- chart 2: hours slept ----
  const H2 = 130
  const maxMin = Math.max(goal + 60, ...logged.map((i) => i.n.min))
  const hy = (m) => PAD.t + (1 - m / maxMin) * (H2 - PAD.t - PAD.b)
  const hTicks = [0, 4 * 60, 8 * 60, 12 * 60].filter((m) => m <= maxMin)

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - PAD.l) / slot)))
    setHover(items[i]?.n ? i : null)
  }
  const hv = hover != null ? items[hover] : null
  const nameOf = (it) =>
    weekly ? T('Week of {0}', [label(it.key, { day: 'numeric', month: 'short' })]) : label(it.key, { weekday: 'short', day: 'numeric', month: 'short' })
  const info = hv
    ? T('{0} · {1} → {2} · {3}', [nameOf(hv), clockFromNoon(hv.n.bed), clockFromNoon(hv.n.wake), hoursText(hv.n.min)])
    : weekly
      ? T('Each bar is one week (average). Tap a bar for details.')
      : T('Each bar is one night. Tap a bar for details.')
  const first = items[0].key
  const xLabelEnd = items[n - 1].key

  const common = { onPointerMove: onMove, onPointerDown: onMove, onPointerLeave: () => setHover(null) }
  return (
    <figure className="sleep-chart">
      <p className="habit-chart__info">{info}</p>

      <figcaption className="sleep-chart__title">{T('When you slept')}</figcaption>
      <svg viewBox={`0 0 ${W} ${H1}`} role="img" aria-label={T('Bedtime and wake-up time for each night')} {...common}>
        {hourTicks.map((m) => (
          <g key={m}>
            <line x1={PAD.l} x2={W - PAD.r} y1={ty(m)} y2={ty(m)} className="hc-grid" />
            <text x={PAD.l - 6} y={ty(m) + 4} className="hc-tick" textAnchor="end">
              {clockFromNoon(m)}
            </text>
          </g>
        ))}
        {items.map((it, i) =>
          it.n ? (
            <rect
              key={it.key}
              x={cx(i) - bw / 2}
              y={ty(it.n.bed)}
              width={bw}
              height={Math.max(2, ty(it.n.wake) - ty(it.n.bed))}
              rx={Math.min(bw / 2, 6)}
              fill={BLUE}
              opacity={hover == null || hover === i ? 1 : 0.45}
            />
          ) : null
        )}
        {stats.avgBed != null && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={ty(stats.avgBed)} y2={ty(stats.avgBed)} className="sleep-chart__avg" />
            <line x1={PAD.l} x2={W - PAD.r} y1={ty(stats.avgWake)} y2={ty(stats.avgWake)} className="sleep-chart__avg" />
          </>
        )}
        <text x={PAD.l} y={H1 - 5} className="hc-tick">
          {label(first, { day: 'numeric', month: 'short' })}
        </text>
        <text x={W - PAD.r} y={H1 - 5} className="hc-tick" textAnchor="end">
          {label(xLabelEnd, { day: 'numeric', month: 'short' })}
        </text>
      </svg>
      <p className="sleep-chart__legend muted small">
        <span className="sleep-chart__dash" aria-hidden /> {T('average bedtime and wake-up')}
      </p>

      <figcaption className="sleep-chart__title">{T('Hours slept')}</figcaption>
      <svg viewBox={`0 0 ${W} ${H2}`} role="img" aria-label={T('Hours slept each night, with your goal')} {...common}>
        {hTicks.map((m) => (
          <g key={m}>
            <line x1={PAD.l} x2={W - PAD.r} y1={hy(m)} y2={hy(m)} className={m === 0 ? 'hc-axis' : 'hc-grid'} />
            <text x={PAD.l - 6} y={hy(m) + 4} className="hc-tick" textAnchor="end">
              {T('{0}h', [m / 60])}
            </text>
          </g>
        ))}
        {items.map((it, i) =>
          it.n ? (
            <rect
              key={it.key}
              x={cx(i) - bw / 2}
              y={hy(it.n.min)}
              width={bw}
              height={Math.max(1, hy(0) - hy(it.n.min))}
              rx={Math.min(bw / 2, 4)}
              fill={it.n.min >= goal - 15 ? GREEN : BLUE}
              opacity={hover == null || hover === i ? 1 : 0.45}
            />
          ) : null
        )}
        <line x1={PAD.l} x2={W - PAD.r} y1={hy(goal)} y2={hy(goal)} className="sleep-chart__goal" />
        <text x={W - PAD.r} y={hy(goal) - 4} className="hc-tick" textAnchor="end">
          {T('Goal {0}', [hoursText(goal)])}
        </text>
      </svg>
      <p className="sleep-chart__legend muted small">
        <span className="sleep-chart__sw" style={{ background: GREEN }} aria-hidden /> {T('Met the goal')}{' '}
        <span className="sleep-chart__sw" style={{ background: BLUE }} aria-hidden /> {T('Under the goal')}
      </p>
    </figure>
  )
}
