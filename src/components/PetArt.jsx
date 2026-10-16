import { useId } from 'react'
import { colourOf } from '../lib/look'

/**
 * Your buddy, drawn in SVG: a cat, a dog or a little robot. All three share the same skeleton
 * (head, body, tail, a paw that can wave, eyes, eyelids, happy eyes, mouth, yawn), so every move in themes.css
 * works on each of them. Soft light and shade make them look round (3D).
 */
export default function PetArt({ kind = 'cat', fur, acc = 'none', mood = 'normal' }) {
  const id = useId().replace(/:/g, '')
  const f = colourOf(kind, fur)
  const g = (n) => `url(#${n}${id})`
  const Body = kind === 'dog' ? Dog : kind === 'robot' ? Robot : Cat
  const dark = f.key === 'black' || f.key === 'midnight'
  return (
    <svg viewBox="0 0 120 124" aria-hidden className={`cat-art pet--${kind} cat--${mood}`}>
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
          <stop offset="0" stopColor={kind === 'cat' && dark ? '#c9f27a' : '#5a4a6a'} />
          <stop offset="1" stopColor={kind === 'cat' && dark ? '#6f9a2a' : '#1d1724'} />
        </radialGradient>
        <radialGradient id={`gold${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="1" stopColor="#e0a400" />
        </radialGradient>
        <radialGradient id={`glow${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={f.glow || '#fff'} stopOpacity=".9" />
          <stop offset="1" stopColor={f.glow || '#fff'} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`visor${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3150" />
          <stop offset="1" stopColor="#141729" />
        </linearGradient>
        <clipPath id={`headclip${id}`}>
          <ellipse cx="60" cy="54" rx="36" ry="30" />
        </clipPath>
      </defs>

      <ellipse className="cat__shadow" cx="60" cy="117" rx={kind === 'robot' ? 24 : 34} ry="5.5" fill="#000" opacity=".14" />
      <g className="cat__all">
        <Body f={f} g={g} acc={acc} dark={dark} />
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

/* ---------------- shared pieces ---------------- */

/** Bell collar / scarf around the neck. */
function Neck({ acc, g }) {
  if (acc === 'bell')
    return (
      <g>
        <path d="M36 79 Q60 92 84 79" fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth="5" strokeLinecap="round" />
        <circle cx="60" cy="88" r="5.5" fill={g('gold')} />
        <path d="M56 88h8M60 89v3" stroke="#a87800" strokeWidth="1" strokeLinecap="round" />
      </g>
    )
  if (acc === 'scarf')
    return (
      <g>
        <path d="M34 78 Q60 94 86 78 L86 84 Q60 100 34 84 Z" style={{ fill: 'var(--primary)' }} />
        <path d="M70 86 L80 106 L70 104 L64 90 Z" style={{ fill: 'var(--primary)' }} opacity=".85" />
        <path d="M40 82 Q60 94 80 82" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="3 3" />
      </g>
    )
  return null
}

/** Bow / glasses / crown on the head. */
function Hat({ acc, g, ink, top = 22 }) {
  if (acc === 'bow')
    return (
      <g transform="translate(82 26) rotate(18)">
        <path d="M0 0 L-12 -8 Q-15 0 -12 8 Z M0 0 L12 -8 Q15 0 12 8 Z" style={{ fill: 'var(--primary)' }} />
        <circle r="3.6" style={{ fill: 'var(--primary)' }} />
        <circle cx="-1" cy="-1" r="1.4" fill="#fff" opacity=".6" />
      </g>
    )
  if (acc === 'glasses')
    return (
      <g fill="none" stroke={ink} strokeWidth="2.2">
        <circle cx="45" cy="56" r="10" fill="#fff" fillOpacity=".12" />
        <circle cx="75" cy="56" r="10" fill="#fff" fillOpacity=".12" />
        <path d="M55 55 Q60 52 65 55 M35 54 L26 50 M85 54 L94 50" />
      </g>
    )
  if (acc === 'crown')
    return (
      <g transform={`translate(60 ${top})`}>
        <path d="M-13 6 L-15 -9 L-7 -2 L0 -12 L7 -2 L15 -9 L13 6 Z" fill={g('gold')} stroke="#c99000" strokeWidth="1" strokeLinejoin="round" />
        <circle cx="0" cy="-1" r="2.2" style={{ fill: 'var(--primary)' }} />
      </g>
    )
  return null
}

/** Round eyes with shine, eyelids for blinking, and ^ ^ happy eyes. */
function Eyes({ g, lid, ink }) {
  return (
    <>
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
        <ellipse cx="45" cy="56" rx="7.5" ry="9" fill={lid} />
        <ellipse cx="75" cy="56" rx="7.5" ry="9" fill={lid} />
        <path d="M39 58 Q45 62 51 58 M69 58 Q75 62 81 58" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </g>
      <path className="cat__happy" d="M39 58 Q45 49 51 58 M69 58 Q75 49 81 58" stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  )
}

/** The right paw: it waves and washes. The arm only shows while it's up. */
function Paw({ f }) {
  return (
    <g className="cat__paw">
      <rect className="cat__arm" x="67" y="113" width="14" height="26" rx="7" fill={f.c} />
      <ellipse cx="74" cy="114" rx="9.5" ry="6" fill={f.l} stroke={f.d} strokeOpacity=".35" />
      <path d="M71 113.5v3M77 113.5v3" stroke={f.d} strokeOpacity=".5" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  )
}

/* ---------------- the cat ---------------- */
function Cat({ f, g, acc, dark }) {
  const ink = dark ? '#f6e7b0' : '#2a2230'
  const inner = dark ? '#8a5a6e' : '#ffb3c4'
  const calico = f.key === 'calico'
  return (
    <>
      <g className="cat__tail">
        <path d="M86 106 C104 106 112 92 106 76 C103 68 96 66 94 72" fill="none" stroke={f.d} strokeWidth="11" strokeLinecap="round" />
        <path d="M86 106 C104 106 112 92 106 76 C103 68 96 66 94 72" fill="none" stroke={f.c} strokeWidth="6" strokeLinecap="round" opacity=".7" />
      </g>
      <g className="cat__body">
        <ellipse cx="60" cy="94" rx="34" ry="24" fill={g('fur')} />
        <ellipse cx="60" cy="98" rx="18" ry="15" fill={g('belly')} />
        {calico && <path d="M30 92 C34 78 46 76 48 84 C50 92 40 100 32 100 Z" fill="#f5a35c" opacity=".9" />}
        <ellipse cx="46" cy="114" rx="9.5" ry="6" fill={f.l} stroke={f.d} strokeOpacity=".35" />
        <path d="M43 113.5v3M49 113.5v3" stroke={f.d} strokeOpacity=".5" strokeWidth="1.2" strokeLinecap="round" />
        <Neck acc={acc} g={g} />
      </g>
      <g className="cat__head">
        <g className="cat__ear--l">
          <path d="M30 42 L33 13 L54 30 Z" fill={f.c} stroke={f.c} strokeWidth="6" strokeLinejoin="round" />
          <path d="M34 36 L36 20 L48 30 Z" fill={inner} stroke={inner} strokeWidth="2" strokeLinejoin="round" />
        </g>
        <g className="cat__ear--r">
          <path d="M90 42 L87 13 L66 30 Z" fill={calico ? '#3a3a44' : f.c} stroke={calico ? '#3a3a44' : f.c} strokeWidth="6" strokeLinejoin="round" />
          <path d="M86 36 L84 20 L72 30 Z" fill={inner} stroke={inner} strokeWidth="2" strokeLinejoin="round" />
        </g>
        <ellipse cx="60" cy="54" rx="36" ry="30" fill={g('fur')} />
        {calico && (
          <g clipPath={g('headclip')}>
            <circle cx="34" cy="34" r="16" fill="#f5a35c" />
            <circle cx="90" cy="36" r="15" fill="#3a3a44" />
          </g>
        )}
        {!calico && f.key !== 'white' && f.key !== 'cream' && (
          <path d="M52 26 Q55 32 54 36 M60 25 V35 M68 26 Q65 32 66 36" stroke={f.d} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".55" />
        )}
        <ellipse cx="47" cy="36" rx="11" ry="5" fill="#fff" opacity=".35" transform="rotate(-18 47 36)" />
        <ellipse cx="60" cy="69" rx="14" ry="9" fill={g('belly')} />
        <Eyes g={g} lid={f.c} ink={ink} />
        <ellipse cx="36" cy="66" rx="6" ry="3.6" fill="#ff7fa0" opacity=".45" />
        <ellipse cx="84" cy="66" rx="6" ry="3.6" fill="#ff7fa0" opacity=".45" />
        <path d="M57 63.5 Q60 62 63 63.5 Q61.5 66.5 60 67 Q58.5 66.5 57 63.5 Z" fill="#ff8fa8" />
        <path className="cat__mouth" d="M54 69 Q57 72.5 60 69 Q63 72.5 66 69" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <g className="cat__yawn">
          <ellipse cx="60" cy="72" rx="5.5" ry="6.5" fill="#5a2335" />
          <ellipse cx="60" cy="75.5" rx="3.6" ry="2.6" fill="#ff8fa8" />
        </g>
        <path d="M30 64 L18 62 M30 68 L19 70 M90 64 L102 62 M90 68 L101 70" stroke={dark ? '#9a9aa8' : f.d} strokeWidth="1.3" strokeLinecap="round" opacity=".7" />
        <Hat acc={acc} g={g} ink={ink} />
      </g>
      <Paw f={f} />
    </>
  )
}

/* ---------------- the dog: floppy ears, big nose, wagging tail ---------------- */
function Dog({ f, g, acc, dark }) {
  const ink = dark ? '#f3e6c8' : '#2a2230'
  const spotty = f.key === 'spotty'
  const ear = spotty ? '#3b3633' : f.d
  return (
    <>
      <g className="cat__tail">
        <path d="M86 102 C96 100 102 92 104 80" fill="none" stroke={f.d} strokeWidth="10" strokeLinecap="round" />
        <path d="M86 102 C96 100 102 92 104 80" fill="none" stroke={f.c} strokeWidth="5" strokeLinecap="round" opacity=".7" />
      </g>
      <g className="cat__body">
        <ellipse cx="60" cy="94" rx="33" ry="24" fill={g('fur')} />
        <ellipse cx="60" cy="98" rx="17" ry="15" fill={g('belly')} />
        {spotty && (
          <g fill="#3b3633" opacity=".85">
            <circle cx="38" cy="92" r="5" />
            <circle cx="82" cy="100" r="4" />
            <circle cx="46" cy="104" r="2.6" />
          </g>
        )}
        <ellipse cx="46" cy="114" rx="10" ry="6.5" fill={f.l} stroke={f.d} strokeOpacity=".35" />
        <path d="M43 113.5v3M49 113.5v3" stroke={f.d} strokeOpacity=".5" strokeWidth="1.2" strokeLinecap="round" />
        <Neck acc={acc} g={g} />
      </g>
      <g className="cat__head">
        <ellipse cx="60" cy="54" rx="35" ry="30" fill={g('fur')} />
        {spotty && <ellipse cx="76" cy="52" rx="11" ry="12" fill="#3b3633" opacity=".85" />}
        <ellipse cx="47" cy="36" rx="11" ry="5" fill="#fff" opacity=".35" transform="rotate(-18 47 36)" />
        {/* floppy ears hang over the sides of the head */}
        <g className="cat__ear--l">
          <path d="M34 32 C20 30 14 46 18 62 C20 72 30 74 34 66 C38 56 40 40 34 32 Z" fill={ear} />
          <path d="M30 40 C24 44 22 54 24 62" stroke="#fff" strokeOpacity=".18" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </g>
        <g className="cat__ear--r">
          <path d="M86 32 C100 30 106 46 102 62 C100 72 90 74 86 66 C82 56 80 40 86 32 Z" fill={ear} />
        </g>
        <ellipse cx="60" cy="68" rx="16" ry="11.5" fill={g('belly')} />
        <Eyes g={g} lid={spotty ? f.c : f.c} ink={ink} />
        <path d="M40 45 q5 -4 10 -1 M70 44 q5 -3 10 1" stroke={f.d} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".7" />
        <path d="M53.5 61 Q60 57.5 66.5 61 Q65 67 60 68 Q55 67 53.5 61 Z" fill="#2a2024" />
        <ellipse cx="58" cy="60.8" rx="2.4" ry="1.3" fill="#fff" opacity=".55" />
        <path className="cat__mouth" d="M52 72 Q56 76 60 72 Q64 76 68 72" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path className="dog__tongue" d="M57 74.5 Q60 82 63 74.5 Z" fill="#ff7f98" />
        <g className="cat__yawn">
          <ellipse cx="60" cy="74" rx="6" ry="7" fill="#5a2335" />
          <ellipse cx="60" cy="78" rx="4" ry="2.8" fill="#ff8fa8" />
        </g>
        <ellipse cx="38" cy="68" rx="5.5" ry="3.4" fill="#ff7fa0" opacity=".35" />
        <ellipse cx="82" cy="68" rx="5.5" ry="3.4" fill="#ff7fa0" opacity=".35" />
        <Hat acc={acc} g={g} ink={ink} />
      </g>
      <Paw f={f} />
    </>
  )
}

/* ---------------- the robot: floats on a little jet, screen face, antenna light ---------------- */
function Robot({ f, g, acc }) {
  const glow = f.glow
  return (
    <>
      {/* the jet glow under it ("tail" so it flickers with the tail moves) */}
      <g className="cat__tail bot__jet">
        <ellipse cx="60" cy="114" rx="13" ry="6" fill={g('glow')} />
        <path d="M54 110 Q60 124 66 110 Z" fill={glow} opacity=".55" />
      </g>
      <g className="cat__body">
        <ellipse cx="60" cy="94" rx="27" ry="20" fill={g('fur')} />
        <ellipse cx="60" cy="108" rx="12" ry="4" fill={f.d} />
        <circle cx="60" cy="94" r="7" fill="#1b1f33" />
        <circle className="bot__core" cx="60" cy="94" r="4.2" fill={glow} />
        <ellipse cx="48" cy="86" rx="7" ry="3" fill="#fff" opacity=".5" transform="rotate(-25 48 86)" />
        {/* left hand floats beside the body */}
        <ellipse cx="30" cy="98" rx="7" ry="8" fill={g('fur')} stroke={f.d} strokeOpacity=".4" />
        <Neck acc={acc} g={g} />
      </g>
      <g className="cat__head">
        {/* antenna (left ear, so it twitches) and side bolts */}
        <g className="cat__ear--l">
          <path d="M60 26 V12" stroke={f.d} strokeWidth="3" strokeLinecap="round" />
          <circle cx="60" cy="10" r="9" fill={g('glow')} className="bot__bulb-glow" />
          <circle cx="60" cy="10" r="4.5" fill={glow} className="bot__bulb" />
        </g>
        <g className="cat__ear--r">
          <rect x="18" y="46" width="9" height="18" rx="4.5" fill={f.d} />
          <rect x="93" y="46" width="9" height="18" rx="4.5" fill={f.d} />
        </g>
        <rect x="24" y="24" width="72" height="60" rx="26" fill={g('fur')} />
        <ellipse cx="44" cy="31" rx="13" ry="4" fill="#fff" opacity=".55" />
        {/* the screen face */}
        <rect x="31" y="36" width="58" height="38" rx="17" fill={g('visor')} />
        <path d="M38 40 Q56 36 74 39" stroke="#fff" strokeOpacity=".22" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <g className="cat__eyes">
          <rect x="39.5" y="47" width="11" height="15" rx="5.5" fill={glow} />
          <rect x="69.5" y="47" width="11" height="15" rx="5.5" fill={glow} />
          <g className="cat__pupils">
            <circle cx="47" cy="50.5" r="2.2" fill="#fff" />
            <circle cx="77" cy="50.5" r="2.2" fill="#fff" />
          </g>
        </g>
        <g className="cat__lids">
          <rect x="38" y="45" width="14" height="19" rx="6" fill="#1d2135" />
          <rect x="68" y="45" width="14" height="19" rx="6" fill="#1d2135" />
          <path d="M39 57 Q45 61 51 57 M69 57 Q75 61 81 57" stroke={glow} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </g>
        <path className="cat__happy" d="M39 58 Q45 49 51 58 M69 58 Q75 49 81 58" stroke={glow} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path className="cat__mouth" d="M54 67 Q60 71 66 67" stroke={glow} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <g className="cat__yawn">
          <ellipse cx="60" cy="68" rx="4.5" ry="4.5" fill="none" stroke={glow} strokeWidth="2.2" />
        </g>
        <ellipse cx="36" cy="67" rx="4" ry="2.4" fill="#ff7fa0" opacity=".5" />
        <ellipse cx="84" cy="67" rx="4" ry="2.4" fill="#ff7fa0" opacity=".5" />
        <Hat acc={acc} g={g} ink="#2a2230" top={20} />
      </g>
      {/* right hand: floats, waves and taps its screen */}
      <g className="cat__paw">
        <ellipse cx="88" cy="100" rx="7" ry="8" fill={g('fur')} stroke={f.d} strokeOpacity=".4" />
      </g>
    </>
  )
}
