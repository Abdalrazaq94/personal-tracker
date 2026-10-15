import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Segmented } from '../components/ui'
import { T } from '../lib/i18n'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else if (!data.session) setMessage('Account created. Check your email to confirm it, then sign in.')
    }
    setBusy(false)
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="brand">{T("Tracker")}</h1>
        <p className="muted">{T("Words, tasks, habits, spending and plans — in one place.")}</p>

        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m)
            setError(null)
            setMessage(null)
          }}
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
        />

        <label className="field">
          <span>{T("Email")}</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>{T("Password")}</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="error-text">{error}</p>}
        {message && <p className="note">{message}</p>}

        <button className="btn btn--block" disabled={busy}>
          {busy ? T("Please wait…") : mode === 'signin' ? T("Sign in") : T("Create account")}
        </button>
      </form>
    </div>
  );
}
