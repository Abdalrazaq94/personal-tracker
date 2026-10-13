import { useEffect, useState } from 'react'
import { callAi } from '../lib/ai'
import { today } from '../lib/dates'
import { useTranslateTo } from '../lib/lang'
import { MicButton, useListen } from '../lib/speech'
import { runActions } from '../lib/quickAdd'
import { Markdown } from './AiPanel'

const CURRENCY = import.meta.env.VITE_CURRENCY || 'GBP'

/* ------------------------- one box for everything ------------------------- */

export function QuickAddAll({ onChanged }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [lang] = useTranslateTo()

  const submit = async (value = text) => {
    const v = value.trim()
    if (!v || busy) return
    setBusy(true)
    setError(null)
    try {
      const { actions } = await callAi({ kind: 'parse', text: v, today: today() })
      const res = await runActions(actions, { lang })
      setResults(res)
      setText('')
      onChanged?.()
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  const listen = useListen({
    onResult: (t) => {
      setText(t)
      submit(t)
    },
  })

  const undo = async (i) => {
    const r = results[i]
    if (!r?.undo) return
    await r.undo()
    setResults((rs) => rs.map((x, j) => (j === i ? { ...x, undone: true } : x)))
    onChanged?.()
  }

  return (
    <section className="quick-all">
      <form
        className="add-word quick-all__box"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
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
          placeholder={listen.listening ? 'Listening…' : busy ? 'Adding…' : 'Add anything…'}
          disabled={busy}
          enterKeyHint="send"
        />
        <MicButton listen={listen} label="Say it" />
        <button className="btn" disabled={busy || !text.trim()}>
          {busy ? '…' : 'Add'}
        </button>
      </form>

      {!results.length && !error && !busy && (
        <p className="quick-all__hint">e.g. “buy milk tomorrow”, “coffee 3.40”, “new word resilient”, “read 10 pages done”</p>
      )}
      {(error || listen.error) && <p className="error-text">{error || listen.error}</p>}

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
