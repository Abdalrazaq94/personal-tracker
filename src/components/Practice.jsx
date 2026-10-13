import { useMemo, useState } from 'react'
import { callAi } from '../lib/ai'
import { MicButton, SpeakButton, useListen } from '../lib/speech'
import { Sheet } from './Collections'
import { Segmented } from './ui'
import { StatusPicker } from './StatusPicker'

const shuffle = (a) => {
  const x = [...a]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}' -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Practice sheet:
 *  - "Fill the gap": AI writes a sentence with a blank, you type or say the missing word.
 *  - "Make a sentence": you write or say your own sentence with the word, the AI corrects it.
 */
export default function Practice({ words, onStatus, onClose, lang = 'Arabic' }) {
  const [mode, setMode] = useState('gap')
  const [pool, setPool] = useState(words.some((w) => w.status !== 'memorized') ? 'learning' : 'all')
  const [count, setCount] = useState(5)
  const [stage, setStage] = useState('setup') // setup | loading | run | done
  const [rounds, setRounds] = useState([]) // [{ w, item? }]
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState({}) // index -> true/false
  const [error, setError] = useState(null)

  const poolWords = useMemo(
    () => (pool === 'learning' ? words.filter((w) => w.status !== 'memorized') : words),
    [words, pool]
  )

  const start = async () => {
    setError(null)
    const picked = shuffle(poolWords.length ? poolWords : words).slice(0, count)
    setIndex(0)
    setResults({})
    if (mode === 'sentence') {
      setRounds(picked.map((w) => ({ w })))
      setStage('run')
      return
    }
    setStage('loading')
    try {
      const { items } = await callAi({
        kind: 'practice',
        lang,
        words: picked.map((w) => ({ word: w.word, translation: w.translation })),
      })
      const r = items.map((item, i) => ({
        item,
        w: picked.find((w) => norm(w.word) === norm(item.word)) || picked[i] || picked[0],
      }))
      setRounds(r)
      setStage('run')
    } catch (e) {
      setError(e.message)
      setStage('setup')
    }
  }

  const finish = (ok) => {
    setResults((r) => ({ ...r, [index]: ok }))
  }
  const next = () => (index + 1 < rounds.length ? setIndex(index + 1) : setStage('done'))

  const score = Object.values(results).filter(Boolean).length

  return (
    <Sheet title="Practise" onClose={onClose}>
      {stage === 'setup' && (
        <div className="form">
          <div className="field">
            <span>How</span>
            <div className="mode-cards">
              <button type="button" className={`mode-card ${mode === 'gap' ? 'is-active' : ''}`} onClick={() => setMode('gap')}>
                <strong>Fill the gap</strong>
                <span>AI writes a sentence with a missing word. Type or say the word.</span>
              </button>
              <button type="button" className={`mode-card ${mode === 'sentence' ? 'is-active' : ''}`} onClick={() => setMode('sentence')}>
                <strong>Make a sentence</strong>
                <span>Write or say your own sentence. AI corrects you.</span>
              </button>
            </div>
          </div>
          <div className="field">
            <span>Which words</span>
            <Segmented
              small
              value={pool}
              onChange={setPool}
              options={[
                { value: 'learning', label: 'Not memorized', count: words.filter((w) => w.status !== 'memorized').length },
                { value: 'all', label: 'All', count: words.length },
              ]}
            />
          </div>
          <div className="field">
            <span>How many</span>
            <Segmented
              small
              value={count}
              onChange={setCount}
              options={[3, 5, 8].map((n) => ({ value: n, label: String(n) }))}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn--block" onClick={start}>
            Start
          </button>
        </div>
      )}

      {stage === 'loading' && <div className="ai-loading">Writing sentences for your words…</div>}

      {stage === 'run' && rounds[index] && (
        <>
          <div className="progress" aria-label={`Question ${index + 1} of ${rounds.length}`}>
            <span style={{ width: `${((index + (results[index] !== undefined ? 1 : 0)) / rounds.length) * 100}%` }} />
          </div>
          <p className="muted small">
            {index + 1} / {rounds.length}
          </p>
          {mode === 'gap' ? (
            <GapRound key={index} lang={lang} round={rounds[index]} onResult={finish} onNext={next} last={index + 1 === rounds.length} />
          ) : (
            <SentenceRound key={index} round={rounds[index]} onResult={finish} onNext={next} last={index + 1 === rounds.length} />
          )}
        </>
      )}

      {stage === 'done' && (
        <div className="form">
          <div className="score">
            <strong>
              {score} / {rounds.length}
            </strong>
            <span>{score === rounds.length ? 'Perfect! 🎉' : score >= rounds.length / 2 ? 'Good work — keep going.' : 'Keep practising, you’ll get there.'}</span>
          </div>
          <p className="muted small">Update how well you know each word:</p>
          <ul className="list list--tight">
            {rounds.map((r, i) => (
              <li key={i} className="item done-row">
                <div className="done-row__top">
                  <span className={`mark ${results[i] ? 'mark--ok' : ''}`}>{results[i] ? '✓' : '✗'}</span>
                  <strong>{r.w.word}</strong>
                  <span className="muted small" dir="auto">
                    {r.w.translation}
                  </span>
                </div>
                <StatusPicker value={(words.find((x) => x.id === r.w.id) || r.w).status} onChange={(s) => onStatus(r.w.id, s)} />
              </li>
            ))}
          </ul>
          <div className="form-foot">
            <button className="btn btn--ghost" onClick={() => setStage('setup')}>
              Practise again
            </button>
            <button className="btn" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* ------------------------------ fill the gap ----------------------------- */

function GapRound({ round, onResult, onNext, last, lang }) {
  const { item, w } = round
  const [answer, setAnswer] = useState('')
  const [checked, setChecked] = useState(null) // null | true | false
  const [heard, setHeard] = useState('')
  const [showAr, setShowAr] = useState(false)
  const listen = useListen({
    onResult: (t) => {
      const clean = t.replace(/[.,!?]+$/g, '')
      setHeard(clean)
      setAnswer(clean)
    },
  })

  const [before, after] = item.sentence.split(/_{2,}/)
  const full = `${before}${item.answer}${after ?? ''}`

  const check = (e) => {
    e?.preventDefault()
    const a = norm(answer)
    if (!a) return
    // accept the exact gap word, the base word, or a sentence that contains it (when spoken)
    const ok = a === norm(item.answer) || a === norm(w.word) || ` ${a} `.includes(` ${norm(item.answer)} `)
    setChecked(ok)
    onResult(ok)
  }

  return (
    <div className="form">
      <div className="gap-sentence" dir="ltr">
        {before}
        <span className={`gap ${checked === null ? '' : checked ? 'gap--ok' : 'gap--bad'}`}>{checked === null ? ' ' : item.answer}</span>
        {after}
      </div>
      <div className="row-actions">
        <SpeakButton text={checked === null ? item.sentence : full} label="Hear the sentence" />
        <button type="button" className="link small" onClick={() => setShowAr(!showAr)}>
          {showAr ? `Hide ${lang}` : `Show ${lang} hint`}
        </button>
      </div>
      {showAr && (
        <p className="arabic-hint" dir="auto">
          {item.arabic}
        </p>
      )}

      {checked === null ? (
        <form className="form" onSubmit={check}>
          <div className="input-row">
            <input
              value={listen.listening ? listen.interim || answer : answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={listen.listening ? 'Listening…' : 'Type or say the missing word'}
              autoCapitalize="none"
              autoComplete="off"
              autoFocus
            />
            <MicButton listen={listen} label="Say the answer" />
          </div>
          {heard && <p className="muted small">We heard: “{heard}”</p>}
          {listen.error && <p className="error-text">{listen.error}</p>}
          <div className="form-foot">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setAnswer('')
                setChecked(false)
                onResult(false)
              }}
            >
              Show answer
            </button>
            <button className="btn" disabled={!answer.trim()}>
              Check
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className={`verdict ${checked ? 'verdict--ok' : ''}`}>
            <strong>{checked ? 'Correct!' : answer ? `Not quite — the answer is “${item.answer}”.` : `The answer is “${item.answer}”.`}</strong>
            <p dir="auto" className="small">
              {item.arabic}
            </p>
          </div>
          <button className="btn btn--block" onClick={onNext} autoFocus>
            {last ? 'See results' : 'Next'}
          </button>
        </>
      )}
    </div>
  )
}

/* ----------------------------- make a sentence ---------------------------- */

function SentenceRound({ round, onResult, onNext, last }) {
  const { w } = round
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const [heard, setHeard] = useState('')
  const [recorded, setRecorded] = useState(false)
  const listen = useListen({
    onResult: (t) => {
      setHeard(t)
      setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))
    },
  })

  const check = async (e) => {
    e?.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await callAi({ kind: 'check', word: w.word, sentence: text.trim(), lang })
      setRes(r)
      if (!recorded) {
        onResult(r.correct) // first attempt counts for the score
        setRecorded(true)
      }
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="form">
      <div className="target-word">
        <div>
          <strong>{w.word}</strong>
          {w.translation && (
            <span dir="auto" className="muted">
              {w.translation}
            </span>
          )}
        </div>
        <SpeakButton text={w.word} />
      </div>
      <p className="muted small">Write or say a sentence using this word.</p>

      {!res ? (
        <form className="form" onSubmit={check}>
          <div className="textarea-wrap">
            <textarea
              rows={3}
              value={listen.listening && listen.interim ? `${text} ${listen.interim}`.trim() : text}
              onChange={(e) => setText(e.target.value)}
              placeholder={listen.listening ? 'Listening… speak your sentence' : `e.g. a sentence with “${w.word}”`}
              autoCapitalize="sentences"
            />
            <MicButton listen={listen} label="Say your sentence" />
          </div>
          {heard && <p className="muted small">We heard: “{heard}”</p>}
          {listen.error && <p className="error-text">{listen.error}</p>}
          {error && <p className="error-text">{error}</p>}
          <div className="form-foot">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (!recorded) onResult(false)
                onNext()
              }}
            >
              Skip
            </button>
            <button className="btn" disabled={busy || !text.trim()}>
              {busy ? 'Checking…' : 'Check with AI'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className={`verdict ${res.correct ? 'verdict--ok' : ''}`}>
            <strong>{res.correct ? 'Great sentence!' : res.used_word ? 'Almost — here’s a better way:' : `Try to use “${w.word}” in your sentence.`}</strong>
            <p className="yours">You: {text}</p>
            {res.corrected && norm(res.corrected) !== norm(text) && (
              <div className="corrected">
                <span>{res.corrected}</span>
                <SpeakButton text={res.corrected} label="Hear the correct sentence" />
              </div>
            )}
            {res.feedback && <p className="small">{res.feedback}</p>}
            {res.feedback_ar && (
              <p className="small" dir="auto">
                {res.feedback_ar}
              </p>
            )}
          </div>
          <div className="form-foot">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setRes(null)
                setText('')
                setHeard('')
              }}
            >
              Try again
            </button>
            <button className="btn" onClick={onNext}>
              {last ? 'See results' : 'Next word'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
