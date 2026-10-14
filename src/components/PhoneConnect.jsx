import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'

export const APP_URL = 'https://github.com/Abdalrazaq94/personal-tracker/releases/download/phone-app/tracker-phone.apk'

const newToken = () => {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'wt_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Phone → "Connect your phone": download the Tracker Phone helper, give it your private key (QR code),
 * turn on Usage access. After that phone time arrives by itself every hour.
 */
export default function PhoneConnect({ connected, lastUpdate }) {
  const [open, setOpen] = useState(!connected)
  const [token, setToken] = useState(undefined) // undefined = loading, '' = none yet
  const [qr, setQr] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => setOpen(!connected), [connected])

  useEffect(() => {
    if (!open || token !== undefined) return
    supabase
      .from('user_settings')
      .select('ingest_token')
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error) {
          setError(/ingest_token|column/i.test(error.message) ? 'Run supabase/migrations/005_screen_time.sql in Supabase → SQL Editor first.' : error.message)
          setToken('')
          return
        }
        if (data?.ingest_token) return setToken(data.ingest_token)
        // no key yet: make one now
        const value = newToken()
        const { data: u } = await supabase.auth.getUser()
        const { error: e2 } = await supabase
          .from('user_settings')
          .upsert({ user_id: u.user.id, ingest_token: value, updated_at: new Date().toISOString() })
        if (e2) setError(e2.message)
        setToken(e2 ? '' : value)
      })
  }, [open, token])

  useEffect(() => {
    if (!token) return
    QRCode.toDataURL(token, { margin: 1, width: 360, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [token])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
    } catch {
      window.prompt('Copy your key:', token)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!open)
    return (
      <div className="phone-connected">
        <span className="phone-connected__dot" aria-hidden />
        <span>
          <strong>Phone connected</strong>
          <span className="muted small"> · updates every hour{lastUpdate ? ` · last ${lastUpdate}` : ''}</span>
        </span>
        <button className="link small" onClick={() => setOpen(true)}>
          Set up again
        </button>
      </div>
    )

  return (
    <section className="card phone-connect">
      <div className="phone-connect__head">
        <h2>Connect your phone</h2>
        {connected && (
          <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
            ×
          </button>
        )}
      </div>
      <p className="muted small">
        A small helper app measures your phone time and sends it here every hour by itself. Set it up once (Android).
      </p>
      {error && <p className="error-text">{error}</p>}

      <ol className="phone-steps">
        <li>
          <strong>Install Tracker Phone</strong>
          <span className="muted small">
            On your phone open this link and install it. Android will ask to allow installing from your browser: allow it once.
          </span>
          <div className="phone-steps__row">
            <a className="btn btn--sm" href={APP_URL}>
              Download the app
            </a>
            <QrMini text={APP_URL} label="Scan with your phone to download" />
          </div>
        </li>
        <li>
          <strong>Give it your private key</strong>
          <span className="muted small">
            Scan this code with your phone’s camera, tap <b>Copy</b>, then in Tracker Phone tap <b>Paste key</b>.
          </span>
          {token === undefined ? (
            <span className="muted small">Loading…</span>
          ) : token ? (
            <div className="phone-key">
              {qr && <img src={qr} alt="QR code of your private key" width="180" height="180" />}
              <div className="phone-key__side">
                <code className="phone-key__text">{token}</code>
                <button className="btn btn--ghost btn--sm" onClick={copy}>
                  {copied ? 'Copied ✓' : 'Copy key'}
                </button>
                <span className="muted small">Keep it private: anyone with this key can add data to your tracker.</span>
              </div>
            </div>
          ) : null}
        </li>
        <li>
          <strong>Turn on Usage access</strong>
          <span className="muted small">
            In Tracker Phone tap <b>Turn on usage access</b>, choose <b>Tracker Phone</b> and switch it on. Done. Your phone time appears
            here within a minute, then every hour.
          </span>
        </li>
      </ol>
    </section>
  )
}

function QrMini({ text, label }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 220 }).then(setSrc).catch(() => {})
  }, [text])
  if (!src) return null
  return (
    <span className="phone-qr-mini">
      <img src={src} alt={label} width="88" height="88" />
      <span className="muted small">{label}</span>
    </span>
  )
}
