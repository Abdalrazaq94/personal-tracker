import { useEffect, useRef, useState } from 'react'
import { playSound, SOUNDS } from '../lib/sounds'

/**
 * When a reminder arrives while the app is open, this plays the sound you picked for that kind of reminder.
 *  - "Ring until I answer": a full-screen alarm that keeps playing (up to 2 minutes) until you tap a button.
 *  - "Once": the sound plays once and a small banner shows the reminder.
 */
export default function AlarmOverlay() {
  const [alarm, setAlarm] = useState(null)
  const [busy, setBusy] = useState(false)
  const stopRef = useRef(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e) => {
      const m = e.data || {}
      if (m.type === 'tracker-alarm') setAlarm({ ...m, at: Date.now() })
      if (m.type === 'tracker-alarm-stop') setAlarm((a) => (a && (!m.tag || a.tag === m.tag) ? null : a))
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (!alarm) return
    const stop = playSound(alarm.sound, { loop: !!alarm.ring })
    stopRef.current = stop
    const vib = SOUNDS[alarm.sound]?.vibrate
    if (vib && navigator.vibrate) navigator.vibrate(vib)
    // a ringing alarm stops by itself after 2 minutes; a one-time banner hides after 12 seconds
    const t = setTimeout(() => (alarm.ring ? stop() : setAlarm(null)), alarm.ring ? 2 * 60 * 1000 : 12000)
    return () => {
      clearTimeout(t)
      stop()
    }
  }, [alarm])

  if (!alarm) return null

  const close = async () => {
    const tag = alarm.tag
    setAlarm(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const list = (await reg?.getNotifications({ tag })) || []
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

  const buttons = (alarm.actions || []).map((a) => (
    <button key={a.action} className={`btn ${a.action === 'snooze' ? 'btn--ghost' : ''}`} disabled={busy} onClick={() => answer(a.action)}>
      {a.title}
    </button>
  ))

  if (!alarm.ring)
    return (
      <div className="alarm-toast" role="status" aria-live="polite">
        <div className="alarm-toast__text">
          <strong>{alarm.title}</strong>
          {alarm.body && <span>{alarm.body}</span>}
        </div>
        <div className="alarm-toast__actions">
          {buttons}
          <button className="btn btn--ghost" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
    )

  return (
    <div className="alarm" role="alertdialog" aria-live="assertive" aria-label={alarm.title}>
      <div className="alarm__card">
        <div className="alarm__ring" aria-hidden>
          🔔
        </div>
        <strong className="alarm__title">{alarm.title}</strong>
        {alarm.body && <p className="alarm__body">{alarm.body}</p>}
        <div className="alarm__actions">{buttons}</div>
        <button className="alarm__mute" onClick={() => stopRef.current?.()}>
          Stop the sound
        </button>
      </div>
    </div>
  )
}
