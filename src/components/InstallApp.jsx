import { useEffect, useState } from 'react'
import { canPrompt, isInstalled, onInstallChange, promptInstall } from '../lib/install'
import { T, Tr } from '../lib/i18n'

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
      <button type="button" className={`btn ${compact ? 'btn--sm' : ''}`} onClick={install}>{T("📲 Install app")}</button>
      {help && (
        <div className="install__help small">
          <p>{steps}</p>
          {/Android/.test(navigator.userAgent) && <p className="muted">{T(
            "If you only see “Add to Home screen” and not “Install app”, wait a minute and reload: after you remove the app, Chrome needs a moment before it offers it again."
          )}</p>}
        </div>
      )}
    </div>
  );
}

/** Where "install" lives in each browser. */
function installSteps(ua) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const android = /Android/.test(ua)
  const b = (t) => <b>{t}</b>
  if (ios) {
    if (/CriOS|EdgiOS|FxiOS|OPiOS/.test(ua))
      return (
        <>{Tr(
            "Tap {0} (the square with an arrow, in the address bar or the menu) → {1} → {2}. If you don’t see it, open this page in {3} and do the same there. Reminders on iPhone only work from the Home Screen app.",
            b('Share'),
            b('Add to Home Screen'),
            b('Add'),
            b('Safari')
          )}</>
      );
    return (
      <>{Tr(
          "In Safari, tap {0} (the square with an arrow) → {1} → {2}. Then open Tracker from your Home Screen; reminders on iPhone only work from there.",
          b('Share'),
          b('Add to Home Screen'),
          b('Add')
        )}</>
    );
  }
  if (/SamsungBrowser/.test(ua))
    return (
      <>{Tr(
          "Tap the menu {0} → {1} → {2}, or tap the {3} in the address bar.",
          b('≡'),
          b('Add page to'),
          b('Home screen'),
          b('install icon')
        )}</>
    );
  if (/Firefox|FxiOS/.test(ua))
    return android ? (
      <>{Tr(
          "Tap the menu {0} → {1} (or {2}) → {3}.",
          b('⋮'),
          b('Add app to Home screen'),
          b('Install'),
          b('Add')
        )}</>
    ) : (
      <>{Tr(
          "Firefox on computers can’t install apps. Use it in this tab, or open the page in {0} or {1} to install it.",
          b('Chrome'),
          b('Edge')
        )}</>
    );
  if (/OPR|Opera/.test(ua))
    return (<>{Tr("Tap the menu {0} → {1} → {2}.", b('⋮'), b('Add to…'), b('Home screen'))}</>);
  if (/Edg(A)?\//.test(ua))
    return android ? (
      <>{Tr(
          "Tap the menu {0} at the bottom → {1} → {2}.",
          b('…'),
          b('Add to phone'),
          b('Install')
        )}</>
    ) : (
      <>{Tr(
          "Click the {0} icon in the address bar, or menu {1} → {2} → {3}.",
          b('App available'),
          b('…'),
          b('Apps'),
          b('Install this site as an app')
        )}</>
    );
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua))
    return (<>{Tr("In Safari, choose {0} → {1}.", b('File'), b('Add to Dock'))}</>);
  return android ? (
    <>{Tr(
        "In Chrome, tap the menu {0} (top right) → {1} or {2} → {3}.",
        b('⋮'),
        b('Install app'),
        b('Add to Home screen'),
        b('Install')
      )}</>
  ) : (
    <>{Tr(
        "Click the {0} at the right end of the address bar, or menu {1} → {2} → {3}.",
        b('install icon'),
        b('⋮'),
        b('Cast, save and share'),
        b('Install page as app')
      )}</>
  );
}
