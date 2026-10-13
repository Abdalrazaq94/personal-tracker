import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Must match the LANGS list in supabase/functions/ai/index.ts
export const LANGUAGES = [
  { name: 'Arabic', native: 'العربية' },
  { name: 'Urdu', native: 'اردو' },
  { name: 'Persian', native: 'فارسی' },
  { name: 'Turkish', native: 'Türkçe' },
  { name: 'Kurdish (Sorani)', native: 'کوردی' },
  { name: 'Hindi', native: 'हिन्दी' },
  { name: 'Bengali', native: 'বাংলা' },
  { name: 'French', native: 'Français' },
  { name: 'Spanish', native: 'Español' },
  { name: 'German', native: 'Deutsch' },
  { name: 'Italian', native: 'Italiano' },
  { name: 'Portuguese', native: 'Português' },
  { name: 'Russian', native: 'Русский' },
  { name: 'Polish', native: 'Polski' },
  { name: 'Romanian', native: 'Română' },
  { name: 'Dutch', native: 'Nederlands' },
  { name: 'Chinese (Simplified)', native: '简体中文' },
  { name: 'Japanese', native: '日本語' },
  { name: 'Korean', native: '한국어' },
  { name: 'Indonesian', native: 'Bahasa Indonesia' },
  { name: 'Malay', native: 'Bahasa Melayu' },
  { name: 'Somali', native: 'Soomaali' },
]

const valid = (v) => (LANGUAGES.some((l) => l.name === v) ? v : null)

const readLocal = () => {
  try {
    return valid(localStorage.getItem('translateTo'))
  } catch {
    return null
  }
}

/**
 * The language words are translated into.
 * Saved on the user's account (so phone and computer agree) and in this browser as a quick cache.
 */
export function useTranslateTo() {
  const [lang, setLangState] = useState(() => readLocal() || 'Arabic')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const saved = valid(data?.user?.user_metadata?.translate_to)
      if (saved) {
        setLangState(saved)
        try {
          localStorage.setItem('translateTo', saved)
        } catch {}
      }
    })
  }, [])

  const setLang = (v) => {
    if (!valid(v)) return
    setLangState(v)
    try {
      localStorage.setItem('translateTo', v)
    } catch {}
    supabase.auth.updateUser({ data: { translate_to: v } })
  }

  return [lang, setLang]
}
