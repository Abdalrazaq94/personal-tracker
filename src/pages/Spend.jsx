import { useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import { dayLabel, money, startOfMonth, startOfWeek, today, ymd } from '../lib/dates'
import AiPanel from '../components/AiPanel'
import WalletSetup from '../components/WalletSetup'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader } from '../components/ui'
import { T, LOCALE } from '../lib/i18n'

export default function Spend() {
  const { rows, loading, error, setError, insert, remove, reload } = useRows('expenses', { order: 'spent_on' })
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())

  const totals = useMemo(() => {
    const t = today()
    const w = ymd(startOfWeek())
    const m = ymd(startOfMonth())
    const sum = (f) => rows.filter(f).reduce((a, x) => a + Number(x.amount), 0)
    return {
      today: sum((x) => x.spent_on === t),
      week: sum((x) => x.spent_on >= w),
      month: sum((x) => x.spent_on >= m),
      all: sum(() => true),
    }
  }, [rows])

  const groups = useMemo(() => {
    const map = new Map()
    ;[...rows]
      .sort((a, b) => (a.spent_on === b.spent_on ? new Date(b.created_at) - new Date(a.created_at) : a.spent_on < b.spent_on ? 1 : -1))
      .forEach((r) => {
        if (!map.has(r.spent_on)) map.set(r.spent_on, [])
        map.get(r.spent_on).push(r)
      })
    return [...map.entries()]
  }, [rows])

  const add = async (e) => {
    e.preventDefault()
    const n = Number(String(amount).replace(',', '.'))
    if (!n || n <= 0) return setError(T("Enter an amount above zero."));
    const ok = await insert({ amount: n, note: note.trim(), spent_on: date || today() })
    if (ok) {
      setAmount('')
      setNote('')
    }
  }

  return (
    <div className="page">
      <PageHeader title={T("Spending")} subtitle={new Date().toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })} />
      <ErrorBar error={error} onClose={() => setError(null)} />

      <div className="totals">
        <div className="total total--hero">
          <span>{T("This month")}</span>
          <strong>{money(totals.month)}</strong>
        </div>
        <div className="total">
          <span>{T("Today")}</span>
          <strong>{money(totals.today)}</strong>
        </div>
        <div className="total">
          <span>{T("This week")}</span>
          <strong>{money(totals.week)}</strong>
        </div>
        <div className="total">
          <span>{T("All time")}</span>
          <strong>{money(totals.all)}</strong>
        </div>
      </div>

      <WalletSetup onTestAdded={reload} />

      <AiPanel kind="spending" examples={[T("Where can I save money?"), T("Compare this month to last month")]} />

      <form className="card form" onSubmit={add}>
        <div className="row-2">
          <label className="field">
            <span>{T("Amount")}</span>
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>{T("Date")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>{T("What for")}</span>
          <input dir="auto" placeholder={T("e.g. Coffee, groceries, bus")} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="form-foot form-foot--end">
          <button className="btn">{T("Add spend")}</button>
        </div>
      </form>

      {loading ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Empty>{T("Nothing spent yet.")}</Empty>
      ) : (
        groups.map(([day, items]) => (
          <section key={day} className="group">
            <h2 className="group__title">
              <span>{dayLabel(day)}</span>
              <span>{money(items.reduce((a, x) => a + Number(x.amount), 0))}</span>
            </h2>
            <ul className="list list--tight">
              {items.map((x) => (
                <li key={x.id} className="item expense">
                  <span className="expense__note" dir="auto">
                    {x.note || <span className="muted">{T("No note")}</span>}
                    {x.source === 'wallet' && <span className="tag expense__tag">{T("Wallet")}</span>}
                  </span>
                  <span className="expense__amt">{money(x.amount)}</span>
                  <DeleteButton label={T("Delete this spend")} onClick={() => remove(x.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
