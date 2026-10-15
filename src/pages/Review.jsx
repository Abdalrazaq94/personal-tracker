import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, parseYmd, today } from '../lib/dates'
import { change, previousOf, statsFor, trend } from '../lib/review'
import { LANG, LOCALE, T, Tr } from '../lib/i18n'
import { PRAYERS, prayerName } from '../lib/prayer'
import { callAi } from '../lib/ai'
import { chartColors, useTheme } from '../lib/theme'
import { ErrorBar, PageHeader } from '../components/ui'
import { Markdown } from '../components/AiPanel'
import Reveal from '../components/bits/Reveal'
import CountUp from '../components/bits/CountUp'
import PeriodPicker, { fmtDay, periodLabel, usePeriod } from '../components/PeriodPicker'
import { loadBudget } from '../lib/budget'
import { clockFromNoon, hoursText, loadSleepGoal, sleepStats, sleepSummary } from '../lib/sleep'
import { Link } from 'react-router-dom'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

const prevWord = (p) => (p.kind === 'week' ? T('vs the week before') : p.kind === 'month' ? T('vs the month before') : p.kind === 'year' ? T('vs the year before') : T('vs the same length before'))

export default function Review() {
  const pick = usePeriod('week')
  const { period, offset } = pick
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [budget, setBudget] = useState(null)
  const [sleepGoal, setSleepGoal] = useState(8)
  useEffect(() => {
    loadBudget()
      .then((b) => setBudget(b.budget))
      .catch(() => {})
    loadSleepGoal()
      .then(setSleepGoal)
      .catch(() => {})
  }, [])

  const prev = useMemo(() => previousOf(period), [period.from, period.to, period.kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = today()

  // load everything from the start of the previous period to the end of this one
  useEffect(() => {
    let alive = true
    setData(null)
    const from = prev.from
    const to = period.to < t ? period.to : t
    ;(async () => {
      const [tasks, plans, habits, logs, prayers, first, expenses, words, notes, links, sleep] = await Promise.all([
        supabase.from('tasks').select('*'),
        supabase.from('plans').select('plan_date, done').gte('plan_date', from).lte('plan_date', to),
        supabase.from('habits').select('*'),
        supabase.from('habit_logs').select('habit_id, day, count, skipped, resisted').gte('day', from).lte('day', to),
        supabase.from('prayer_logs').select('*').gte('day', from).lte('day', to),
        supabase.from('prayer_logs').select('day').order('day', { ascending: true }).limit(1),
        supabase.from('expenses').select('amount, note, spent_on').gte('spent_on', from).lte('spent_on', to),
        supabase.from('words').select('created_at').gte('created_at', from),
        supabase.from('notes').select('created_at').gte('created_at', from),
        supabase.from('links').select('created_at').gte('created_at', from),
        supabase.from('sleep_logs').select('night, bed_at, wake_at, quality').gte('night', from).lte('night', to),
      ])
      if (!alive) return
      const err = [tasks, plans, habits, logs, expenses].find((r) => r.error)?.error
      if (err) setError(err.message)
      setData({
        tasks: tasks.data || [],
        plans: plans.data || [],
        habits: habits.data || [],
        habitLogs: logs.data || [],
        prayerLogs: prayers.error ? [] : prayers.data || [],
        firstPrayerDay: first.data?.[0]?.day || null,
        expenses: expenses.data || [],
        words: words.data || [],
        notes: notes.data || [],
        links: links.data || [],
        sleep: sleep.error ? [] : sleep.data || [], // empty until 017_sleep.sql is run
      })
    })()
    return () => {
      alive = false
    }
  }, [period.from, period.to, prev.from]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = data && { ...statsFor(data, period, t), sleep: sleepStats(data.sleep, { from: period.from, to: period.to < t ? period.to : t }, sleepGoal) }
  const sleepBefore = data && sleepStats(data.sleep, prev, sleepGoal)
  const before = data && statsFor(data, prev, t)
  const tr = data && trend(data, period, t)
  const future = period.from > t

  return (
    <div className="page review">
      <PageHeader title={T('Review')} subtitle={T('Your week, month or year at a glance')} />
      <ErrorBar error={error} onClose={() => setError(null)} />

      {/* ------------------------------ choose the period ------------------------------ */}
      <PeriodPicker state={pick} />

      {future ? (
        <div className="empty muted">{T('This period hasn’t started yet.')}</div>
      ) : !now ? (
        <div className="empty muted loading-text">{T('Adding it all up…')}</div>
      ) : (
        <>
          {/* ------------------------------ the big numbers ------------------------------ */}
          <div className="review-kpis">
            <Kpi label={T('Tasks done')} value={now.tasks.done} before={before.tasks.done} prev={prevWord(period)} />
            <Kpi label={T('Spent')} value={now.spending.total} before={before.spending.total} format={money} lowerIsBetter prev={prevWord(period)} />
            <Kpi
              label={T('Prayers on time')}
              value={now.prayers.possible ? now.prayers.onTime / now.prayers.possible : null}
              before={before.prayers.possible ? before.prayers.onTime / before.prayers.possible : null}
              format={pct}
              points
              prev={prevWord(period)}
            />
            <Kpi label={T('Good habits kept')} value={now.habits.goodRate} before={before.habits.goodRate} format={pct} points prev={prevWord(period)} />
          </div>

          {/* ------------------------------ trend ------------------------------ */}
          {tr.buckets.length > 1 && (
            <Reveal as="section" className="card review-card">
              <h2>{tr.unit === 'day' ? T('Day by day') : tr.unit === 'week' ? T('Week by week') : T('Month by month')}</h2>
              <Bars buckets={tr.buckets} field="spend" unit={tr.unit} label={T('Spending')} format={money} color="blue" />
              <Bars buckets={tr.buckets} field="tasks" unit={tr.unit} label={T('Tasks done')} color="green" />
              {now.prayers.possible > 0 && <Bars buckets={tr.buckets} field="prayed" unit={tr.unit} label={T('Prayers prayed')} color="green" />}
            </Reveal>
          )}

          {/* ------------------------------ details ------------------------------ */}
          <Reveal as="section" className="card review-card">
            <h2>{T('Tasks and plans')}</h2>
            <Rows
              rows={[
                [T('Tasks done'), now.tasks.done, before.tasks.done],
                [T('Important tasks done'), now.tasks.importantDone, before.tasks.importantDone],
                [T('Tasks added'), now.tasks.added, before.tasks.added],
                [T('Plans done'), `${now.plans.done} / ${now.plans.total}`, `${before.plans.done} / ${before.plans.total}`],
              ]}
            />
          </Reveal>

          {(now.habits.good.length > 0 || now.habits.bad.length > 0) && (
            <Reveal as="section" className="card review-card">
              <h2>{T('Habits')}</h2>
              {now.habits.good.map((h) => (
                <Meter key={h.id} name={h.name} rate={h.rate} note={T('{0} of {1} days', [h.good, h.plannedDays])} />
              ))}
              {now.habits.bad.map((h) => (
                <Meter
                  key={h.id}
                  name={h.name}
                  rate={h.rate}
                  bad
                  note={`${T('{0} of {1} days clean', [h.good, h.plannedDays])} · ${T('{0} times', [h.total])}${h.resisted ? ` · ${T('{0} urges resisted', [h.resisted])}` : ''}`}
                />
              ))}
              {now.habits.saved > 0 && <p className="review-note">{Tr('{0} saved by cutting down', <b>{money(now.habits.saved)}</b>)}</p>}
            </Reveal>
          )}

          {now.prayers.possible > 0 && (
            <Reveal as="section" className="card review-card">
              <h2>{T('Prayers')}</h2>
              <p className="review-note">
                {T('{0} of {1} prayed · {2} on time', [now.prayers.prayed, now.prayers.possible, now.prayers.onTime])}
                {now.prayers.late ? T(' · {0} late', [now.prayers.late]) : ''}
                {now.prayers.qada ? T(' · {0} Qada', [now.prayers.qada]) : ''}
                {now.prayers.missed ? T(' · {0} not prayed', [now.prayers.missed]) : ''}
              </p>
              {now.prayers.perPrayer.map((x) => (
                <Meter
                  key={x.key}
                  name={prayerName(PRAYERS.find((p) => p.key === x.key))}
                  rate={x.possible ? x.prayed / x.possible : null}
                  inner={x.possible ? x.onTime / x.possible : null}
                  note={
                    T('{0} of {1} · {2} on time', [x.prayed, x.possible, x.onTime]) +
                    (x.qada ? T(' · {0} Qada', [x.qada]) : '') +
                    (x.missed ? T(' · {0} not prayed', [x.missed]) : '')
                  }
                />
              ))}
            </Reveal>
          )}

          <Reveal as="section" className="card review-card">
            <h2>{T('Spending')}</h2>
            <Rows
              rows={[
                [T('Total'), money(now.spending.total), money(before.spending.total)],
                [T('Per day'), money(now.spending.perDay), money(before.spending.perDay)],
                [T('Payments'), now.spending.count, before.spending.count],
              ]}
            />
            {budget && period.kind === 'month' && (
              <Meter
                name={T('Monthly budget')}
                rate={now.spending.total / budget}
                bad={now.spending.total > budget}
                note={
                  now.spending.total > budget
                    ? T('{0} of {1} · {2} over', [money(now.spending.total), money(budget), money(now.spending.total - budget)])
                    : T('{0} of {1} · {2} left', [money(now.spending.total), money(budget), money(budget - now.spending.total)])
                }
              />
            )}
            {now.spending.top.length > 0 && (
              <>
                <h3 className="review-sub">{T('Where it went')}</h3>
                <ul className="review-top">
                  {now.spending.top.map((g) => (
                    <li key={g.name}>
                      <span dir="auto">{g.name}</span>
                      <span className="review-top__bar" aria-hidden>
                        <span style={{ width: `${(g.amount / now.spending.top[0].amount) * 100}%` }} />
                      </span>
                      <strong>{money(g.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {now.spending.biggest && (
              <p className="review-note">
                {Tr(
                  'Biggest: {0} · {1} on {2}',
                  <b dir="auto">{now.spending.biggest.name}</b>,
                  money(now.spending.biggest.amount),
                  fmtDay(now.spending.biggest.day, { day: 'numeric', month: 'short' })
                )}
              </p>
            )}
          </Reveal>

          {now.sleep.count > 0 && (
            <Reveal as="section" className="card review-card">
              <h2>{T('Sleep')}</h2>
              <Rows
                rows={[
                  [T('Average sleep'), hoursText(now.sleep.avgMin), sleepBefore.count ? hoursText(sleepBefore.avgMin) : '—'],
                  [T('Bedtime'), clockFromNoon(now.sleep.avgBed), sleepBefore.count ? clockFromNoon(sleepBefore.avgBed) : '—'],
                  [T('Wake-up'), clockFromNoon(now.sleep.avgWake), sleepBefore.count ? clockFromNoon(sleepBefore.avgWake) : '—'],
                  [T('Nights logged'), now.sleep.count, sleepBefore.count],
                ]}
              />
              <Meter name={T('Nights that met your goal')} rate={now.sleep.metGoal / now.sleep.count} note={T('{0} of {1} nights · goal {2}', [now.sleep.metGoal, now.sleep.count, hoursText(sleepGoal * 60)])} />
              <Link to="/sleep" className="link small">{T('Open Sleep for the full analysis →')}</Link>
            </Reveal>
          )}

          <Reveal as="section" className="card review-card">
            <h2>{T('Learning and notes')}</h2>
            <Rows
              rows={[
                [T('New words'), now.words.added, before.words.added],
                [T('Notes written'), now.notes, before.notes],
                [T('Links saved'), now.links, before.links],
              ]}
            />
          </Reveal>

          <AiReview period={period} label={periodLabel(period, offset)} now={now} before={before} sleepBefore={sleepBefore} sleepGoal={sleepGoal} />
        </>
      )}
    </div>
  )
}

/** A big number with the change from last time. */
function Kpi({ label, value, before, format = (n) => Math.round(n), lowerIsBetter = false, points = false, prev }) {
  const diff = value == null || before == null ? null : points ? value - before : change(value, before)
  const up = diff != null && diff > 0.005
  const down = diff != null && diff < -0.005
  const good = lowerIsBetter ? down : up
  const bad = lowerIsBetter ? up : down
  const shown = diff == null ? null : points ? `${Math.round(Math.abs(diff) * 100)} ${T('pts')}` : `${Math.round(Math.abs(diff) * 100)}%`
  return (
    <div className="review-kpi">
      <span className="review-kpi__label">{label}</span>
      <strong className="review-kpi__value">{value == null ? '—' : <CountUp to={value} format={format} />}</strong>
      <span className={`review-kpi__delta ${good ? 'is-good' : bad ? 'is-bad' : ''}`}>
        {diff == null ? T('nothing to compare') : up || down ? `${up ? '▲' : '▼'} ${shown} ${prev}` : `= ${prev}`}
      </span>
    </div>
  )
}

/** Simple table: this period, and the one before. */
function Rows({ rows }) {
  return (
    <table className="review-rows">
      <thead>
        <tr>
          <th />
          <th>{T('Now')}</th>
          <th>{T('Before')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, a, b]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{a}</td>
            <td className="muted">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A bar for one habit or prayer (share of days). */
function Meter({ name, rate, inner, note, bad }) {
  return (
    <div className="review-meter">
      <div className="review-meter__head">
        <span dir="auto">{name}</span>
        <strong>{pct(rate)}</strong>
      </div>
      <div className={`review-meter__bar ${bad ? 'is-bad' : ''}`} aria-hidden>
        <span style={{ width: `${Math.min(1, rate || 0) * 100}%` }} />
        {inner != null && <span className="is-inner" style={{ width: `${inner * 100}%` }} />}
      </div>
      {note && <span className="muted small">{note}</span>}
    </div>
  )
}

/** Small bar chart for one measure across the period. */
function Bars({ buckets, field, unit, label, format = (n) => String(Math.round(n)), color }) {
  const theme = useTheme()
  const c = chartColors(theme)[color]
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...buckets.map((b) => b[field]))
  const total = buckets.reduce((a, b) => a + b[field], 0)
  const name = (key) =>
    unit === 'month'
      ? parseYmd(`${key}-01`).toLocaleDateString(LOCALE, { month: 'short' })
      : parseYmd(key).toLocaleDateString(LOCALE, unit === 'day' && buckets.length <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
  const hv = hover != null ? buckets[hover] : null
  const step = Math.ceil(buckets.length / 7)
  return (
    <figure className="review-bars">
      <figcaption>
        <span>{label}</span>
        <span className="muted small">{hv ? `${name(hv.key)} · ${format(hv[field])}` : `${T('Total')} ${format(total)}`}</span>
      </figcaption>
      <div className="review-bars__plot" onPointerLeave={() => setHover(null)}>
        {buckets.map((b, i) => (
          <button
            type="button"
            key={b.key}
            className={`review-bars__bar ${hover === i ? 'is-on' : ''}`}
            style={{ '--h': `${(b[field] / max) * 100}%`, '--c': c }}
            onPointerEnter={() => setHover(i)}
            onClick={() => setHover(i)}
            aria-label={`${name(b.key)}: ${format(b[field])}`}
          />
        ))}
      </div>
      <div className="review-bars__axis" aria-hidden>
        {buckets.map((b, i) => (
          <span key={b.key}>{i % step === 0 ? name(b.key) : ''}</span>
        ))}
      </div>
    </figure>
  )
}

/** The AI writes the review from the numbers (in Arabic when the app is in Arabic). */
function AiReview({ period, label, now, before, sleepBefore, sleepGoal }) {
  const key = `review:${LANG}:${period.from}:${period.to}`
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(key) || ''
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    try {
      setText(localStorage.getItem(key) || '')
    } catch {
      setText('')
    }
    setError('')
  }, [key])

  const write = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await callAi({ kind: 'review', label, from: period.from, to: period.to, summary: summaryText(now, before) + (now.sleep.count ? '\nSLEEP:\n' + sleepSummary(now.sleep, sleepBefore, sleepGoal) : '') })
      setText(r.text)
      try {
        localStorage.setItem(key, r.text)
      } catch {
        /* fine */
      }
    } catch (e) {
      setError(/unknown request/i.test(e.message) ? T('The AI part needs updating on the server (deploy the “ai” function again).') : e.message)
    }
    setBusy(false)
  }

  return (
    <Reveal as="section" className="day-brief review-ai">
      <div className="day-brief__head">
        <h2>
          <span className="ai-spark" aria-hidden>
            ✦
          </span>{' '}
          {T('AI review')}
        </h2>
        {text && (
          <button type="button" className="link small" onClick={write} disabled={busy}>
            {busy ? T('Thinking…') : T('Write again')}
          </button>
        )}
      </div>
      {text ? (
        <Markdown text={text} />
      ) : (
        <>
          <p className="small">{T('Get a short written review of this period: your wins, what slipped, and 3 things to try next.')}</p>
          <button type="button" className="btn btn--sm review-ai__btn" onClick={write} disabled={busy}>
            {busy ? T('Writing your review…') : T('✦ Write my review')}
          </button>
        </>
      )}
      {busy && text && <div className="ai-loading">{T('Writing your review…')}</div>}
      {error && <p className="day-brief__note small">{error}</p>}
    </Reveal>
  )
}

/** The numbers, as plain text for the AI (always English; the AI answers in the app's language). */
function summaryText(n, b) {
  const p = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`)
  const lines = [
    `Days counted: ${n.days} (previous period: ${b.days})`,
    `Tasks done: ${n.tasks.done} (before ${b.tasks.done}); important done ${n.tasks.importantDone}; added ${n.tasks.added}`,
    `Plans done: ${n.plans.done}/${n.plans.total} (before ${b.plans.done}/${b.plans.total})`,
    `Good habits kept: ${p(n.habits.goodRate)} (before ${p(b.habits.goodRate)})`,
    ...n.habits.good.map((h) => `  - ${h.name}: ${h.good}/${h.plannedDays} days`),
    `Bad habits clean days: ${p(n.habits.cleanRate)} (before ${p(b.habits.cleanRate)}); slips ${n.habits.slips} (before ${b.habits.slips}); money saved ${n.habits.saved.toFixed(2)}`,
    ...n.habits.bad.map((h) => `  - ${h.name}: ${h.good}/${h.plannedDays} clean days, ${h.total} times, ${h.resisted} urges resisted`),
    n.prayers.possible
      ? `Prayers: ${n.prayers.prayed}/${n.prayers.possible} prayed — ${n.prayers.onTime} on time, ${n.prayers.late} late, ${n.prayers.qada} Qada (made up after its time); ${n.prayers.missed} marked as not prayed (before ${b.prayers.prayed}/${b.prayers.possible}, ${b.prayers.onTime} on time, ${b.prayers.qada} Qada, ${b.prayers.missed} not prayed); by prayer: ${n.prayers.perPrayer.map((x) => `${x.key} ${x.prayed}/${x.possible} (${x.onTime} on time, ${x.late} late, ${x.qada} Qada, ${x.missed} not prayed)`).join(', ')}`
      : 'Prayers: not tracked in this period',
    `Spending: total ${n.spending.total.toFixed(2)} (before ${b.spending.total.toFixed(2)}), per day ${n.spending.perDay.toFixed(2)}, ${n.spending.count} payments; top: ${n.spending.top.map((g) => `${g.name} ${g.amount.toFixed(2)}`).join(', ') || 'none'}`,
    `New words: ${n.words.added}; notes: ${n.notes}; links: ${n.links}`,
  ]
  return lines.join('\n')
}

