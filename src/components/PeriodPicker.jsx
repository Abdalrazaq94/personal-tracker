import { useState } from 'react'
import { parseYmd } from '../lib/dates'
import { lastN, periodFor } from '../lib/review'
import { isAr, LOCALE, T } from '../lib/i18n'
import { Segmented } from './ui'

/** Week / Month / Year / Custom, with ‹ › to go back in time (Review and Sleep pages). */
export const PRESETS = [
  { id: '2w', n: 2, unit: 'week', label: 'Last 2 weeks' },
  { id: '1m', n: 1, unit: 'month', label: 'Last month' },
  { id: '2m', n: 2, unit: 'month', label: 'Last 2 months' },
  { id: '3m', n: 3, unit: 'month', label: 'Last 3 months' },
  { id: '6m', n: 6, unit: 'month', label: 'Last 6 months' },
]

export const fmtDay = (s, opts) => parseYmd(s).toLocaleDateString(LOCALE, opts)

/** "This week", "Last month", "October 2026", "2026", "12 Aug – 15 Oct" */
export function periodLabel(p, offset) {
  if (p.kind === 'week')
    return offset === 0 ? T('This week') : offset === -1 ? T('Last week') : `${fmtDay(p.from, { day: 'numeric', month: 'short' })} – ${fmtDay(p.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
  if (p.kind === 'month') return offset === 0 ? T('This month') : fmtDay(p.from, { month: 'long', year: 'numeric' })
  if (p.kind === 'year') return offset === 0 ? T('This year') : p.from.slice(0, 4)
  return `${fmtDay(p.from, { day: 'numeric', month: 'short' })} – ${fmtDay(p.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** The chosen period and everything the picker needs. */
export function usePeriod(startKind = 'week') {
  const [kind, setKind] = useState(startKind)
  const [offset, setOffset] = useState(0)
  const [custom, setCustom] = useState(() => lastN(2, 'month'))
  const [preset, setPreset] = useState('2m')
  const period = kind === 'custom' ? custom : periodFor(kind, offset)
  return { kind, setKind, offset, setOffset, custom, setCustom, preset, setPreset, period, label: periodLabel(period, offset) }
}

export default function PeriodPicker({ state }) {
  const { kind, setKind, offset, setOffset, custom, setCustom, preset, setPreset, period } = state
  return (
    <section className="card review-pick">
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k)
          setOffset(0)
        }}
        options={[
          { value: 'week', label: T('Week') },
          { value: 'month', label: T('Month') },
          { value: 'year', label: T('Year') },
          { value: 'custom', label: T('Custom') },
        ]}
      />
      {kind !== 'custom' ? (
        <div className="review-nav">
          <button type="button" className="round-btn" aria-label={T('Earlier')} onClick={() => setOffset((o) => o - 1)}>
            {isAr ? '›' : '‹'}
          </button>
          <div className="review-nav__label">
            <strong>{periodLabel(period, offset)}</strong>
            <span className="muted small">
              {fmtDay(period.from, { day: 'numeric', month: 'short' })} – {fmtDay(period.to, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <button type="button" className="round-btn" aria-label={T('Later')} disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}>
            {isAr ? '‹' : '›'}
          </button>
        </div>
      ) : (
        <div className="review-custom">
          <div className="chips-row">
            {PRESETS.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`chip ${preset === x.id ? 'is-active chip--solid' : ''}`}
                onClick={() => {
                  setPreset(x.id)
                  setCustom(lastN(x.n, x.unit))
                }}
              >
                {T(x.label)}
              </button>
            ))}
          </div>
          <div className="review-dates">
            <label className="field">
              <span>{T('From')}</span>
              <input
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={(e) => {
                  setPreset('')
                  if (e.target.value) setCustom((c) => ({ ...c, from: e.target.value }))
                }}
              />
            </label>
            <label className="field">
              <span>{T('To')}</span>
              <input
                type="date"
                value={custom.to}
                min={custom.from}
                onChange={(e) => {
                  setPreset('')
                  if (e.target.value) setCustom((c) => ({ ...c, to: e.target.value }))
                }}
              />
            </label>
          </div>
        </div>
      )}
    </section>
  )
}
