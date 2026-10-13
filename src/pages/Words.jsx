import { useEffect, useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import { callAi } from '../lib/ai'
import { MicButton, SpeakButton, useListen } from '../lib/speech'
import { Markdown } from '../components/AiPanel'
import { Sheet } from '../components/Collections'
import Practice from '../components/Practice'
import { STATUSES, StatusPicker } from '../components/StatusPicker'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader, Segmented } from '../components/ui'

/** "Resilient." → "resilient" (keeps "I" and names that look like names). */
const cleanSpoken = (t) => {
  const s = t.trim().replace(/[.,!?;:]+$/g, '')
  return /^[A-Z][a-z]/.test(s) && !/\s/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

export default function Words() {
  const { rows, loading, error, setError, insert, update, remove } = useRows('words')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [word, setWord] = useState('')
  const [translation, setTranslation] = useState('')
  const [status, setStatus] = useState('new')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState('') // '', 'translating', 'saving'
  const [explain, setExplain] = useState(null)
  const [practising, setPractising] = useState(false)

  const autoTranslate = async (w) => {
    setBusy('translating')
    try {
      const r = await callAi({ kind: 'translate', word: w })
      return r
    } catch (e) {
      setError(`Saved without translation: ${e.message}`)
      return null
    } finally {
      setBusy('')
    }
  }

  const listen = useListen({
    onResult: async (text) => {
      const w = cleanSpoken(text)
      setWord(w)
      if (!translation.trim()) {
        const r = await autoTranslate(w)
        if (r?.translation) setTranslation(r.translation)
      }
    },
  })

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, learning: 0, memorized: 0 }
    rows.forEach((r) => c[r.status]++)
    return c
  }, [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!s || r.word.toLowerCase().includes(s) || r.translation.toLowerCase().includes(s))
    )
  }, [rows, q, filter])

  const add = async (e) => {
    e.preventDefault()
    let w = word.trim()
    if (!w) return
    let tr = translation.trim()
    if (!tr) {
      const r = await autoTranslate(w)
      if (r) {
        tr = r.translation || ''
        if (r.word && r.word.toLowerCase() !== w.toLowerCase()) w = r.word // AI fixed the spelling
      }
    }
    setBusy('saving')
    const ok = await insert({ word: w, translation: tr, status })
    setBusy('')
    if (ok) {
      setWord('')
      setTranslation('')
      setStatus('new')
    }
  }

  const translateExisting = async (w) => {
    const r = await autoTranslate(w.word)
    if (r?.translation) update(w.id, { translation: r.translation })
  }

  return (
    <div className="page">
      <div className="sticky-search">
        <input
          type="search"
          className="search"
          placeholder={`Search ${rows.length} words…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <PageHeader
        title="Words"
        subtitle={`${counts.memorized} of ${counts.all} memorized`}
        right={
          rows.length > 0 && (
            <button className="btn btn--sm" onClick={() => setPractising(true)}>
              ✦ Practise
            </button>
          )
        }
      />
      <ErrorBar error={error || listen.error} onClose={() => (setError(null), listen.setError(null))} />

      <form className="card form" onSubmit={add}>
        <div className="word-form">
          <div className="field">
            <span>New word</span>
            <div className="input-row">
              <input
                value={listen.listening ? listen.interim || word : word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={listen.listening ? 'Listening…' : 'Type or say it'}
                autoCapitalize="none"
                required
              />
              <MicButton listen={listen} label="Say the word" />
            </div>
          </div>
          <label className="field">
            <span>Arabic</span>
            <input
              dir="auto"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder={busy === 'translating' ? 'Translating…' : 'Auto-translated'}
            />
          </label>
        </div>
        <div className="form-foot">
          <StatusPicker value={status} onChange={setStatus} />
          <button className="btn" disabled={!!busy}>
            {busy === 'translating' ? 'Translating…' : busy === 'saving' ? 'Saving…' : 'Add word'}
          </button>
        </div>
      </form>

      <div className="scroll-x">
        <Segmented
          small
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All', count: counts.all }].concat(
            STATUSES.map((s) => ({ ...s, count: counts[s.value] }))
          )}
        />
      </div>

      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>{rows.length ? 'No words match.' : 'No words yet. Type or say your first one above.'}</Empty>
      ) : (
        <div className="word-grid">
          {shown.map((w) =>
            editing === w.id ? (
              <EditWord
                key={w.id}
                w={w}
                onCancel={() => setEditing(null)}
                onSave={async (vals) => {
                  await update(w.id, vals)
                  setEditing(null)
                }}
              />
            ) : (
              <article key={w.id} className={`word word--${w.status}`}>
                <div className="word__top">
                  <h3 className="word__word">{w.word}</h3>
                  <div className="word__actions">
                    <SpeakButton text={w.word} label={`Hear "${w.word}"`} />
                    <button type="button" className="icon-btn" aria-label="Explain with AI" title="Explain with AI" onClick={() => setExplain(w)}>
                      ✦
                    </button>
                    <button type="button" className="icon-btn" aria-label="Edit" onClick={() => setEditing(w.id)}>
                      ✎
                    </button>
                    <DeleteButton label={`Delete "${w.word}"`} onClick={() => remove(w.id)} />
                  </div>
                </div>
                {w.translation ? (
                  <p className="word__tr" dir="auto">
                    {w.translation}
                  </p>
                ) : (
                  <button type="button" className="link word__translate" onClick={() => translateExisting(w)}>
                    Translate to Arabic
                  </button>
                )}
                <StatusPicker value={w.status} onChange={(s) => update(w.id, { status: s })} />
              </article>
            )
          )}
        </div>
      )}

      {explain && <ExplainSheet word={explain} onClose={() => setExplain(null)} />}
      {practising && (
        <Practice words={rows} onStatus={(id, s) => update(id, { status: s })} onClose={() => setPractising(false)} />
      )}
    </div>
  )
}

function ExplainSheet({ word, onClose }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let live = true
    callAi({ kind: 'explain', word: word.word, translation: word.translation })
      .then((r) => live && setState({ text: r.text }))
      .catch((e) => live && setState({ error: e.message }))
    return () => {
      live = false
    }
  }, [word])
  return (
    <Sheet title={word.word} onClose={onClose}>
      <div className="explain-head">
        <SpeakButton text={word.word} />
        {word.translation && (
          <span dir="auto" className="muted">
            {word.translation}
          </span>
        )}
      </div>
      {state.loading && <div className="ai-loading">Thinking…</div>}
      {state.error && <p className="error-text">{state.error}</p>}
      {state.text && <Markdown text={state.text} />}
    </Sheet>
  )
}

function EditWord({ w, onSave, onCancel }) {
  const [word, setWord] = useState(w.word)
  const [tr, setTr] = useState(w.translation)
  return (
    <form
      className={`word word--${w.status}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (word.trim()) onSave({ word: word.trim(), translation: tr.trim() })
      }}
    >
      <input className="input-plain" value={word} onChange={(e) => setWord(e.target.value)} autoFocus />
      <input className="input-plain" dir="auto" value={tr} onChange={(e) => setTr(e.target.value)} placeholder="Arabic" />
      <div className="form-foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--sm">Save</button>
      </div>
    </form>
  )
}
