import { useEffect, useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import { callAi } from '../lib/ai'
import { LANGUAGES, useTranslateTo } from '../lib/lang'
import { MicButton, SpeakButton, useListen } from '../lib/speech'
import { Markdown } from '../components/AiPanel'
import { Sheet } from '../components/Collections'
import Practice from '../components/Practice'
import { STATUSES, StatusPicker } from '../components/StatusPicker'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader, Segmented } from '../components/ui'
import { T } from '../lib/i18n'

/** "Resilient." → "resilient" (keeps "I" and names that look like names). */
const cleanSpoken = (t) => {
  const s = t.trim().replace(/[.,!?;:]+$/g, '')
  return /^[A-Z][a-z]/.test(s) && !/\s/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export default function Words() {
  const { rows, loading, error, setError, insert, update, remove } = useRows('words')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [word, setWord] = useState('')
  const [lang, setLang] = useTranslateTo()
  const [editing, setEditing] = useState(null)
  const [translating, setTranslating] = useState(() => new Set()) // ids being translated
  const [explain, setExplain] = useState(null)
  const [practising, setPractising] = useState(false)

  const mark = (id, on) =>
    setTranslating((prev) => {
      const next = new Set(prev)
      on ? next.add(id) : next.delete(id)
      return next
    })

  // Runs in the background: the word card is already on screen while the translation is fetched.
  const translate = async (row) => {
    mark(row.id, true)
    try {
      const r = await callAi({ kind: 'translate', word: row.word, lang })
      if (r?.translation) await update(row.id, { translation: r.translation })
    } catch (e) {
      setError(T("Couldn’t translate “{0}”: {1}", [row.word, e.message]))
    } finally {
      mark(row.id, false)
    }
  }

  const addWord = async (raw) => {
    const w = raw.trim()
    if (!w) return
    setWord('')
    const row = await insert({ word: w, translation: '', status: 'new' })
    if (row) translate(row)
    else setWord(w)
  }

  const listen = useListen({ onResult: (text) => addWord(cleanSpoken(text)) })

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

  return (
    <div className="page">
      <div className="sticky-search">
        <input
          type="search"
          className="search"
          placeholder={T("Search {0} words…", [rows.length])}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <PageHeader
        title={T("Words")}
        subtitle={T("{0} of {1} memorized", [counts.memorized, counts.all])}
        right={
          rows.length > 0 && (
            <button className="btn btn--sm" onClick={() => setPractising(true)}>{T("✦ Practise")}</button>
          )
        }
      />
      <label className="lang-pick">
        <span>{T("Translate to")}</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name} · {l.native}
            </option>
          ))}
        </select>
      </label>
      <ErrorBar error={error || listen.error} onClose={() => (setError(null), listen.setError(null))} />

      <form
        className="card add-word"
        onSubmit={(e) => {
          e.preventDefault()
          addWord(word)
        }}
      >
        <input
          aria-label={T("New word")}
          value={listen.listening ? listen.interim || word : word}
          onChange={(e) => setWord(e.target.value)}
          placeholder={listen.listening ? T("Listening…") : T("Type or say a new word")}
          autoCapitalize="none"
          autoComplete="off"
          enterKeyHint="done"
        />
        <MicButton listen={listen} label={T("Say the word")} />
        <button className="btn" disabled={!word.trim()}>{T("Add")}</button>
      </form>

      <div className="scroll-x">
        <Segmented
          small
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: T("All"), count: counts.all }].concat(
            STATUSES.map((s) => ({ ...s, count: counts[s.value] }))
          )}
        />
      </div>

      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>{rows.length ? T("No words match.") : T("No words yet. Type or say your first one above.")}</Empty>
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
                  <div className="word__line">
                    <h3 className="word__word">{w.word}</h3>
                    {translating.has(w.id) ? (
                      <span className="word__tr word__tr--pending">{T("Translating…")}</span>
                    ) : w.translation ? (
                      <span className="word__tr" dir="auto">
                        {w.translation}
                      </span>
                    ) : (
                      <button type="button" className="link word__translate" onClick={() => translate(w)}>{T("Translate")}</button>
                    )}
                  </div>
                  <div className="word__actions">
                    <SpeakButton text={w.word} label={T("Hear \"{0}\"", [w.word])} />
                    <button type="button" className="icon-btn" aria-label={T("Explain with AI")} title={T("Explain with AI")} onClick={() => setExplain(w)}>
                      ✦
                    </button>
                    <button type="button" className="icon-btn" aria-label={T("Edit")} onClick={() => setEditing(w.id)}>
                      ✎
                    </button>
                    <DeleteButton label={T("Delete \"{0}\"", [w.word])} onClick={() => remove(w.id)} />
                  </div>
                </div>
                <StatusPicker value={w.status} onChange={(s) => update(w.id, { status: s })} />
              </article>
            )
          )}
        </div>
      )}

      {explain && <ExplainSheet word={explain} lang={lang} onClose={() => setExplain(null)} />}
      {practising && (
        <Practice lang={lang} words={rows} onStatus={(id, s) => update(id, { status: s })} onClose={() => setPractising(false)} />
      )}
    </div>
  );
}

function ExplainSheet({ word, lang, onClose }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let live = true
    callAi({ kind: 'explain', word: word.word, translation: word.translation, lang })
      .then((r) => live && setState({ text: r.text }))
      .catch((e) => live && setState({ error: e.message }))
    return () => {
      live = false
    }
  }, [word, lang])
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
      {state.loading && <div className="ai-loading">{T("Thinking…")}</div>}
      {state.error && <p className="error-text">{state.error}</p>}
      {state.text && <Markdown text={state.text} />}
    </Sheet>
  );
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
      <input className="input-plain" dir="auto" value={tr} onChange={(e) => setTr(e.target.value)} placeholder={T("Translation")} />
      <div className="form-foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>{T("Cancel")}</button>
        <button className="btn btn--sm">{T("Save")}</button>
      </div>
    </form>
  );
}
