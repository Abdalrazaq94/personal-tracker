import { useEffect, useState } from 'react'

/**
 * Light / dark mode. Until you choose, it follows your phone's setting; after you tap the switch it remembers your choice (on this device).
 * The page gets <html data-theme="light|dark">; styles.css does the rest.
 */
const KEY = 'tracker-theme'
const listeners = new Set()
const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null

export function themeChoice() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : 'system'
  } catch {
    return 'system'
  }
}
export const currentTheme = () => {
  const c = themeChoice()
  return c === 'system' ? (mq?.matches ? 'dark' : 'light') : c
}

export function applyTheme() {
  const t = currentTheme()
  document.documentElement.dataset.theme = t
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
  }
  meta.content = t === 'dark' ? '#0e0e10' : '#ffffff'
  listeners.forEach((f) => f(t))
}

export function setTheme(t) {
  const html = document.documentElement
  html.classList.add('theme-anim') // fade the colours for a moment
  setTimeout(() => html.classList.remove('theme-anim'), 400)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* still switches for now */
  }
  applyTheme()
}
export const toggleTheme = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark')

mq?.addEventListener?.('change', () => themeChoice() === 'system' && applyTheme())

/** Re-renders when the theme changes. Returns 'light' or 'dark'. */
export function useTheme() {
  const [t, setT] = useState(currentTheme)
  useEffect(() => {
    listeners.add(setT)
    return () => listeners.delete(setT)
  }, [])
  return t
}

/** Chart colours that read well on each background. */
export const chartColors = (t) =>
  t === 'dark' ? { green: '#4fa960', blue: '#6a96d4', ring: '#0e0e10' } : { green: '#2f7a3f', blue: '#2f5d93', ring: '#ffffff' }
