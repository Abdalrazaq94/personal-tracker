import { Link, useLocation } from 'react-router-dom'
import { LANG, setLang, T } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { toggleTheme, useTheme } from '../lib/theme'

/** Top-right corner: EN | ع language switch, the light / dark switch and (signed in) the ⚙️ Settings button. */
export default function TopControls({ className = '', settings = false }) {
  const theme = useTheme()
  const dark = theme === 'dark'
  return (
    <div className={`top-controls ${className}`}>
      <div className="lang-mini" role="group" aria-label={T('Language / اللغة')}>
        <button type="button" lang="en" className={LANG === 'en' ? 'is-active' : ''} aria-pressed={LANG === 'en'} aria-label="English" onClick={() => LANG !== 'en' && setLang('en', supabase)}>
          EN
        </button>
        <button type="button" lang="ar" className={LANG === 'ar' ? 'is-active' : ''} aria-pressed={LANG === 'ar'} aria-label="العربية" onClick={() => LANG !== 'ar' && setLang('ar', supabase)}>
          ع
        </button>
      </div>
      <button
        type="button"
        className="theme-btn"
        onClick={toggleTheme}
        aria-label={dark ? T('Light mode') : T('Dark mode')}
        title={dark ? T('Light mode') : T('Dark mode')}
      >
        {dark ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
          </svg>
        )}
      </button>
      {settings && <SettingsLink />}
    </div>
  )
}

function SettingsLink() {
  const { pathname } = useLocation()
  const here = pathname === '/settings' || pathname === '/customize'
  return (
    <Link to="/settings" className={`settings-btn ${here ? 'is-active' : ''}`} aria-label={T('Settings')} title={T('Settings')} aria-current={here ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </Link>
  )
}
