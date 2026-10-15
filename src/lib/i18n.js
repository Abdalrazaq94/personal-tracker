import { createElement, Fragment } from 'react'

/**
 * English / Arabic interface.
 *  - t('Daily tasks')                → the Arabic text when the app is in Arabic, otherwise the English
 *  - t('{0} to do', [3])             → fills {0}, {1}… (Arabic can put them in a different order)
 *  - tr('Tap {0} to add', <b>+</b>)  → the same, but the parts can be JSX (bold words, links…)
 * The English text is the key. Switching language saves it to your account and reloads the app.
 */
const KEY = 'tracker-lang'

function readLang() {
  try {
    return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'
  } catch {
    return 'en'
  }
}

export const LANG = readLang()
export const isAr = LANG === 'ar'

// The Arabic text is only downloaded when the app is in Arabic (main.jsx waits for it before drawing).
let AR = {}
export async function loadLang() {
  if (isAr) AR = (await import('../i18n/ar')).default
}
/** Use for all dates and numbers: Arabic month/day names, but the usual 0-9 digits. */
export const LOCALE = isAr ? 'ar-u-nu-latn' : undefined

const fill = (s, vars) =>
  vars == null ? s : s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m))

export function t(s, vars) {
  if (s == null) return s
  const out = (isAr && AR[s]) || s
  return fill(out, vars === undefined ? null : Array.isArray(vars) || typeof vars === 'object' ? vars : [vars])
}

/** Like t(), but the filled-in parts may be JSX. Returns something React can render. */
export function tr(template, ...parts) {
  const text = (isAr && AR[template]) || template
  const out = []
  let last = 0
  text.replace(/\{(\d+)\}/g, (m, i, at) => {
    if (at > last) out.push(text.slice(last, at))
    out.push(parts[Number(i)])
    last = at + m.length
    return m
  })
  if (last < text.length) out.push(text.slice(last))
  return createElement(Fragment, null, ...out)
}

/** Switch language (saved on this phone and in your account) and reload. */
export async function setLang(lang, supabase) {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* ignore */
  }
  try {
    await supabase?.auth.updateUser({ data: { lang } })
    // reminders are written on the server: tell it the language too (needs migrations/013_lang.sql; ignored if not run yet)
    const { data } = await supabase.auth.getUser()
    if (data?.user) await supabase.from('user_settings').upsert({ user_id: data.user.id, lang })
  } catch {
    /* the phone remembers it anyway */
  }
  window.location.reload()
}

/** After sign-in: follow the language saved in the account (so all your devices match). */
export function followAccountLang(user) {
  const want = user?.user_metadata?.lang
  if ((want === 'ar' || want === 'en') && want !== LANG) {
    try {
      localStorage.setItem(KEY, want)
    } catch {
      return
    }
    window.location.reload()
  }
}

/** Right-to-left layout and the Arabic font. */
export function applyLang() {
  const html = document.documentElement
  html.lang = LANG
  html.dir = isAr ? 'rtl' : 'ltr'
  if (isAr && !document.getElementById('ar-font')) {
    const pre = document.createElement('link')
    pre.rel = 'preconnect'
    pre.href = 'https://fonts.gstatic.com'
    pre.crossOrigin = ''
    const l = document.createElement('link')
    l.id = 'ar-font'
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'
    document.head.append(pre, l)
  }
}

// Short names used across the app (capital letters, so they never clash with a variable called `t`)
export const T = t
export const Tr = tr
