import { useEffect, useState } from 'react'
import { supabase, supabaseUrl } from '../lib/supabase'

const INGEST_URL = `${supabaseUrl}/functions/v1/ingest`

const newToken = () => {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'wt_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function Copy({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          window.prompt('Copy this:', text)
        }
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}

/** Spend → "Google Wallet": private key + MacroDroid steps + test button. */
export default function WalletSetup({ onTestAdded }) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(undefined) // undefined = loading, '' = none
  const [error, setError] = useState(null)
  const [test, setTest] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || token !== undefined) return
    supabase
      .from('user_settings')
      .select('ingest_token')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(/ingest_token|column/i.test(error.message) ? 'Run the database update supabase/migrations/004_wallet_ingest.sql first.' : error.message)
        setToken(data?.ingest_token || '')
      })
  }, [open, token])

  const save = async (value) => {
    setBusy(true)
    setError(null)
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: u.user.id, ingest_token: value, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) setError(/ingest_token|column/i.test(error.message) ? 'Run the database update supabase/migrations/004_wallet_ingest.sql first.' : error.message)
    else {
      setToken(value || '')
      setTest(null)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    setTest(null)
    try {
      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, title: 'Test payment', text: '£0.01 with Visa •••• 0000' }),
      })
      const out = await res.json().catch(() => ({}))
      if (res.status === 404) setTest({ ok: false, msg: 'The “ingest” function isn’t deployed yet (step 2).' })
      else if (out.added) {
        setTest({ ok: true, msg: 'It works! A £0.01 “Test payment” was added — you can delete it.' })
        onTestAdded?.()
      } else setTest({ ok: false, msg: out.error || out.skipped || `Error ${res.status}` })
    } catch {
      setTest({ ok: false, msg: 'Could not reach the function. Is it deployed with “Verify JWT” off?' })
    }
    setBusy(false)
  }

  const body = token ? `{"token":"${token}","title":"[notification_title]","text":"[notification]"}` : ''

  if (!open)
    return (
      <button type="button" className="ai-toggle" onClick={() => setOpen(true)}>
        <span className="ai-spark" aria-hidden>
          ⇣
        </span>
        <span>
          <strong>Google Wallet</strong>
          <span className="muted small"> · add payments automatically (Android)</span>
        </span>
      </button>
    )

  return (
    <section className="ai-panel wallet">
      <div className="ai-panel__head">
        <h2>
          <span className="ai-spark" aria-hidden>
            ⇣
          </span>{' '}
          Google Wallet auto-add
        </h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      <p className="small muted">
        Each time you pay with Google Wallet, your phone shows a notification. The free app MacroDroid sends it here and it appears in
        Spending by itself.
      </p>

      {error && <p className="error-text">{error}</p>}

      {token === undefined ? (
        <div className="ai-loading">Loading…</div>
      ) : !token ? (
        <button className="btn btn--block" onClick={() => save(newToken())} disabled={busy}>
          Create my private key
        </button>
      ) : (
        <>
          <ol className="steps wallet-steps">
            <li>
              <b>Database &amp; function</b> (once): run <code>004_wallet_ingest.sql</code> in the SQL Editor, and deploy the{' '}
              <code>ingest</code> function with <b>Verify JWT off</b> (see README).
            </li>
            <li>
              <b>Test it here:</b>{' '}
              <button className="btn btn--sm" onClick={sendTest} disabled={busy}>
                {busy ? 'Sending…' : 'Send test'}
              </button>
              {test && <span className={`wallet-test ${test.ok ? 'is-ok' : ''}`}>{test.msg}</span>}
            </li>
            <li>
              On your phone, install <b>MacroDroid</b> from the Play Store and allow <b>Notification access</b> when it asks.
            </li>
            <li>
              <b>Add macro → Trigger:</b> Notification → Notification received → choose app <b>Google Wallet</b> → any content.
            </li>
            <li>
              <b>Action:</b> Connectivity → <b>HTTP Request</b>. Method <b>POST</b>, this URL:
              <div className="copy-row">
                <code>{INGEST_URL}</code>
                <Copy text={INGEST_URL} />
              </div>
              Body / content type <b>application/json</b>, with this text:
              <div className="copy-row">
                <code className="wrap">{body}</code>
                <Copy text={body} />
              </div>
              <span className="small muted">
                If MacroDroid’s names differ, use its “…” magic-text button to insert <i>Notification title</i> and{' '}
                <i>Notification text</i>.
              </span>
            </li>
            <li>
              Save the macro. Your next Google Wallet payment appears in Spending with a <span className="tag">Wallet</span> tag.
            </li>
          </ol>
          <div className="form-foot">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => window.confirm('Make a new key? The old one stops working, so update MacroDroid too.') && save(newToken())}
            >
              New key
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => window.confirm('Turn off auto-add?') && save('')}>
              Turn off
            </button>
          </div>
          <p className="small muted">Keep your key private — anyone with it could add spending to your account (but can’t read anything).</p>
        </>
      )}
    </section>
  )
}
