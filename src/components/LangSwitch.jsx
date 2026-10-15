import { LANG, setLang, T } from '../lib/i18n'
import { supabase } from '../lib/supabase'

/** English / العربية switch. Saved to your account, so all your devices follow it. */
export default function LangSwitch({ className = '' }) {
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={T("Language / اللغة")}>
      <button type="button" className={LANG === 'en' ? 'is-active' : ''} aria-pressed={LANG === 'en'} onClick={() => LANG !== 'en' && setLang('en', supabase)} lang="en">{T("English")}</button>
      <button type="button" className={LANG === 'ar' ? 'is-active' : ''} aria-pressed={LANG === 'ar'} onClick={() => LANG !== 'ar' && setLang('ar', supabase)} lang="ar">
        العربية
      </button>
    </div>
  );
}
