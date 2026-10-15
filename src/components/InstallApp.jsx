import { useEffect, useState } from 'react'
import { canPrompt, isInstalled, onInstallChange, promptInstall } from '../lib/install'

/** An "Install app" button. If the browser can't show its install box, it explains how to do it by hand. */
export default function InstallApp({ compact = false }) {
  const [, redraw] = useState(0)
  const [help, setHelp] = useState(false)
  useEffect(() => onInstallChange(() => redraw((n) => n + 1)), [])

  if (isInstalled()) return null

  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const samsung = /SamsungBrowser/.test(navigator.userAgent)

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
          {iphone ? (
            <p>
              In Safari, tap <b>Share</b> (the square with an arrow) → <b>Add to Home Screen</b> → <b>Add</b>.
            </p>
          ) : samsung ? (
            <p>
              Tap the menu <b>≡</b> → <b>Add page to</b> → <b>Home screen</b>.
            </p>
          ) : (
            <p>
              In Chrome, tap the menu <b>⋮</b> (top right) → <b>Install app</b> or <b>Add to Home screen</b> → <b>Install</b>.
            </p>
          )}
          <p className="muted">
            If you only see “Add to Home screen” and not “Install app”, wait a minute and reload: after you remove the app, Chrome needs a moment
            before it offers it again.
          </p>
        </div>
      )}
    </div>
  )
}
