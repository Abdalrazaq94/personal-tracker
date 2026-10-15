import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorBar, PageHeader, Segmented } from '../components/ui'
import { KINDS, playSound, SOUNDS, soundsWith } from '../lib/sounds'
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
        prayer_repeat: soundsWith(next.sounds).prayer.ring,
        ...(place ? { prayer_place: place } : {}),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      setSettings(next)
    })

  const sounds = soundsWith(settings?.sounds)
  const locked = busy || !settings || settings.needsSounds || settings.needsUpdate

  const preview = (id) => {
    playSound(id)
    const vib = SOUNDS[id]?.vibrate
    if (vib && navigator.vibrate) navigator.vibrate(vib)
  }

  const setSound = (kind, patch) => {
    const next = { ...sounds, [kind]: { ...sounds[kind], ...patch } }
    if (patch.sound) preview(patch.sound)
    setSettings((s) => ({ ...s, sounds: next }))
    run(async () => {
      await saveSettings({ sounds: next, ...(kind === 'prayer' ? { prayer_repeat: next.prayer.ring } : {}) })
    }, 'Saved.')
  }

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
      {settings?.needsSounds && !settings?.needsUpdate && (
        <div className="error-bar" role="alert">
          <span>To pick sounds and task reminders, run supabase/migrations/010_sounds.sql in Supabase → SQL Editor, then refresh.</span>
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
              <button className="btn" disabled={busy} onClick={() => run(sendTest, 'Sent. It should arrive in a few seconds.')}>
                Send a test
              </button>
              <button className="btn btn--ghost" disabled={busy} onClick={() => run(disablePush, 'Reminders are off on this phone.')}>
                Turn off
              </button>
            </>
          )}
        </div>
        {note && note !== 'Saved.' && <p className="small rem-note">{note}</p>}
      </section>

      <section className="card rem-card">
        <h2>Sounds</h2>
        <p className="muted small">Pick a sound for each kind of reminder, and whether it rings until you answer or just once.</p>
        {KINDS.map((k) => {
          const v = sounds[k.id]
          return (
            <div key={k.id} className="snd-row">
              <div className="snd-row__head">
                <strong>{k.label}</strong>
                <span className="muted small">{k.hint}</span>
              </div>
              <div className="snd-row__controls">
                <select className="rem-select" aria-label={`${k.label} sound`} value={v.sound} disabled={locked} onChange={(e) => setSound(k.id, { sound: e.target.value })}>
                  {Object.entries(SOUNDS).map(([id, x]) => (
                    <option key={id} value={id}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn--ghost snd-play" aria-label={`Play ${SOUNDS[v.sound]?.label}`} onClick={() => preview(v.sound)}>
                  ▶
                </button>
                <Segmented
                  small
                  value={v.ring ? 'ring' : 'once'}
                  onChange={(m) => !locked && setSound(k.id, { ring: m === 'ring' })}
                  options={[
                    { value: 'ring', label: 'Ring until I answer' },
                    { value: 'once', label: 'Once' },
                  ]}
                />
              </div>
            </div>
          )
        })}
        <label className="rem-row">
          <span>
            <strong>Ring again</strong>
            <span className="muted small">How often “Ring until I answer” repeats</span>
          </span>
          <select
            className="rem-select"
            value={settings?.ring_every ?? 2}
            disabled={locked}
            onChange={(e) => {
              const ring_every = Number(e.target.value)
              run(async () => {
                await saveSettings({ ring_every })
                setSettings((s) => ({ ...s, ring_every }))
              }, 'Saved.')
            }}
          >
            <option value={1}>Every 1 min</option>
            <option value={2}>Every 2 min</option>
            <option value={5}>Every 5 min</option>
            <option value={10}>Every 10 min</option>
          </select>
        </label>
        <p className="muted small">
          When the app is open you hear the exact sound you picked; “Ring until I answer” keeps playing until you tap a button. When the app is
          closed, your phone plays its notification sound, and each sound above vibrates in its own pattern, so you can tell them apart. After an
          hour without an answer, it slows to every 15 minutes.
        </p>
        {note === 'Saved.' && <p className="small rem-note">Saved.</p>}
      </section>

      <section className="card rem-card">
        <h2>Change the sound</h2>
        <p className="muted small">Phones don’t let websites pick the sound, but you can choose a louder or longer one (an alarm or ringtone) for Tracker:</p>
        <ol className="rem-tips small">
          <li>
            Open your phone’s <b>Settings → Apps → Chrome → Notifications</b> (or <b>Apps → Tracker</b> if you added it to your Home Screen).
          </li>
          <li>
            Find <b>Sites</b> → <b>personal-tracker-black-xi.vercel.app</b> (on some phones it’s listed straight under Notifications).
          </li>
          <li>
            Tap <b>Sound</b> and choose a long one, such as an alarm tone. Also turn on <b>Override Do Not Disturb</b> if you want prayers to
            ring at night.
          </li>
        </ol>
      </section>

      <section className="card rem-card">
        <h2>Plans and tasks</h2>
        <p className="muted small">
          Any plan with a time reminds you at that time. Mark it <b>Important</b> and choose <b>Remind me</b> (15 min, 1 hour or 1 day
          before) when you add it. For tasks, tap <b>⏰ Remind me</b> when you add one.
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
                <span className="muted small">Fajr, Dhuhr, Asr, Maghrib and Isha · sound under Sounds above</span>
              </span>
              <input type="checkbox" className="rem-switch" checked={!!settings?.prayer_notify} disabled={busy || !on} onChange={(e) => setPrayer({ prayer_notify: e.target.checked })} />
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
