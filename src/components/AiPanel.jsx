import { useState } from 'react'
import { callAi } from '../lib/ai'
import { today } from '../lib/dates'
import { T, Tr } from '../lib/i18n'

const CURRENCY = import.meta.env.VITE_CURRENCY || 'GBP'
const FRESH_MS = 30 * 60e3 // reuse an answer for 30 minutes, so opening the box again is instant

const cacheKey = (kind, q) => `ai-answer|${kind}|${today()}|${(q || '').trim().toLowerCase()}`
function cached(kind, q) {
  try {
    const j = JSON.parse(sessionStorage.getItem(cacheKey(kind, q)) || 'null')
    return j && Date.now() - j.at < FRESH_MS ? j.text : null
  } catch {
    return null
  }
}
function remember(kind, q, text) {
  try {
    sessionStorage.setItem(cacheKey(kind, q), JSON.stringify({ at: Date.now(), text }))
  } catch {
    /* fine */
  }
}

/** "Analyse with AI" box used on the Tasks and Spending pages. */
export default function AiPanel({ kind, examples = [], children, extra = {}, label }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)

  const run = async (q = question, fresh = false) => {
    const hit = !fresh && cached(kind, q)
    if (hit) {
      setError(null)
      setText(hit)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const data = await callAi({ kind, question: q, today: today(), currency: CURRENCY, ...extra })
      setText(data?.text || T('No answer.'))
      if (data?.text) remember(kind, q, data.text)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  if (!open)
    return (
      <button type="button" className="ai-toggle" onClick={() => setOpen(true)}>
        <span className="ai-spark" aria-hidden>✦</span>
        <span>
          <strong>{T("Analyse with AI")}</strong>
          <span className="muted small"> · {label || (kind === 'tasks' ? T("how your tasks are going") : kind === 'habits' ? T("graphs + how your habits are going") : kind === 'prayers' ? T("graph + how your prayers are going") : T("where your money goes"))}</span>
        </span>
      </button>
    );

  return (
    <section className="ai-panel">
      <div className="ai-panel__head">
        <h2>{Tr("{0} AI analysis", <span className="ai-spark" aria-hidden>✦</span>)}</h2>
        <button type="button" className="icon-btn" aria-label={T("Close")} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      {children}

      <form
        className="ai-ask"
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <input
          dir="auto"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={T("Ask a question (optional)")}
        />
        <button className="btn" disabled={busy}>
          {busy ? '…' : T("Analyse")}
        </button>
      </form>

      {examples.length > 0 && !text && !busy && (
        <div className="ai-examples">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              onClick={() => {
                setQuestion(ex)
                run(ex)
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {busy && <div className="ai-loading">{T("Thinking…")}</div>}
      {error && <p className="error-text">{error}</p>}
      {text && !busy && <Markdown text={text} />}
      {text && !busy && (
        <button type="button" className="btn btn--ghost small" onClick={() => run(question, true)}>
          {T("Ask again")}
        </button>
      )}
    </section>
  );
}

/** Tiny renderer for the AI's headings, bullets and **bold**. */
export function Markdown({ text }) {
  const blocks = []
  let list = null
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/)
    if (bullet) {
      if (!list) blocks.push((list = { type: 'ul', items: [] }))
      list.items.push(bullet[1])
      return
    }
    list = null
    if (!line.trim()) return
    const h = line.match(/^#{1,4}\s+(.*)/)
    blocks.push(h ? { type: 'h', text: h[1], key: i } : { type: 'p', text: line, key: i })
  })
  return (
    <div className="ai-result" dir="auto">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i}>
            {b.items.map((t, j) => (
              <li key={j}>{inline(t)}</li>
            ))}
          </ul>
        ) : b.type === 'h' ? (
          <h3 key={i}>{inline(b.text)}</h3>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        )
      )}
    </div>
  )
}

const inline = (s) =>
  s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    )
  )
