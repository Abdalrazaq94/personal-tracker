import { useEffect, useState } from 'react'
import { supabase, supabaseUrl } from '../lib/supabase'
import { T, Tr } from '../lib/i18n'

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
          window.prompt(T('Copy this:'), text)
        }
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? T("Copied ✓") : label}
    </button>
  );
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
        if (error) setError(/ingest_token|column/i.test(error.message) ? T("Run the database update supabase/migrations/004_wallet_ingest.sql first.") : error.message)
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
    if (error) setError(/ingest_token|column/i.test(error.message) ? T("Run the database update supabase/migrations/004_wallet_ingest.sql first.") : error.message)
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
        body: JSON.stringify({ token, title: "Test payment", text: "£0.01 with Visa •••• 0000" }), // English on purpose: the server reads it
      })
      const out = await res.json().catch(() => ({}))
      if (res.status === 404) setTest({ ok: false, msg: T("The “ingest” function isn’t deployed yet (step 2).") })
      else if (out.added) {
        setTest({ ok: true, msg: T("It works! A £0.01 “Test payment” was added — you can delete it.") })
        onTestAdded?.()
      } else setTest({ ok: false, msg: out.error || out.skipped || T("Error {0}", [res.status]) })
    } catch {
      setTest({ ok: false, msg: T("Could not reach the function. Is it deployed with “Verify JWT” off?") })
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
          <strong>{T("Google Wallet")}</strong>
          <span className="muted small">{" "}{T("· add payments automatically (Android)")}</span>
        </span>
      </button>
    );

  return (
    <section className="ai-panel wallet">
      <div className="ai-panel__head">
        <h2>{Tr("{0} Google Wallet auto-add", <span className="ai-spark" aria-hidden>
            ⇣
          </span>)}</h2>
        <button type="button" className="icon-btn" aria-label={T("Close")} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      <p className="small muted">{T(
        "Each time you pay with Google Wallet, your phone shows a notification. The free app MacroDroid sends it here and it appears in Spending by itself."
      )}</p>

      {error && <p className="error-text">{error}</p>}

      {token === undefined ? (
        <div className="ai-loading">{T("Loading…")}</div>
      ) : !token ? (
        <button className="btn btn--block" onClick={() => save(newToken())} disabled={busy}>{T("Create my private key")}</button>
      ) : (
        <>
          <ol className="steps wallet-steps">
            <li>{Tr(
                "{0} (once): run {1} in the SQL Editor, and deploy the {2} function with {3} (see README).",
                <b>{T("Database & function")}</b>,
                <code>004_wallet_ingest.sql</code>,
                <code>ingest</code>,
                <b>{T("Verify JWT off")}</b>
              )}</li>
            <li>
              <b>{T("Test it here:")}</b>{' '}
              <button className="btn btn--sm" onClick={sendTest} disabled={busy}>
                {busy ? T("Sending…") : T("Send test")}
              </button>
              {test && <span className={`wallet-test ${test.ok ? 'is-ok' : ''}`}>{test.msg}</span>}
            </li>
            <li>{Tr(
                "On your phone, install {0} from the Play Store and allow {1} when it asks.",
                <b>{T("MacroDroid")}</b>,
                <b>{T("Notification access")}</b>
              )}</li>
            <li>{Tr(
                "{0} Notification → Notification received → choose app {1} → any content.",
                <b>{T("Add macro → Trigger:")}</b>,
                <b>{T("Google Wallet")}</b>
              )}</li>
            <li>{Tr(
                "{0} Connectivity → {1}. Method {2}, this URL:{3}Body / content type {4}, with this text:{5}{6}",
                <b>{T("Action:")}</b>,
                <b>{T("HTTP Request")}</b>,
                <b>{T("POST")}</b>,
                <div className="copy-row">
                  <code>{INGEST_URL}</code>
                  <Copy text={INGEST_URL} />
                </div>,
                <b>application/json</b>,
                <div className="copy-row">
                  <code className="wrap">{body}</code>
                  <Copy text={body} />
                </div>,
                <span className="small muted">{Tr(
                    "If MacroDroid’s names differ, use its “…” magic-text button to insert {0} and {1}.",
                    <i>{T("Notification title")}</i>,
                    <i>{T("Notification text")}</i>
                  )}</span>
              )}</li>
            <li>{Tr(
                "Save the macro. Your next Google Wallet payment appears in Spending with a {0} tag.",
                <span className="tag">{T("Wallet")}</span>
              )}</li>
          </ol>
          <div className="form-foot">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => window.confirm(T("Make a new key? The old one stops working, so update MacroDroid too.")) && save(newToken())}
            >{T("New key")}</button>
            <button className="btn btn--ghost btn--sm" onClick={() => window.confirm(T("Turn off auto-add?")) && save('')}>{T("Turn off")}</button>
          </div>
          <p className="small muted">{T(
            "Keep your key private — anyone with it could add spending to your account (but can’t read anything)."
          )}</p>
        </>
      )}
    </section>
  );
}
