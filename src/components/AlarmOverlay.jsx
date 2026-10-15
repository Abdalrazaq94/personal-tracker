import { useEffect, useRef, useState } from 'react'

/**
 * When a reminder arrives while the app is open, this plays a looping alarm
 * and shows the reminder with its buttons, until you answer it (or 2 minutes pass).
 */
export default function AlarmOverlay() {
  const [alarm, setAlarm] = useState(null)
  const [busy, setBusy] = useState(false)
  const sound = useRef(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e) => {
      const m = e.data || {}
      if (m.type === 'tracker-alarm') setAlarm(m)
      if (m.type === 'tracker-alarm-stop') setAlarm((a) => (a && (!m.tag || a.tag === m.tag) ? null : a))
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  // the looping sound
  useEffect(() => {
    if (!alarm) return
    const stop = startAlarmSound()
    sound.current = stop
    const limit = setTimeout(() => stop(), 2 * 60 * 1000)
    if (navigator.vibrate) navigator.vibrate([800, 300, 800, 300, 800])
    return () => {
      clearTimeout(limit)
      stop()
    }
  }, [alarm])

  if (!alarm) return null

  const close = async () => {
    setAlarm(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const list = (await reg?.getNotifications({ tag: alarm.tag })) || []
      list.forEach((n) => n.close())
    } catch {
      /* fine */
    }
  }

  const answer = async (action) => {
    const d = alarm.data || {}
    if (d.api && d.secret && d.kind !== 'test') {
      setBusy(true)
      const what = action === 'snooze' ? 'snooze' : action === 'ontime' ? 'ontime' : action === 'late' ? 'late' : 'done'
      try {
        await fetch(d.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'act', kind: d.kind, id: d.id, day: d.day, prayer: d.prayer, what, secret: d.secret }),
        })
      } catch {
        /* the reminder will simply come again */
      }
      setBusy(false)
    }
    await close()
  }

  return (
    <div className="alarm" role="alertdialog" aria-live="assertive" aria-label={alarm.title}>
      <div className="alarm__card">
        <div className="alarm__ring" aria-hidden>
          🔔
        </div>
        <strong className="alarm__title">{alarm.title}</strong>
        {alarm.body && <p className="alarm__body">{alarm.body}</p>}
        <div className="alarm__actions">
          {(alarm.actions || []).map((a) => (
            <button key={a.action} className={`btn ${a.action === 'snooze' ? 'btn--ghost' : ''}`} disabled={busy} onClick={() => answer(a.action)}>
              {a.title}
            </button>
          ))}
        </div>
        <button className="alarm__mute" onClick={() => sound.current?.()}>
          Stop the sound
        </button>
      </div>
    </div>
  )
}

/** Beep-beep-beep… every 1.5 seconds until stopped. Returns stop(). */
function startAlarmSound() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return () => {}
  let ctx
  try {
    ctx = new AC()
  } catch {
    return () => {}
  }
  ctx.resume?.().catch(() => {})
  const beep = (at, freq) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(0.25, at + 0.02)
    g.gain.setValueAtTime(0.25, at + 0.16)
    g.gain.linearRampToValueAtTime(0, at + 0.2)
    o.connect(g).connect(ctx.destination)
    o.start(at)
    o.stop(at + 0.22)
  }
  const ring = () => {
    const t = ctx.currentTime + 0.05
    beep(t, 880)
    beep(t + 0.28, 1175)
    beep(t + 0.56, 880)
    beep(t + 0.84, 1175)
  }
  ring()
  const id = setInterval(ring, 1500)
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(id)
    ctx.close?.().catch(() => {})
  }
}
