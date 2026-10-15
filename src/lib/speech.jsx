import { useEffect, useRef, useState } from 'react'
import { T } from './i18n'

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const canListen = Boolean(Recognition)
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Reads English text aloud with the phone's own voice. */
export function speak(text, lang = 'en-GB') {
  if (!canSpeak || !text) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/_{2,}/g, 'blank'))
  u.lang = lang
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}

/**
 * Microphone → text, using the browser's built-in speech recognition
 * (Chrome on Android/desktop, Safari on iPhone). Needs https or localhost.
 */
export function useListen({ lang = 'en-GB', onResult }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const rec = useRef(null)
  const cb = useRef(onResult)
  cb.current = onResult

  useEffect(() => () => rec.current?.abort(), [])

  const start = () => {
    if (!Recognition) {
      setError(T('Voice input isn’t supported in this browser. Try Chrome or Safari.'))
      return
    }
    setError(null)
    setInterim('')
    const r = new Recognition()
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      let finalText = ''
      let temp = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t
        else temp += t
      }
      setInterim(temp)
      if (finalText.trim()) cb.current(finalText.trim())
    }
    r.onerror = (e) => {
      const map = {
        'not-allowed': T('Microphone permission was blocked. Allow it in your browser settings.'),
        'service-not-allowed': T('Microphone permission was blocked. Allow it in your browser settings.'),
        'no-speech': T('I didn’t hear anything. Tap the mic and try again.'),
        'audio-capture': T('No microphone found.'),
        network: T('Voice input needs an internet connection.'),
      }
      if (e.error !== 'aborted') setError(map[e.error] || T('Voice input stopped. Try again.'))
    }
    r.onend = () => {
      setListening(false)
      setInterim('')
    }
    rec.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const stop = () => rec.current?.stop()

  return { listening, interim, error, setError, start, stop, toggle: () => (listening ? stop() : start()) }
}

/** Round mic button. */
export function MicButton({ listen, label = T('Speak') }) {
  return (
    <button
      type="button"
      className={`mic-btn ${listen.listening ? 'is-on' : ''}`}
      onClick={listen.toggle}
      aria-label={listen.listening ? T("Stop listening") : label}
      title={listen.listening ? T("Stop") : label}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );
}

/** Small speaker button that reads text aloud. */
export function SpeakButton({ text, label = T('Listen') }) {
  if (!canSpeak) return null
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={() => speak(text)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      </svg>
    </button>
  )
}
