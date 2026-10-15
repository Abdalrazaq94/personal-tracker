/** "Install app" (add Tracker to the Home Screen). Chrome hands us a prompt we can show when the user taps our button. */

let deferred = null
const listeners = new Set()
const tell = () => listeners.forEach((f) => f())

export function watchInstall() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own button instead of Chrome's banner
    deferred = e
    tell()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    tell()
  })
}

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: minimal-ui)').matches || navigator.standalone === true

export const canPrompt = () => !!deferred
export const onInstallChange = (f) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** Shows Chrome's install box. Returns 'accepted', 'dismissed' or 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable'
  const e = deferred
  deferred = null
  tell()
  e.prompt()
  const { outcome } = await e.userChoice
  return outcome
}
