import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorBar, PageHeader } from '../components/ui'
import { currentStatus, disablePush, enablePush, loadSettings, saveSettings, sendTest } from '../lib/push'

/** Turn phone reminders on, test them, and choose prayer reminders. */
export default function Reminders() {
  const [status, setStatus] = useState('…')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [note, setNote] = useState('')
  const [settings, setSettings] = useState(null)
  const [place, setPlace] = useState(null)

  useEffect(() => {
    currentStatus().then(setStatus)
    loadSettings().then(setSettings)
    supabase.auth.getUser().then(({ data }) => setPlace(data?.user?.user_metadata?.prayer || null))
  }, [])

  const run = async (fn, ok) => {
    setBusy(true)
    setError(null)
    setNote('')
    try {
      await fn()
      if (ok) setNote(ok)
    } catch (e) {
      setError(e.message)
    }
    setStatus(await currentStatus())
    setBusy(false)
  }

  const setPrayer = (patch) =>
    run(async () => {
      const next = { ...settings, ...patch }
      await saveSettings({
        prayer_notify: !!next.prayer_notify,
        prayer_repeat: next.prayer_repeat !== false,
        ...(place ? { prayer_place: place } : {}),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      setSettings(next)
    })

  const on = status === 'on'
  const isIphone = /iPhone|iPad/.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone

  return (
    <div className="page">
      <PageHeader title="Reminders" subtitle="Notifications on this phone for plans and prayers" />
      <ErrorBar error={error} onClose={() => setError(null)} />
      {settings?.needsUpdate && (
        <div className="error-bar" role="alert">
          <span>Run supabase/migrations/008_reminders.sql in Supabase → SQL Editor, then refresh.</span>
        </div>
      )}

      <section className="card rem-card">
        <div className="rem-head">
          <span className={`rem-dot ${on ? 'is-on' : ''}`} aria-hidden />
          <div>
            <h2>{on ? 'Reminders are on' : status === 'blocked' ? 'Notifications are blocked' : status === 'unsupported' ? 'Not available here' : 'Reminders are off'}</h2>
            <p className="muted small">
              {on
                ? 'This phone gets your reminders, even when the app is closed.'
                : status === 'blocked'
                  ? 'Allow notifications for this site in your browser settings (tap the lock icon next to the address), then come back.'
                  : status === 'unsupported'
                    ? isIphone && !standalone
                      ? 'On iPhone: tap Share → “Add to Home Screen”, open Tracker from there, then turn reminders on.'
                      : 'This browser can’t show notifications. Try Chrome.'
                    : 'Turn them on to get a sound and a notification when a plan or prayer is due.'}
            </p>
          </div>
        </div>
        <div className="rem-actions">
          {!on && status !== 'unsupported' && (
            <button className="btn" disabled={busy} onClick={() => run(enablePush, 'Done. Now tap “Send a test”.')}>
              {busy ? 'Turning on…' : 'Turn on reminders'}
            </button>
          )}
          {on && (
            <>
              <button className="btn" disabled={busy} onClick={() => run(async () => {
                const r = await sendTest()
                if (!r?.sent) throw new Error('Nothing was delivered. Turn reminders off and on again.')
              }, 'Sent. It should arrive in a few seconds.')}>
                Send a test
              </button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => run(disablePush, 'Reminders are off on this phone.')}>
                Turn off
              </button>
            </>
          )}
        </div>
        {note && <p className="small rem-note">{note}</p>}
      </section>

      <section className="card rem-card">
        <h2>Plans</h2>
        <p className="muted small">
          Any plan with a time reminds you at that time. Mark it <b>Important</b> and choose <b>Remind me</b> (15 min, 1 hour or 1 day
          before) when you add it. Important reminders repeat every 5 minutes until you tap <b>Done</b> or <b>Postpone</b>.
        </p>
      </section>

      <section className="card rem-card">
        <h2>Prayers</h2>
        {!place ? (
          <p className="muted small">
            Choose your city in <a href="#/commit">Commitments</a> first.
          </p>
        ) : (
          <>
            <p className="muted small">
              {place.name}
              {place.region ? `, ${place.region}` : ''}
            </p>
            <label className="rem-row">
              <span>
                <strong>Remind me at each prayer time</strong>
                <span className="muted small">Fajr, Dhuhr, Asr, Maghrib and Isha</span>
              </span>
              <input type="checkbox" className="rem-switch" checked={!!settings?.prayer_notify} disabled={busy || !on} onChange={(e) => setPrayer({ prayer_notify: e.target.checked })} />
            </label>
            <label className="rem-row">
              <span>
                <strong>Keep reminding until I mark it</strong>
                <span className="muted small">Again every 10 minutes until you tap Prayed (or mark it in the app)</span>
              </span>
              <input type="checkbox" className="rem-switch" checked={settings?.prayer_repeat !== false} disabled={busy || !on || !settings?.prayer_notify} onChange={(e) => setPrayer({ prayer_repeat: e.target.checked })} />
            </label>
            {!on && <p className="muted small">Turn reminders on above first.</p>}
          </>
        )}
      </section>

      <section className="card rem-card">
        <h2>Tips for reliable reminders</h2>
        <ul className="rem-tips small">
          <li>Add Tracker to your Home Screen (Chrome menu ⋮ → “Add to Home screen”).</li>
          <li>Android: Settings → Apps → Chrome → Battery → “Unrestricted”, so reminders aren’t delayed.</li>
          <li>Keep notifications for this site allowed in Chrome, and sound on for them.</li>
        </ul>
      </section>
    </div>
  )
}
