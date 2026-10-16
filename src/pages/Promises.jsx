import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, today as todayYmd } from '../lib/dates'
import { previousOf } from '../lib/review'
import { callAi } from '../lib/ai'
import {
  EMOJIS,
  GOALS,
  NEEDS_PROMISES_SQL,
  addDays,
  daysText,
  promiseStats,
  promisesMissing,
  promisesReport,
  promisesSummary,
  stateOn,
  logMap,
} from '../lib/promises'
import { T, Tr, LANG, LOCALE } from '../lib/i18n'
import { ErrorBar, PageHeader, Segmented } from '../components/ui'
import PeriodPicker, { usePeriod } from '../components/PeriodPicker'
import { Markdown } from '../components/AiPanel'
import Reveal from '../components/bits/Reveal'
import { parseYmd } from '../lib/dates'
import { AiCat } from '../components/Cat'

const promiseLine = (p) => (p.kind === 'avoid' ? T('I promise not to {0}', [p.title]) : T('I promise to {0}', [p.title]))

export default function Promises() {
  const t = todayYmd()
  const [list, setList] = useState(null)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // null | 'new' | promise

  const load = async () => {
    const [p, l] = await Promise.all([
      supabase.from('promises').select('*').order('created_at', { ascending: true }),
      supabase.from('promise_logs').select('*'),
    ])
    const err = p.error || l.error
    if (err) {
      setError(promisesMissing(err) ? T(NEEDS_PROMISES_SQL) : err.message)
      setList([])
      return
    }
    setList(p.data || [])
    setLogs(l.data || [])
  }
  useEffect(() => {
    load()
  }, [])

  const active = (list || []).filter((p) => !p.ended_at)
  const ended = (list || []).filter((p) => p.ended_at)

  // ---- saving ----
  const setDay = async (p, day, kept, note = '') => {
    setError(null)
    const old = logs.find((l) => l.promise_id === p.id && l.day === day)
    const auto = p.kind === 'avoid' ? kept : !kept // the state you get with no row at all
    if (auto && !note) {
      // back to the default: just remove the row
      setLogs((ls) => ls.filter((l) => l !== old))
      if (old) {
        const { error } = await supabase.from('promise_logs').delete().eq('id', old.id)
        if (error) setError(error.message)
      }
      return
    }
    const row = { promise_id: p.id, day, kept, note: note.slice(0, 300) }
    setLogs((ls) => [...ls.filter((l) => l !== old), { ...old, ...row }])
    const { data, error } = await supabase.from('promise_logs').upsert(row, { onConflict: 'promise_id,day' }).select().single()
    if (error) {
      setError(error.message)
      setLogs((ls) => [...ls.filter((l) => !(l.promise_id === p.id && l.day === day)), ...(old ? [old] : [])])
    } else if (data) setLogs((ls) => [...ls.filter((l) => !(l.promise_id === p.id && l.day === day)), data])
  }
  const update = async (p, patch) => {
    setList((ls) => ls.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('promises').update(patch).eq('id', p.id)
    if (error) setError(error.message)
  }
  const remove = async (p) => {
    setList((ls) => ls.filter((x) => x.id !== p.id))
    setLogs((ls) => ls.filter((l) => l.promise_id !== p.id))
    const { error } = await supabase.from('promises').delete().eq('id', p.id)
    if (error) setError(error.message)
  }

  return (
    <div className="page promises">
      <PageHeader title={T('Promises')} subtitle={T('Promises you make to yourself, and how well you keep them')} />
      <ErrorBar error={error} onClose={() => setError(null)} />

      {form ? (
        <PromiseForm
          promise={form === 'new' ? null : form}
          today={t}
          onCancel={() => setForm(null)}
          onSaved={(p, isNew) => {
            setList((ls) => (isNew ? [...ls, p] : ls.map((x) => (x.id === p.id ? p : x))))
            setForm(null)
          }}
          onError={setError}
        />
      ) : (
        <button type="button" className="btn promise-new" onClick={() => setForm('new')}>
          {T('+ New promise')}
        </button>
      )}

      {list === null ? (
        <div className="empty muted loading-text">{T('Loading…')}</div>
      ) : list.length === 0 ? (
        <Reveal as="section" className="card promise-empty">
          <div aria-hidden className="promise-empty__icon">
            🤝
          </div>
          <p>
            <strong>{T('Make your first promise')}</strong>
          </p>
          <p className="muted small">{T('For example: not to smoke, no coffee after 3pm, no phone in bed, read 10 pages every day.')}</p>
        </Reveal>
      ) : (
        <>
          {active.map((p) => (
            <PromiseCard
              key={p.id}
              p={p}
              logs={logs}
              today={t}
              setDay={setDay}
              onEdit={() => setForm(p)}
              onEnd={() => update(p, { ended_at: t })}
              onDelete={() => remove(p)}
            />
          ))}

          {list.length > 0 && <PromisesReport promises={list} logs={logs} today={t} />}

          {ended.length > 0 && (
            <Reveal as="section" className="card">
              <h2 className="promise-sec">{T('Finished promises')}</h2>
              <ul className="promise-ended">
                {ended.map((p) => {
                  const s = promiseStats(p, logs, t)
                  return (
                    <li key={p.id}>
                      <span aria-hidden>{p.emoji}</span>
                      <span className="promise-ended__text">
                        <strong dir="auto">{promiseLine(p)}</strong>
                        <span className="muted small">
                          {T('{0} kept · longest streak {1}', [daysText(s.kept), daysText(s.longest)])}
                        </span>
                      </span>
                      <button type="button" className="link small" onClick={() => update(p, { ended_at: null })}>
                        {T('Start again')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Reveal>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------ one promise ------------------------------ */

function PromiseCard({ p, logs, today, setDay, onEdit, onEnd, onDelete }) {
  const s = useMemo(() => promiseStats(p, logs, today), [p, logs, today])
  const [breaking, setBreaking] = useState(false)
  const [note, setNote] = useState('')
  const [menu, setMenu] = useState(false)

  const ringTarget = s.goal || s.nextMilestone || Math.max(1, s.progressDays)
  const ringValue = Math.min(1, s.progressDays / ringTarget)
  const todayLog = logs.find((l) => l.promise_id === p.id && l.day === today)

  return (
    <Reveal as="section" className={`card promise promise--${s.today}`}>
      <div className="promise__head">
        <span className="promise__emoji" aria-hidden>
          {p.emoji}
        </span>
        <div className="promise__title">
          <h2 dir="auto">{promiseLine(p)}</h2>
          <span className="muted small">
            {T('since {0}', [parseYmd(p.start_date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })])}
            {s.goal ? ` · ${T('goal {0}', [daysText(s.goal)])}` : ` · ${T('for good')}`}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label={T('More')} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          ⋯
        </button>
      </div>
      {menu && (
        <div className="promise__menu">
          <button
            type="button"
            className="chip"
            onClick={() => {
              setMenu(false)
              onEdit()
            }}
          >
            {T('Edit')}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              setMenu(false)
              onEnd()
            }}
          >
            {T('Finish this promise')}
          </button>
          <button
            type="button"
            className="chip chip--danger"
            onClick={() => {
              setMenu(false)
              if (window.confirm(T('Delete this promise and all its days?'))) onDelete()
            }}
          >
            {T('Delete')}
          </button>
        </div>
      )}

      <div className="promise__main">
        <Ring value={ringValue} big={s.progressDays} label={p.kind === 'avoid' ? T('days in a row') : T('days done')} />
        <ul className="promise__facts">
          <li>
            <span>{T('Kept')}</span>
            <strong>
              {s.kept}/{s.kept + s.broken}
            </strong>
            <span className="muted small">{s.rate == null ? '' : `${Math.round(s.rate * 100)}%`}</span>
          </li>
          <li>
            <span>{T('Best streak')}</span>
            <strong>{daysText(s.longest)}</strong>
          </li>
          {s.saved > 0 && (
            <li>
              <span>{T('Money saved')}</span>
              <strong className="is-good">{money(s.saved)}</strong>
            </li>
          )}
          <li>
            <span>{s.reached ? T('Goal reached') : s.goal ? T('Goal') : T('Next milestone')}</span>
            <strong>{s.reached ? '🎉' : s.goal ? `${Math.round(s.progress * 100)}%` : s.nextMilestone ? daysText(s.nextMilestone) : '—'}</strong>
            {!s.reached && (s.goal || s.nextMilestone) && (
              <span className="muted small">{T('{0} to go', [daysText(Math.max(0, (s.goal || s.nextMilestone) - s.progressDays))])}</span>
            )}
          </li>
        </ul>
      </div>

      {s.reached && (
        <p className="promise__win">
          {Tr('{0} You reached your goal of {1}! Keep going, or finish the promise from ⋯.', <span aria-hidden>🎉</span>, <b>{daysText(s.goal)}</b>)}
        </p>
      )}
      {p.why && (
        <p className="promise__why" dir="auto">
          {Tr('Your reason: {0}', <em>{p.why}</em>)}
        </p>
      )}

      {/* ---- today ---- */}
      <div className="promise__today">
        {p.kind === 'avoid' ? (
          s.today === 'broken' ? (
            <>
              <span>{T('Broken today')}{todayLog?.note ? ` · “${todayLog.note}”` : ''}</span>
              <button type="button" className="link small" onClick={() => setDay(p, today, true)}>
                {T('Undo')}
              </button>
            </>
          ) : (
            <>
              <span className="promise__ok">{T('✓ Kept today so far')}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBreaking(!breaking)}>
                {T('I broke it')}
              </button>
            </>
          )
        ) : s.today === 'kept' ? (
          <>
            <span className="promise__ok">{T('✓ Done today')}</span>
            <button type="button" className="link small" onClick={() => setDay(p, today, false)}>
              {T('Undo')}
            </button>
          </>
        ) : (
          <>
            <span>{T('Not done yet today')}</span>
            <button type="button" className="btn btn--sm" onClick={() => setDay(p, today, true)}>
              {T('✓ I did it')}
            </button>
          </>
        )}
      </div>
      {breaking && (
        <form
          className="promise__break"
          onSubmit={(e) => {
            e.preventDefault()
            setDay(p, today, false, note.trim())
            setBreaking(false)
            setNote('')
          }}
        >
          <input dir="auto" autoFocus maxLength={300} placeholder={T('What happened? (optional, helps the analysis)')} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn--sm">{T('Save')}</button>
          <span className="muted small promise__kind">{T('It’s OK. A slip is not the end: tomorrow is a new day.')}</span>
        </form>
      )}

      <Calendar p={p} logs={logs} today={today} setDay={setDay} />
    </Reveal>
  )
}

function Ring({ value, big, label }) {
  const R = 42
  const C = 2 * Math.PI * R
  return (
    <div className="promise-ring" role="img" aria-label={`${big} ${label}`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={R} className="promise-ring__track" />
        <circle cx="50" cy="50" r={R} className="promise-ring__fill" strokeDasharray={`${C * value} ${C}`} transform="rotate(-90 50 50)" />
      </svg>
      <div className="promise-ring__text">
        <strong>{big}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

/** Last 5 weeks; tap a day to change it (kept ↔ broken, or done ↔ not done). */
function Calendar({ p, logs, today, setDay }) {
  const logOf = logMap(p, logs)
  // start on the Monday 4 weeks before this week
  const dt = parseYmd(today)
  const monday = addDays(today, -((dt.getDay() + 6) % 7) - 28)
  const days = Array.from({ length: 35 }, (_, i) => addDays(monday, i))
  const heads = Array.from({ length: 7 }, (_, i) => parseYmd(addDays(monday, i)).toLocaleDateString(LOCALE, { weekday: 'narrow' }))
  const name = { kept: T('kept'), broken: T('broken'), missed: T('not done'), pending: T('not yet'), before: '', after: '', future: '' }
  return (
    <div className="promise-cal">
      <div className="promise-cal__grid">
        {heads.map((h, i) => (
          <span key={'h' + i} className="promise-cal__head">
            {h}
          </span>
        ))}
        {days.map((d) => {
          const st = stateOn(p, logOf, d, today)
          const can = ['kept', 'broken', 'missed', 'pending'].includes(st)
          const note = logOf.get(d)?.note
          const label = `${parseYmd(d).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}: ${name[st] || ''}${note ? ` · ${note}` : ''}`
          return (
            <button
              key={d}
              type="button"
              className={`promise-cal__day is-${st}${d === today ? ' is-today' : ''}`}
              disabled={!can}
              title={label}
              aria-label={label}
              onClick={() => setDay(p, d, st !== 'kept')}
            >
              {parseYmd(d).getDate()}
            </button>
          )
        })}
      </div>
      <p className="promise-cal__legend muted small">
        {Tr('{0} kept {1} broken · tap a day to change it', <span className="promise-cal__dot is-kept" />, <span className="promise-cal__dot is-broken" />)}
      </p>
    </div>
  )
}

/* ------------------------------ report + AI ------------------------------ */

function PromisesReport({ promises, logs, today }) {
  const pick = usePeriod('month')
  const { period } = pick
  const before = useMemo(() => previousOf(period), [period.from, period.to, period.kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const r = promisesReport(promises, logs, period, before, today)
  const future = period.from > today

  return (
    <>
      <h2 className="promise-report__title">{T('Progress report')}</h2>
      <PeriodPicker state={pick} />
      {future ? (
        <div className="empty muted">{T('This period hasn’t started yet.')}</div>
      ) : !r.rows.length ? (
        <div className="empty muted">{T('No promises were running in this period.')}</div>
      ) : (
        <>
          <div className="review-kpis">
            <div className="review-kpi">
              <span className="review-kpi__label">{T('Days kept')}</span>
              <strong className="review-kpi__value">{r.rate == null ? '—' : `${Math.round(r.rate * 100)}%`}</strong>
              <span className={`review-kpi__delta ${r.rateBefore == null ? '' : r.rate >= r.rateBefore ? 'is-good' : 'is-bad'}`}>
                {r.rateBefore == null ? T('nothing to compare') : T('{0}% before', [Math.round(r.rateBefore * 100)])}
              </span>
            </div>
            <div className="review-kpi">
              <span className="review-kpi__label">{T('Times broken')}</span>
              <strong className="review-kpi__value">{r.broken}</strong>
              <span className={`review-kpi__delta ${r.broken <= r.brokenBefore ? 'is-good' : 'is-bad'}`}>{T('{0} before', [r.brokenBefore])}</span>
            </div>
          </div>
          <Reveal as="section" className="card review-card">
            {r.rows.map(({ p, now, before: b }) => (
              <div key={p.id} className="review-meter">
                <div className="review-meter__head">
                  <span dir="auto">
                    {p.emoji} {p.title}
                  </span>
                  <strong>{now.rate == null ? '—' : `${Math.round(now.rate * 100)}%`}</strong>
                </div>
                <div className={`review-meter__bar ${now.rate != null && now.rate < 0.5 ? 'is-bad' : ''}`} aria-hidden>
                  <span style={{ width: `${(now.rate || 0) * 100}%` }} />
                </div>
                <span className="muted small">
                  {T('{0} of {1} days kept', [now.kept, now.days])}
                  {b.days ? ` · ${T('{0}% before', [Math.round((b.rate || 0) * 100)])}` : ''}
                </span>
              </div>
            ))}
          </Reveal>
          <PromisesAi promises={promises} logs={logs} today={today} period={period} label={pick.label} />
        </>
      )}
    </>
  )
}

const ASK = [
  { label: 'What makes me break it?', q: 'Looking at the days I broke my promises and my notes, what triggers it and when am I most at risk?' },
  { label: 'How do I keep going?', q: 'Give me a simple plan to keep my hardest promise for the next 7 days.' },
]

function PromisesAi({ promises, logs, today, period, label }) {
  const key = `promises-ai|${LANG}|${period.from}|${period.to}`
  const read = () => {
    try {
      return localStorage.getItem(key) || ''
    } catch {
      return ''
    }
  }
  const [text, setText] = useState(read)
  useEffect(() => setText(read()), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [asked, setAsked] = useState(null)

  const run = async (item) => {
    setBusy(true)
    setError(null)
    setAsked(item?.label || null)
    try {
      const r = await callAi({
        kind: 'promises',
        label,
        from: period.from,
        to: period.to,
        today,
        summary: promisesSummary(
          promises.filter((p) => p.start_date <= period.to && (!p.ended_at || p.ended_at >= period.from)),
          logs,
          today,
          period
        ),
        question: item?.q || '',
      })
      setText(r.text)
      if (!item)
        try {
          localStorage.setItem(key, r.text)
        } catch {
          /* fine */
        }
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <Reveal as="section" className="card review-ai">
      <h2>{Tr('{0} AI analysis', <AiCat />)}</h2>
      {!text && !busy && <p className="small">{T('The AI looks at your streaks, the days you slipped and your notes, and gives you a plan.')}</p>}
      <div className="chips-row">
        <button type="button" className={`chip ${!asked && text ? 'is-active chip--solid' : ''}`} disabled={busy} onClick={() => run(null)}>
          {text && !asked ? T('↻ Analyse again') : T('✦ Analyse my promises')}
        </button>
        {ASK.map((x) => (
          <button key={x.label} type="button" className={`chip ${asked === x.label ? 'is-active chip--solid' : ''}`} disabled={busy} onClick={() => run(x)}>
            {T(x.label)}
          </button>
        ))}
      </div>
      {busy && <div className="ai-loading">{T('Thinking…')}</div>}
      {error && <p className="error-text">{error}</p>}
      {text && !busy && <Markdown text={text} />}
    </Reveal>
  )
}

/* ------------------------------ new / edit ------------------------------ */

function PromiseForm({ promise, today, onCancel, onSaved, onError }) {
  const [kind, setKind] = useState(promise?.kind || 'avoid')
  const [title, setTitle] = useState(promise?.title || '')
  const [emoji, setEmoji] = useState(promise?.emoji || '🤝')
  const [why, setWhy] = useState(promise?.why || '')
  const [start, setStart] = useState(promise?.start_date || today)
  const [goal, setGoal] = useState(promise ? promise.goal_days : 30)
  const [cost, setCost] = useState(promise?.cost ? String(promise.cost) : '')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const clean = title.trim().replace(/^(i promise )?(not to|to)\s+/i, '')
    if (!clean) return onError(T('Write what you promise.'))
    const c = cost.trim() ? Number(cost.replace(',', '.')) : null
    if (c != null && !(c >= 0)) return onError(T('Enter a number for the money, or leave it empty.'))
    setBusy(true)
    const row = { kind, title: clean.slice(0, 120), emoji, why: why.trim().slice(0, 300), start_date: start, goal_days: goal || null, cost: kind === 'avoid' ? c : null }
    const q = promise ? supabase.from('promises').update(row).eq('id', promise.id).select().single() : supabase.from('promises').insert(row).select().single()
    const { data, error } = await q
    setBusy(false)
    if (error) return onError(promisesMissing(error) ? T(NEEDS_PROMISES_SQL) : error.message)
    onSaved(data, !promise)
  }

  const examples = kind === 'avoid' ? [T('smoke'), T('drink coffee'), T('use my phone in bed'), T('eat sweets')] : [T('read 10 pages'), T('walk 30 minutes'), T('drink 8 glasses of water')]
  return (
    <form className="card form promise-form" onSubmit={save}>
      <h2>{promise ? T('Edit promise') : T('New promise')}</h2>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'avoid', label: T('Not to…') },
          { value: 'do', label: T('To… every day') },
        ]}
      />
      <label className="field">
        <span>{kind === 'avoid' ? T('I promise not to…') : T('I promise to…')}</span>
        <input dir="auto" autoFocus required maxLength={120} placeholder={examples[0]} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="chips-row">
        {examples.map((x) => (
          <button key={x} type="button" className="chip" onClick={() => setTitle(x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="field">
        <span>{T('Icon')}</span>
        <div className="promise-emojis">
          {EMOJIS.map((x) => (
            <button key={x} type="button" className={emoji === x ? 'is-on' : ''} aria-pressed={emoji === x} onClick={() => setEmoji(x)}>
              {x}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>{T('Why? (optional, shown when it gets hard)')}</span>
        <input dir="auto" maxLength={300} placeholder={T('e.g. for my health and my family')} value={why} onChange={(e) => setWhy(e.target.value)} />
      </label>
      <div className="row-2">
        <label className="field">
          <span>{T('Starting from')}</span>
          <input type="date" value={start} max={today} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </label>
        {kind === 'avoid' && (
          <label className="field">
            <span>{T('Money it costs a day (optional)')}</span>
            <input inputMode="decimal" placeholder="0.00" value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
        )}
      </div>
      <div className="field">
        <span>{T('Goal')}</span>
        <div className="chips-row">
          {GOALS.map((g) => (
            <button key={g} type="button" className={`chip ${goal === g ? 'is-active chip--solid' : ''}`} onClick={() => setGoal(g)}>
              {daysText(g)}
            </button>
          ))}
          <button type="button" className={`chip ${!goal ? 'is-active chip--solid' : ''}`} onClick={() => setGoal(null)}>
            {T('For good')}
          </button>
        </div>
      </div>
      <p className="muted small">
        {kind === 'avoid'
          ? T('Every day counts as kept unless you tap “I broke it”.')
          : T('Tap “I did it” each day you keep it.')}
      </p>
      <div className="form-foot form-foot--end">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {T('Cancel')}
        </button>
        <button className="btn" disabled={busy}>
          {busy ? '…' : T('Save')}
        </button>
      </div>
    </form>
  )
}
