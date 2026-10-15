/**
 * Reminder sounds, made in the browser (no audio files to download).
 * Each sound has its own vibration pattern too — the vibration works even when the app is closed.
 * Keep the ids and vibration patterns in sync with public/sw.js.
 */

const note = (ctx, at, freq, { type = 'sine', vol = 0.25, len = 0.3, attack = 0.01, decay = true } = {}) => {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(vol, at + attack)
  if (decay) g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  else {
    g.gain.setValueAtTime(vol, at + len - 0.03)
    g.gain.linearRampToValueAtTime(0, at + len)
  }
  o.connect(g).connect(ctx.destination)
  o.start(at)
  o.stop(at + len + 0.05)
}

// each: label, how long one play lasts (s), the vibration, and how to play it
export const SOUNDS = {
  chime: {
    label: 'Chime',
    len: 1.4,
    vibrate: [200, 100, 200],
    play: (ctx, t) => {
      note(ctx, t, 1319, { len: 0.9 })
      note(ctx, t + 0.25, 1047, { len: 1.1 })
    },
  },
  bell: {
    label: 'Bell',
    len: 2.4,
    vibrate: [600, 400, 600],
    play: (ctx, t) => {
      for (const at of [t, t + 1.1]) {
        note(ctx, at, 523, { len: 1.6, vol: 0.22 })
        note(ctx, at, 1046, { len: 1.1, vol: 0.12 })
        note(ctx, at, 1570, { len: 0.7, vol: 0.06 })
      }
    },
  },
  alarm: {
    label: 'Alarm',
    len: 1.2,
    vibrate: [800, 300, 800, 300, 800, 300, 800, 300, 800, 300, 800],
    play: (ctx, t) => {
      for (let i = 0; i < 4; i++) note(ctx, t + i * 0.28, i % 2 ? 1175 : 880, { type: 'square', vol: 0.2, len: 0.2, decay: false })
    },
  },
  digital: {
    label: 'Digital beeps',
    len: 1.0,
    vibrate: [100, 80, 100, 80, 100, 400, 100, 80, 100, 80, 100],
    play: (ctx, t) => {
      for (let i = 0; i < 3; i++) note(ctx, t + i * 0.14, 2093, { type: 'square', vol: 0.12, len: 0.08, decay: false })
      for (let i = 0; i < 3; i++) note(ctx, t + 0.55 + i * 0.14, 2093, { type: 'square', vol: 0.12, len: 0.08, decay: false })
    },
  },
  marimba: {
    label: 'Marimba',
    len: 1.3,
    vibrate: [150, 80, 150, 80, 150, 80, 400],
    play: (ctx, t) => {
      ;[523, 659, 784, 1047].forEach((f, i) => note(ctx, t + i * 0.16, f, { type: 'triangle', vol: 0.3, len: 0.5 }))
    },
  },
  gentle: {
    label: 'Gentle',
    len: 2.2,
    vibrate: [1000],
    play: (ctx, t) => {
      ;[392, 494, 587].forEach((f, i) => note(ctx, t + i * 0.45, f, { vol: 0.15, len: 1.2, attack: 0.25 }))
    },
  },
  ping: {
    label: 'Ping',
    len: 0.8,
    vibrate: [120],
    play: (ctx, t) => note(ctx, t, 1760, { len: 0.6, vol: 0.2 }),
  },
}

// "Adhan" plays your own recording (see lib/adhan.js); only offered for prayers
export const ADHAN = { id: 'adhan', label: 'Adhan (your recording)', vibrate: [400, 200, 400, 200, 1200] }

export const SOUND_IDS = Object.keys(SOUNDS)

// what each kind of reminder uses until you change it
export const KINDS = [
  { id: 'plan', label: 'Plans', hint: 'Plans with a time' },
  { id: 'important', label: 'Important plans', hint: 'Plans marked Important' },
  { id: 'task', label: 'Tasks', hint: 'Tasks with “Remind me”' },
  { id: 'prayer', label: 'Prayers', hint: 'Fajr, Dhuhr, Asr, Maghrib, Isha' },
]
export const DEFAULT_SOUNDS = {
  plan: { sound: 'chime', ring: false },
  important: { sound: 'alarm', ring: true },
  task: { sound: 'marimba', ring: false },
  prayer: { sound: 'bell', ring: true },
}
export const soundsWith = (saved) => {
  const out = {}
  for (const k of KINDS) out[k.id] = { ...DEFAULT_SOUNDS[k.id], ...(saved?.[k.id] || {}) }
  return out
}

/** Plays a sound once, or over and over (loop) until stop() is called. Returns stop(). */
export function playSound(id, { loop = false } = {}) {
  const s = SOUNDS[id] || SOUNDS.chime
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return () => {}
  let ctx
  try {
    ctx = new AC()
  } catch {
    return () => {}
  }
  ctx.resume?.().catch(() => {})
  const once = () => s.play(ctx, ctx.currentTime + 0.05)
  once()
  const id2 = loop ? setInterval(once, (s.len + 0.5) * 1000) : null
  const auto = loop ? null : setTimeout(() => stop(), (s.len + 0.5) * 1000)
  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    if (id2) clearInterval(id2)
    if (auto) clearTimeout(auto)
    ctx.close?.().catch(() => {})
  }
  return stop
}
