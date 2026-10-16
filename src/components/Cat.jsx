import { useEffect, useId, useRef, useState } from 'react'
import { FURS } from '../lib/look'
import { T } from '../lib/i18n'
import { useLayout } from '../lib/layout'

/**
 * Mochi: the app's own cat. Drawn in SVG with soft light and shade so it looks round (3D), and it tilts towards
 * your finger or mouse. It breathes, blinks, swishes its tail, sleeps at night and smiles when you get things done.
 * Tap it: it jumps, spins and sends a heart.
 */
export function CatArt({ fur = 'ginger', acc = 'none', mood = 'normal' }) {
  const id = useId().replace(/:/g, '')
  const f = FURS.find((x) => x.key === fur) || FURS[0]
  const dark = fur === 'black'
  const ink = dark ? '#f6e7b0' : '#2a2230'
  const inner = dark ? '#8a5a6e' : '#ffb3c4'
  const calico = fur === 'calico'
  const g = (n) => `url(#${n}${id})`
  return (
    <svg viewBox="0 0 120 124" aria-hidden className={`cat-art cat--${mood}`}>
      <defs>
        <radialGradient id={`fur${id}`} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor={f.l} />
          <stop offset=".45" stopColor={f.c} />
          <stop offset="1" stopColor={f.d} />
        </radialGradient>
        <radialGradient id={`belly${id}`} cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity={dark ? 0.25 : 0.95} />
          <stop offset="1" stopColor={f.l} stopOpacity={dark ? 0.15 : 0.6} />
        </radialGradient>
        <radialGradient id={`eye${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor={dark ? '#c9f27a' : '#5a4a6a'} />
          <stop offset="1" stopColor={dark ? '#6f9a2a' : '#1d1724'} />
        </radialGradient>
        <radialGradient id={`gold${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="1" stopColor="#e0a400" />
        </radialGradient>
        <clipPath id={`headclip${id}`}>
          <ellipse cx="60" cy="54" rx="36" ry="30" />
        </clipPath>
      </defs>

      <ellipse className="cat__shadow" cx="60" cy="117" rx="34" ry="5.5" fill="#000" opacity=".14" />

      <g className="cat__tail">
        <path d="M86 106 C104 106 112 92 106 76 C103 68 96 66 94 72" fill="none" stroke={f.d} strokeWidth="11" strokeLinecap="round" />
        <path d="M86 106 C104 106 112 92 106 76 C103 68 96 66 94 72" fill="none" stroke={f.c} strokeWidth="6" strokeLinecap="round" opacity=".7" />
      </g>

      <g className="cat__body">
        <ellipse cx="60" cy="94" rx="34" ry="24" fill={g('fur')} />
        <ellipse cx="60" cy="98" rx="18" ry="15" fill={g('belly')} />
        {calico && <path d="M30 92 C34 78 46 76 48 84 C50 92 40 100 32 100 Z" fill="#f5a35c" opacity=".9" />}
        <ellipse cx="46" cy="114" rx="9.5" ry="6" fill={f.l} stroke={f.d} strokeOpacity=".35" />
        <ellipse cx="74" cy="114" rx="9.5" ry="6" fill={f.l} stroke={f.d} strokeOpacity=".35" />
        <path d="M43 113.5v3M49 113.5v3M71 113.5v3M77 113.5v3" stroke={f.d} strokeOpacity=".5" strokeWidth="1.2" strokeLinecap="round" />

        {acc === 'bell' && (
          <g>
            <path d="M36 79 Q60 92 84 79" fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth="5" strokeLinecap="round" />
            <circle cx="60" cy="88" r="5.5" fill={g('gold')} />
            <path d="M56 88h8M60 89v3" stroke="#a87800" strokeWidth="1" strokeLinecap="round" />
          </g>
        )}
        {acc === 'scarf' && (
          <g>
            <path d="M34 78 Q60 94 86 78 L86 84 Q60 100 34 84 Z" style={{ fill: 'var(--primary)' }} />
            <path d="M70 86 L80 106 L70 104 L64 90 Z" style={{ fill: 'var(--primary)' }} opacity=".85" />
            <path d="M40 82 Q60 94 80 82" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="3 3" />
          </g>
        )}
      </g>

      <g className="cat__head">
        <g className="cat__ear--l">
          <path d="M30 42 L33 13 L54 30 Z" fill={f.c} stroke={f.c} strokeWidth="6" strokeLinejoin="round" />
          <path d="M34 36 L36 20 L48 30 Z" fill={inner} stroke={inner} strokeWidth="2" strokeLinejoin="round" />
        </g>
        <path d="M90 42 L87 13 L66 30 Z" fill={calico ? '#3a3a44' : f.c} stroke={calico ? '#3a3a44' : f.c} strokeWidth="6" strokeLinejoin="round" />
        <path d="M86 36 L84 20 L72 30 Z" fill={inner} stroke={inner} strokeWidth="2" strokeLinejoin="round" />

        <ellipse cx="60" cy="54" rx="36" ry="30" fill={g('fur')} />
        {calico && (
          <g clipPath={g('headclip')}>
            <circle cx="34" cy="34" r="16" fill="#f5a35c" />
            <circle cx="90" cy="36" r="15" fill="#3a3a44" />
          </g>
        )}
        {!calico && fur !== 'white' && fur !== 'cream' && (
          <path d="M52 26 Q55 32 54 36 M60 25 V35 M68 26 Q65 32 66 36" stroke={f.d} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".55" />
        )}
        <ellipse cx="47" cy="36" rx="11" ry="5" fill="#fff" opacity=".35" transform="rotate(-18 47 36)" />
        <ellipse cx="60" cy="69" rx="14" ry="9" fill={g('belly')} />

        <g className="cat__eyes">
          <ellipse cx="45" cy="56" rx="6.5" ry="8" fill={g('eye')} />
          <ellipse cx="75" cy="56" rx="6.5" ry="8" fill={g('eye')} />
          <g className="cat__pupils">
            <circle cx="47.5" cy="52.5" r="2.6" fill="#fff" />
            <circle cx="77.5" cy="52.5" r="2.6" fill="#fff" />
            <circle cx="43.5" cy="59" r="1.2" fill="#fff" opacity=".8" />
            <circle cx="73.5" cy="59" r="1.2" fill="#fff" opacity=".8" />
          </g>
        </g>
        <g className="cat__lids">
          <ellipse cx="45" cy="56" rx="7.5" ry="9" fill={f.c} />
          <ellipse cx="75" cy="56" rx="7.5" ry="9" fill={f.c} />
          <path d="M39 58 Q45 62 51 58 M69 58 Q75 62 81 58" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </g>
        <path className="cat__happy" d="M39 58 Q45 49 51 58 M69 58 Q75 49 81 58" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />

        <ellipse cx="36" cy="66" rx="6" ry="3.6" fill="#ff7fa0" opacity=".45" />
        <ellipse cx="84" cy="66" rx="6" ry="3.6" fill="#ff7fa0" opacity=".45" />
        <path d="M57 63.5 Q60 62 63 63.5 Q61.5 66.5 60 67 Q58.5 66.5 57 63.5 Z" fill="#ff8fa8" />
        <path d="M54 69 Q57 72.5 60 69 Q63 72.5 66 69" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M30 64 L18 62 M30 68 L19 70 M90 64 L102 62 M90 68 L101 70" stroke={dark ? '#9a9aa8' : f.d} strokeWidth="1.3" strokeLinecap="round" opacity=".7" />

        {acc === 'bow' && (
          <g transform="translate(82 26) rotate(18)">
            <path d="M0 0 L-12 -8 Q-15 0 -12 8 Z M0 0 L12 -8 Q15 0 12 8 Z" style={{ fill: 'var(--primary)' }} />
            <circle r="3.6" style={{ fill: 'var(--primary)' }} />
            <circle cx="-1" cy="-1" r="1.4" fill="#fff" opacity=".6" />
          </g>
        )}
        {acc === 'glasses' && (
          <g fill="none" stroke={dark ? '#f6e7b0' : '#2a2230'} strokeWidth="2.2">
            <circle cx="45" cy="56" r="10" fill="#fff" fillOpacity=".12" />
            <circle cx="75" cy="56" r="10" fill="#fff" fillOpacity=".12" />
            <path d="M55 55 Q60 52 65 55 M35 54 L26 50 M85 54 L94 50" />
          </g>
        )}
        {acc === 'crown' && (
          <g transform="translate(60 22)">
            <path d="M-13 6 L-15 -9 L-7 -2 L0 -12 L7 -2 L15 -9 L13 6 Z" fill={g('gold')} stroke="#c99000" strokeWidth="1" strokeLinejoin="round" />
            <circle cx="0" cy="-1" r="2.2" style={{ fill: 'var(--primary)' }} />
          </g>
        )}
      </g>

      <g className="cat__dots" fill={dark ? '#c9c9d6' : 'currentColor'}>
        <circle cx="94" cy="20" r="3" />
        <circle cx="103" cy="14" r="3" />
        <circle cx="112" cy="8" r="3" />
      </g>

      <g className="cat__zz" fill={dark ? '#c9c9d6' : 'currentColor'} fontWeight="900" fontFamily="Nunito, sans-serif">
        <text x="96" y="26" fontSize="12">z</text>
        <text x="104" y="16" fontSize="9">z</text>
      </g>
    </svg>
  )
}

/** First sentence of the AI's text, without ** marks, kept short for the speech bubble. */
export function firstSentence(text) {
  const plain = String(text || '').replace(/\*\*?/g, '').replace(/\s+/g, ' ').trim()
  const m = plain.match(/^(.+?[.!?؟。])(\s|$)/)
  const s = m ? m[1] : plain
  return s.length > 110 ? s.slice(0, 107).trimEnd() + '…' : s
}

const TAP = ['Purr…', 'You’ve got this!', 'Time for some water 💧', 'Stretch a little 🙆', 'I believe in you!', 'Meow!', 'One thing at a time.']

/** What Mochi says, from how your day is going. */
export function catLine(wins, hour) {
  if (hour >= 23 || hour < 5) return { mood: 'sleepy', text: T('Zzz… time to rest.') }
  if (wins >= 3) return { mood: 'happy', text: T('{0} done today. I’m so proud of you!', [wins]) }
  if (wins > 0) return { mood: 'normal', text: T('{0} done today. Keep going!', [wins]) }
  return { mood: 'normal', text: hour < 12 ? T('Good morning! Start with one small thing.') : T('One small thing is a great start.') }
}

export default function Cat({ look, wins = 0, size, awake = false, brief = null, onBrief }) {
  const ref = useRef(null)
  const [hop, setHop] = useState(0)
  const [hearts, setHearts] = useState([])
  const [say, setSay] = useState(null)
  const [tap, setTap] = useState(0)
  const hour = new Date().getHours()
  const name = look?.name || 'Mochi'
  const base = awake ? { mood: 'happy', text: T('Hi! I’m {0}.', [name]) } : catLine(wins, hour)
  // tells you how your day is going: the first sentence of the AI summary (not at night)
  const line = !awake && brief && base.mood !== 'sleepy' ? { mood: base.mood, text: firstSentence(brief), brief: true } : base
  const mood = hop && line.mood === 'sleepy' ? 'normal' : line.mood

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
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(raf)
    }
  }, [])

  const poke = () => {
    setHop((h) => h + 1)
    setTap((n) => n + 1)
    setSay(T(TAP[tap % TAP.length]))
    const heart = { id: Date.now(), dx: Math.round(Math.random() * 40 - 20), e: ['💖', '💕', '✨', '💗'][tap % 4] }
    setHearts((h) => [...h.slice(-4), heart])
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== heart.id)), 1200)
    try {
      navigator.vibrate?.(12)
    } catch {
      /* fine */
    }
  }

  return (
    <div className="cat-wrap">
      {say &&
        (say === line.text && line.brief && onBrief ? (
          <button type="button" className="cat-say cat-say--brief" key={say} onClick={onBrief} title={T('See your day')}>
            {say}
          </button>
        ) : (
          <p className="cat-say" role="status" key={say}>
            {say}
          </p>
        ))}
      <button
        ref={ref}
        type="button"
        key={hop}
        className={`cat ${size === 'sm' ? 'cat--sm' : ''} ${hop ? 'is-hop' : ''} cat--${mood}`}
        aria-label={T('{0} the cat — tap to say hi', [name])}
        title={name}
        onClick={poke}
      >
        <CatArt fur={look?.fur} acc={look?.acc} mood={mood} />
      </button>
      {hearts.map((h) => (
        <span key={h.id} className="cat__heart" style={{ '--dx': `${h.dx}px` }} aria-hidden>
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
      <CatArt fur={cat.fur} acc={cat.acc} mood={busy ? 'think' : done ? 'happy' : 'normal'} />
    </span>
  )
}

/** "Mochi is thinking…" (or the plain words if the cat is hidden). */
export function useThinking() {
  const cat = useCat()
  return cat ? T('{0} is thinking…', [cat.name]) : T('Thinking…')
}
