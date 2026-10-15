import { useEffect, useState } from 'react'
import { budgetStats, loadBudget, saveBudget } from '../lib/budget'
import { money, today } from '../lib/dates'
import { T, Tr } from '../lib/i18n'

/** Monthly budget on the Spending page: set it, see what's left, a fair amount per day, and where this pace ends up. */
export default function BudgetCard({ expenses }) {
  const [info, setInfo] = useState(null) // { budget, notify, needsUpdate }
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    loadBudget().then(setInfo)
  }, [])

  if (!info) return null

  const open = () => {
    setValue(info.budget ? String(info.budget) : '')
    setNotify(info.notify)
    setErr(null)
    setEditing(true)
  }
  const save = async (e) => {
    e.preventDefault()
    const n = Number(String(value).replace(',', '.'))
    if (!n || n <= 0) return setErr(T('Enter an amount above zero.'))
    setBusy(true)
    setErr(null)
    try {
      await saveBudget(Math.round(n * 100) / 100, notify)
      setInfo({ budget: Math.round(n * 100) / 100, notify })
      setEditing(false)
    } catch (x) {
      setErr(x.message)
    }
    setBusy(false)
  }
  const removeIt = async () => {
    setBusy(true)
    try {
      await saveBudget(null, notify)
      setInfo({ budget: null, notify })
      setEditing(false)
    } catch (x) {
      setErr(x.message)
    }
    setBusy(false)
  }

  if (editing)
    return (
      <form className="card budget budget--edit" onSubmit={save}>
        <h2>{T('Monthly budget')}</h2>
        <label className="field">
          <span>{T('How much do you want to spend each month?')}</span>
          <input inputMode="decimal" placeholder="0.00" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="budget__check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>{T('Warn me at 80% and when I go over (needs Reminders on)')}</span>
        </label>
        {err && <p className="error-text">{err}</p>}
        <div className="form-foot">
          {info.budget ? (
            <button type="button" className="link small" onClick={removeIt} disabled={busy}>
              {T('Remove budget')}
            </button>
          ) : (
            <span />
          )}
          <span className="budget__btns">
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
              {T('Cancel')}
            </button>
            <button className="btn" disabled={busy}>
              {busy ? '…' : T('Save')}
            </button>
          </span>
        </div>
      </form>
    )

  const s = budgetStats(expenses, info.budget, today())

  if (!info.budget)
    return (
      <section className="card budget budget--empty">
        <div>
          <h2>{T('Monthly budget')}</h2>
          <p className="muted small">
            {info.needsUpdate
              ? T('Run supabase/migrations/015_budget.sql in Supabase first.')
              : T('Set how much you want to spend this month. You’ll see what’s left and how much you can spend each day.')}
          </p>
        </div>
        {!info.needsUpdate && (
          <button className="btn btn--sm" onClick={open}>
            {T('Set budget')}
          </button>
        )}
      </section>
    )

  const pctShown = Math.round(s.pct * 100)
  const over = s.left < 0
  return (
    <section className={`card budget budget--${s.state}`}>
      <div className="budget__head">
        <h2>{T('Monthly budget')}</h2>
        <button className="link small" onClick={open}>
          {T('Change')}
        </button>
      </div>

      <p className="budget__big">
        {over ? (
          Tr('{0} over budget', <strong>{money(-s.left)}</strong>)
        ) : (
          Tr('{0} left', <strong>{money(s.left)}</strong>)
        )}
        <span className="muted"> · {T('{0} of {1} spent', [money(s.spent), money(s.budget)])}</span>
      </p>

      <div
        className="budget__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pctShown)}
        aria-label={T('{0}% of the budget spent', [pctShown])}
      >
        <span className="budget__fill" style={{ width: `${Math.min(100, s.pct * 100)}%` }} />
        <span className="budget__mark" style={{ insetInlineStart: `${Math.min(100, s.share * 100)}%` }} title={T('Where you’d be spending evenly')} />
      </div>
      <p className="budget__scale muted small">
        <span>{T('{0}% spent', [pctShown])}</span>
        <span>{T('{0} days left', [s.daysLeft])}</span>
      </p>

      <ul className="budget__facts">
        <li>
          <span>{T('You can spend')}</span>
          <strong>{over ? money(0) : money(s.perDay)}</strong>
          <span className="muted small">{T('a day until the month ends')}</span>
        </li>
        {s.forecast != null && (
          <li>
            <span>{T('At this pace')}</span>
            <strong className={s.forecast > s.budget ? 'is-bad' : 'is-good'}>{money(s.forecast)}</strong>
            <span className="muted small">
              {s.forecast > s.budget ? T('{0} over by the end of the month', [money(s.forecast - s.budget)]) : T('by the end of the month · within budget')}
            </span>
          </li>
        )}
        <li>
          <span>{T('Today')}</span>
          <strong className={s.spentToday > s.perDay && !over ? 'is-bad' : ''}>{money(s.spentToday)}</strong>
          <span className="muted small">{s.spentToday > s.perDay ? T('more than today’s share') : T('within today’s share')}</span>
        </li>
      </ul>

      {s.top.length > 0 && (
        <div className="budget__top">
          <p className="muted small">{T('Most of it went on')}</p>
          {s.top.map((g) => (
            <div key={g.name} className="budget__row">
              <span dir="auto">{g.name === '—' ? T('No note') : g.name}</span>
              <span className="budget__rowbar" aria-hidden>
                <span style={{ width: `${(g.amount / s.top[0].amount) * 100}%` }} />
              </span>
              <strong>{money(g.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
