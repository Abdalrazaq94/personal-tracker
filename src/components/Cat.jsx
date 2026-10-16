import { useEffect, useRef, useState } from 'react'
import PetArt from './PetArt'
import { T } from '../lib/i18n'
import { useLayout } from '../lib/layout'

/** Kept for older imports: the buddy picture. */
export const CatArt = PetArt

/** First sentence of the AI's text, without ** marks, kept short for the speech bubble. */
export function firstSentence(text) {
  const plain = String(text || '').replace(/\*\*?/g, '').replace(/\s+/g, ' ').trim()
  const m = plain.match(/^(.+?[.!?؟。])(\s|$)/)
  const s = m ? m[1] : plain
  return s.length > 110 ? s.slice(0, 107).trimEnd() + '…' : s
}

// idle moves: name → how long it lasts (ms)
export const MOVES = { wave: 2200, stretch: 2400, yawn: 2600, groom: 3000, look: 2800, chase: 1900, dance: 2600, loaf: 3200 }
const AWAKE_MOVES = ['wave', 'stretch', 'yawn', 'groom', 'look', 'chase', 'dance', 'look', 'groom', 'loaf']
const SLEEPY_MOVES = ['yawn', 'stretch']

const TAP = ['Purr…', 'You’ve got this!', 'Time for some water 💧', 'Stretch a little 🙆', 'I believe in you!', 'Meow!', 'One thing at a time.']

/** What Mochi says, from how your day is going. */
export function catLine(wins, hour) {
  wins = wins || 0
  if (hour >= 23 || hour < 5) return { mood: 'sleepy', text: T('Zzz… time to rest.') }
  if (wins >= 3) return { mood: 'happy', text: T('{0} done today. I’m so proud of you!', [wins]) }
  if (wins > 0) return { mood: 'normal', text: T('{0} done today. Keep going!', [wins]) }
  return { mood: 'normal', text: hour < 12 ? T('Good morning! Start with one small thing.') : T('One small thing is a great start.') }
}

// what each buddy says when tapped (first = the sound it makes)
const SOUNDS = { cat: ['Purr…', 'Meow!', 'Purrrrr… 💕'], dog: ['Woof!', 'Woof woof! 🐾', 'Happy wiggles! 💕'], robot: ['Beep boop!', 'Bzzt! Fully charged ⚡', 'Beep-beep-boop! 💕'] }

export default function Cat({ look, wins = 0, size, awake = false, brief = null, onBrief, play = null, notes: due = [], onNote }) {
  const ref = useRef(null)
  const [act, setAct] = useState('enter')
  const actT = useRef(0)
  const taps = useRef([])
  const [near, setNear] = useState(false)
  const [hop, setHop] = useState(0)
  const [hearts, setHearts] = useState([])
  const [say, setSay] = useState(null)
  const [quip, setQuip] = useState(null) // a short reply to a tap or a win, then back to reminders
  const quipT = useRef(0)
  const [noteIdx, setNoteIdx] = useState(0)
  const [tap, setTap] = useState(0)
  const sounds = SOUNDS[look?.kind] || SOUNDS.cat
  const say2 = (text) => {
    clearTimeout(quipT.current)
    setQuip(text)
    quipT.current = setTimeout(() => setQuip(null), 4000)
  }
  const hour = new Date().getHours()
  const name = look?.name || 'Mochi'
  const base = awake ? { mood: 'happy', text: T('Hi! I’m {0}.', [name]) } : catLine(wins, hour)
  // tells you how your day is going: the first sentence of the AI summary (not at night)
  const line = !awake && brief && base.mood !== 'sleepy' ? { mood: base.mood, text: firstSentence(brief), brief: true } : base
  const mood = (hop || due.some((n) => n.urgent)) && line.mood === 'sleepy' ? 'normal' : line.mood

  const doAct = (name, ms = MOVES[name] || 1800) => {
    clearTimeout(actT.current)
    setAct(null)
    requestAnimationFrame(() => setAct(name)) // restart even if it's the same move
    actT.current = setTimeout(() => setAct(null), ms)
  }
  useEffect(() => {
    actT.current = setTimeout(() => setAct(null), 900) // drop-in when Home opens
    return () => clearTimeout(actT.current)
  }, [])

  // every few seconds, do something cat-like (only while you can see it)
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (still) return
    let t
    const next = () => {
      t = setTimeout(() => {
        if (!document.hidden) {
          const list = mood === 'sleepy' ? SLEEPY_MOVES : AWAKE_MOVES
          if (mood !== 'sleepy' || Math.random() < 0.35) doAct(list[Math.floor(Math.random() * list.length)])
        }
        next()
      }, 2500 + Math.random() * 3000)
    }
    next()
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, still])

  // a move asked for from Settings ("Try a move")
  useEffect(() => {
    if (play?.name) doAct(play.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play?.n])

  // you finished something: celebrate!
  const lastWins = useRef(wins)
  useEffect(() => {
    // null = Home is still loading: just remember the count, don't celebrate old wins
    if (wins != null && lastWins.current != null && wins > lastWins.current) {
      doAct('party', 1600)
      burst(['🎉', '✨', '💖', '⭐', '🎉'])
      say2(wins >= 3 ? T('Yay! {0} done today!', [wins]) : T('Nice one! 🎉'))
    }
    lastWins.current = wins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wins])

  // when nothing is due right now, your day summary takes turns with the reminders
  const notes = line.brief && !due.some((n) => n.urgent) && due.length ? [...due, { key: 'brief', text: line.text, brief: true }] : due
  // reminders: show one at a time, change every 8 seconds; wave when something is due now
  const note = notes.length ? notes[noteIdx % notes.length] : null
  const noteKeys = notes.map((n) => n.key).join('|')
  useEffect(() => {
    if (notes.length < 2) return
    const t = setInterval(() => setNoteIdx((i) => i + 1), 8000)
    return () => clearInterval(t)
  }, [noteKeys, notes.length])
  useEffect(() => {
    if (note?.urgent) doAct('wave')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.key])

  // say hello for a few seconds, then stay quiet until tapped
  useEffect(() => {
    setSay(line.text)
    const t = setTimeout(() => setSay(null), line.brief ? 15000 : 7000)
    return () => clearTimeout(t)
  }, [line.text])

  // tilt towards the finger / mouse (3D)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const move = (e) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 260))
        const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 260))
        el.style.setProperty('--ry', `${dx * 16}deg`)
        el.style.setProperty('--rx', `${-dy * 10}deg`)
        el.style.setProperty('--hx', `${dx * 3}px`)
        el.style.setProperty('--hy', `${dy * 2}px`)
        el.style.setProperty('--px', `${dx * 1.6}px`)
        el.style.setProperty('--py', `${dy * 1.6}px`)
        // ears up when your finger or mouse comes close
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
        setNear(d < r.width * 1.1)
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])

  const burst = (emojis) => {
    const now = Date.now()
    const list = emojis.map((e, i) => ({ id: now + i, dx: Math.round((i - (emojis.length - 1) / 2) * 22 + Math.random() * 10), e, d: i * 90 }))
    setHearts((h) => [...h.slice(-6), ...list])
    setTimeout(() => setHearts((h) => h.filter((x) => !list.includes(x))), 1600)
  }

  const poke = () => {
    // three quick taps = a long purr and lots of hearts
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 2000), now]
    if (taps.current.length >= 3) {
      taps.current = []
      doAct('purr', 1800)
      say2(T(sounds[2]))
      burst(['💖', '💕', '💗', '💞'])
    } else {
      setHop((h) => h + 1)
      setTap((n) => n + 1)
      const lines = [sounds[0], ...TAP.slice(1, -2), sounds[1], TAP[TAP.length - 1]]
      say2(T(lines[tap % lines.length]))
      burst([['💖', '💕', '✨', '💗'][tap % 4]])
    }
    try {
      navigator.vibrate?.(12)
    } catch {
      /* fine */
    }
  }

  return (
    <div className="cat-wrap">
      {quip ? (
        <p className="cat-say" role="status" key={'q' + quip}>
          {quip}
        </p>
      ) : note ? (
        <button
          type="button"
          key={note.key}
          className={`cat-say cat-say--note ${note.urgent ? 'cat-say--urgent' : ''}`}
          onClick={() => (note.brief ? onBrief?.() : onNote?.(note))}
          aria-live="polite"
        >
          {note.text}
          {notes.length > 1 && <span className="cat-say__count">{T('{0} of {1}', [(noteIdx % notes.length) + 1, notes.length])}</span>}
        </button>
      ) : (
        say &&
        (say === line.text && line.brief && onBrief ? (
          <button type="button" className="cat-say cat-say--brief" key={say} onClick={onBrief} title={T('See your day')}>
            {say}
          </button>
        ) : (
          <p className="cat-say" role="status" key={say}>
            {say}
          </p>
        ))
      )}
      <button
        ref={ref}
        type="button"
        key={hop}
        className={`cat ${size === 'sm' ? 'cat--sm' : ''} ${hop ? 'is-hop' : ''} cat--${mood} ${act ? `act-${act}` : ''} ${near ? 'is-near' : ''}`}
        aria-label={T('{0} — tap to say hi', [name])}
        title={name}
        onClick={poke}
      >
        <PetArt kind={look?.kind} fur={look?.fur} acc={look?.acc} mood={mood} />
      </button>
      {hearts.map((h) => (
        <span key={h.id} className="cat__heart" style={{ '--dx': `${h.dx}px`, animationDelay: `${h.d || 0}ms` }} aria-hidden>
          {h.e}
        </span>
      ))}
    </div>
  )
}

/** Your cat, if it's switched on: { name, fur, acc } — otherwise null. */
export function useCat() {
  const c = useLayout().look.cat
  return c.on ? c : null
}

/** The face of the AI: a little cat (thinking while busy), or ✦ if you hid the cat. */
export function AiCat({ busy = false, done = false }) {
  const cat = useCat()
  if (!cat)
    return (
      <span className="ai-spark" aria-hidden>
        ✦
      </span>
    )
  return (
    <span className={`ai-cat ${busy ? 'is-busy' : ''}`} aria-hidden>
      <PetArt kind={cat.kind} fur={cat.fur} acc={cat.acc} mood={busy ? 'think' : done ? 'happy' : 'normal'} />
    </span>
  )
}

/** "Mochi is thinking…" (or the plain words if the cat is hidden). */
export function useThinking() {
  const cat = useCat()
  return cat ? T('{0} is thinking…', [cat.name]) : T('Thinking…')
}
