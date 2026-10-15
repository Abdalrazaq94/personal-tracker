import { useEffect, useState } from 'react'
import { canPrompt, isInstalled, onInstallChange, promptInstall } from '../lib/install'

/** An "Install app" button. If the browser can't show its install box, it explains how to do it by hand. */
export default function InstallApp({ compact = false }) {
  const [, redraw] = useState(0)
  const [help, setHelp] = useState(false)
  useEffect(() => onInstallChange(() => redraw((n) => n + 1)), [])

  if (isInstalled()) return null

  const steps = installSteps(navigator.userAgent)

  const install = async () => {
    if (canPrompt()) {
      const r = await promptInstall()
      if (r !== 'unavailable') return
    }
    setHelp(true)
  }

  return (
    <div className={`install ${compact ? 'install--compact' : ''}`}>
      <button type="button" className={`btn ${compact ? 'btn--sm' : ''}`} onClick={install}>
        📲 Install app
      </button>
      {help && (
        <div className="install__help small">
          <p>{steps}</p>
          {/Android/.test(navigator.userAgent) && <p className="muted">
            If you only see “Add to Home screen” and not “Install app”, wait a minute and reload: after you remove the app, Chrome needs a moment
            before it offers it again.
          </p>}
        </div>
      )}
    </div>
  )
}

/** Where "install" lives in each browser. */
function installSteps(ua) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const android = /Android/.test(ua)
  const b = (t) => <b>{t}</b>
  if (ios) {
    if (/CriOS|EdgiOS|FxiOS|OPiOS/.test(ua))
      return (
        <>
          Tap {b('Share')} (the square with an arrow, in the address bar or the menu) → {b('Add to Home Screen')} → {b('Add')}. If you don’t see it,
          open this page in {b('Safari')} and do the same there. Reminders on iPhone only work from the Home Screen app.
        </>
      )
    return (
      <>
        In Safari, tap {b('Share')} (the square with an arrow) → {b('Add to Home Screen')} → {b('Add')}. Then open Tracker from your Home Screen;
        reminders on iPhone only work from there.
      </>
    )
  }
  if (/SamsungBrowser/.test(ua))
    return (
      <>
        Tap the menu {b('≡')} → {b('Add page to')} → {b('Home screen')}, or tap the {b('install icon')} in the address bar.
      </>
    )
  if (/Firefox|FxiOS/.test(ua))
    return android ? (
      <>
        Tap the menu {b('⋮')} → {b('Add app to Home screen')} (or {b('Install')}) → {b('Add')}.
      </>
    ) : (
      <>
        Firefox on computers can’t install apps. Use it in this tab, or open the page in {b('Chrome')} or {b('Edge')} to install it.
      </>
    )
  if (/OPR|Opera/.test(ua))
    return (
      <>
        Tap the menu {b('⋮')} → {b('Add to…')} → {b('Home screen')}.
      </>
    )
  if (/Edg(A)?\//.test(ua))
    return android ? (
      <>
        Tap the menu {b('…')} at the bottom → {b('Add to phone')} → {b('Install')}.
      </>
    ) : (
      <>
        Click the {b('App available')} icon in the address bar, or menu {b('…')} → {b('Apps')} → {b('Install this site as an app')}.
      </>
    )
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua))
    return (
      <>
        In Safari, choose {b('File')} → {b('Add to Dock')}.
      </>
    )
  return android ? (
    <>
      In Chrome, tap the menu {b('⋮')} (top right) → {b('Install app')} or {b('Add to Home screen')} → {b('Install')}.
    </>
  ) : (
    <>
      Click the {b('install icon')} at the right end of the address bar, or menu {b('⋮')} → {b('Cast, save and share')} → {b('Install page as app')}.
    </>
  )
}
