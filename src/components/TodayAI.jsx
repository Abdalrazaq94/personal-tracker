import { useEffect, useState } from 'react'
import { callAi } from '../lib/ai'
import { today } from '../lib/dates'
import { useTranslateTo } from '../lib/lang'
import { MicButton, useListen } from '../lib/speech'
import { actionFromDraft, draftFromAction, guessLocal, runActions } from '../lib/quickAdd'
import { supabase } from '../lib/supabase'
import { Markdown } from './AiPanel'

const CURRENCY = import.meta.env.VITE_CURRENCY || 'GBP'

/* ------------------------- one box for everything ------------------------- */

const TYPES = [
  ['task', 'Task'],
  ['plan', 'Plan'],
  ['expense', 'Spend'],
  ['word', 'Word'],
  ['habit', 'Habit'],
  ['note', 'Note'],
]
export const REMIND = [
  [0, 'Remind at the time'],
  [15, '15 min before'],
  [60, '1 hour before'],
  [1440, '1 day before'],
]
const TITLE_LABEL = { task: 'Task', plan: 'What', expense: 'What for', word: 'Word', habit: 'Habit', note: 'Note' }

/**
 * Type or say anything → choose what it is (Task, Plan, Spend…) → Add.
 * The AI suggests the type, date and time; without the AI a built-in guesser does it.
 */
export function QuickAddAll({ onChanged }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [drafts, setDrafts] = useState(null) // waiting for "Add"
  const [info, setInfo] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [habits, setHabits] = useState([])
  const [lang] = useTranslateTo()

  useEffect(() => {
    supabase
      .from('habits')
      .select('id, name, kind')
      .then(({ data }) => setHabits(data || []))
  }, [])

  const read = async (value = text) => {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    setError(null)
    setInfo('')
    setResults([])
    let list = []
    try {
      const { actions } = await callAi({ kind: 'parse', text: v, today: today() }, { timeoutMs: 20000 })
      list = (actions || []).map(draftFromAction)
    } catch {
      list = guessLocal(v, habits)
      setInfo('Filled in without the AI: check it, then Add.')
    }
    if (!list.length) list = [{ type: 'task', title: v }]
    setDrafts(list.map((d) => (d.type === 'habit' && !d.habit_id ? { ...d, type: 'task' } : d)))
    setBusy(false)
  }

  const add = async () => {
    const actions = drafts.map((d) => actionFromDraft({ ...d, habitName: habits.find((h) => h.id === d.habit_id)?.name })).filter(Boolean)
    if (!actions.length) return setError('Nothing to add yet. Fill in the details first.')
    setBusy(true)
    const res = await runActions(actions, { lang })
    setResults(res)
    setDrafts(null)
    setText('')
    setInfo('')
    setBusy(false)
    onChanged?.()
  }

  const listen = useListen({
    onResult: (t) => {
      setText(t)
      read(t)
    },
  })

  const undo = async (i) => {
    const r = results[i]
    if (!r?.undo) return
    await r.undo()
    setResults((rs) => rs.map((x, j) => (j === i ? { ...x, undone: true } : x)))
    onChanged?.()
  }

  const setDraft = (i, patch) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  return (
    <section className="quick-all">
      <form
        className="add-word quick-all__box"
        onSubmit={(e) => {
          e.preventDefault()
          read()
        }}
      >
        <span className="ai-spark" aria-hidden>
          ✦
        </span>
        <input
          dir="auto"
          aria-label="Add anything"
          value={listen.listening ? listen.interim || text : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listen.listening ? 'Listening…' : busy ? 'Reading…' : 'Add anything…'}
          disabled={busy}
          enterKeyHint="go"
        />
        <MicButton listen={listen} label="Say it" />
        <button className="btn" disabled={busy || !text.trim()}>
          {busy ? '…' : 'Next'}
        </button>
      </form>

      {!drafts && !results.length && !error && !busy && (
        <p className="quick-all__hint">e.g. “buy milk tomorrow at 3 40”, “coffee 3.40”, “new word resilient”</p>
      )}
      {listen.listening && <p className="quick-all__hint">Listening… speak now, then wait a second.</p>}
      {(error || listen.error) && <p className="error-text">{error || listen.error}</p>}

      {drafts && (
        <div className="qa-review">
          {info && <p className="muted small">{info}</p>}
          {drafts.map((d, i) => (
            <div key={i} className="qa-card">
              <div className="qa-types" role="group" aria-label="What is it?">
                {TYPES.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`chip${d.type === k ? ' chip--solid is-active' : ''}`}
                    disabled={k === 'habit' && !habits.length}
                    onClick={() =>
                      setDraft(i, {
                        type: k,
                        date: d.date || today(),
                        ...(k === 'habit' && !d.habit_id && habits[0] ? { habit_id: habits[0].id, count: 1 } : {}),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
                {drafts.length > 1 && (
                  <button type="button" className="icon-btn qa-remove" aria-label="Remove" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </div>

              {d.type === 'habit' ? (
                <div className="qa-row">
                  <select value={d.habit_id || ''} onChange={(e) => setDraft(i, { habit_id: e.target.value })} aria-label="Habit">
                    {habits.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <input className="qa-small" inputMode="numeric" value={d.count ?? 1} onChange={(e) => setDraft(i, { count: e.target.value.replace(/\D/g, '') })} aria-label="How many" />
                </div>
              ) : (
                <input
                  dir="auto"
                  className="qa-title"
                  value={d.title || ''}
                  onChange={(e) => setDraft(i, { title: e.target.value })}
                  placeholder={TITLE_LABEL[d.type]}
                  aria-label={TITLE_LABEL[d.type]}
                />
              )}

              {d.type === 'plan' && (
                <div className="qa-row">
                  <input type="date" value={d.date || today()} onChange={(e) => setDraft(i, { date: e.target.value })} aria-label="Day" />
                  <input type="time" value={d.time || ''} onChange={(e) => setDraft(i, { time: e.target.value || null })} aria-label="Time (optional)" />
                </div>
              )}
              {d.type === 'expense' && (
                <div className="qa-row">
                  <input inputMode="decimal" placeholder="0.00" value={d.amount ?? ''} onChange={(e) => setDraft(i, { amount: e.target.value })} aria-label="Amount" />
                  <input type="date" value={d.date || today()} onChange={(e) => setDraft(i, { date: e.target.value })} aria-label="Day" />
                </div>
              )}
              {d.type === 'plan' && (
                <div className="qa-row">
                  <label className="qa-check">
                    <input type="checkbox" checked={!!d.important} onChange={(e) => setDraft(i, { important: e.target.checked })} /> Important
                  </label>
                  {d.time && (
                    <select value={d.remind_before || 0} onChange={(e) => setDraft(i, { remind_before: Number(e.target.value) })} aria-label="Remind me">
                      {REMIND.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {d.type === 'task' && (
                <label className="qa-check">
                  <input type="checkbox" checked={!!d.important} onChange={(e) => setDraft(i, { important: e.target.checked })} /> Important
                </label>
              )}
            </div>
          ))}
          <div className="qa-actions">
            <button type="button" className="btn" onClick={add} disabled={busy}>
              {busy ? 'Adding…' : drafts.length > 1 ? `Add all ${drafts.length}` : 'Add'}
            </button>
            <button type="button" className="link" onClick={() => setDrafts(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <ul className="quick-all__results">
          {results.map((r, i) => (
            <li key={i} className={r.undone ? 'is-undone' : r.ok ? '' : 'is-bad'}>
              <span className="mark mark--ok" aria-hidden>
                {r.ok && !r.undone ? '✓' : '–'}
              </span>
              <span dir="auto">{r.undone ? `Undone · ${r.label}` : r.label}</span>
              {r.ok && !r.undone && r.undo && (
                <button type="button" className="link small" onClick={() => undo(i)}>
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------ AI day summary ----------------------------- */

const KEY = () => `brief:${today()}`

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY()) || 'null')
  } catch {
    return null
  }
}

export function DayBrief() {
  const [brief, setBrief] = useState(readCache)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await callAi({ kind: 'today', today: today(), hour: new Date().getHours(), currency: CURRENCY })
      const b = { text: r.text, at: Date.now() }
      setBrief(b)
      try {
        localStorage.setItem(KEY(), JSON.stringify(b))
      } catch {}
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  // load automatically once a day (saves AI allowance); the button refreshes it
  useEffect(() => {
    if (!readCache()) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const at = brief?.at ? new Date(brief.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <section className="day-brief">
      <div className="day-brief__head">
        <h2>
          <span className="ai-spark" aria-hidden>
            ✦
          </span>{' '}
          Your day
        </h2>
        <button type="button" className="link small" onClick={load} disabled={busy}>
          {busy ? 'Thinking…' : at ? `Refresh · ${at}` : 'Refresh'}
        </button>
      </div>
      {busy && !brief && <div className="ai-loading">Looking at your day…</div>}
      {error && (
        <p className="error-text">
          {error}{' '}
          <button className="link small" onClick={load}>
            Try again
          </button>
        </p>
      )}
      {brief && <Markdown text={brief.text} />}
    </section>
  )
}
