import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import PageGuard from './components/PageGuard'
import './styles.css'
import './themes.css'
import { registerWorker } from './lib/push'
import { watchInstall } from './lib/install'
import { applyLang, loadLang } from './lib/i18n'
import { applyTheme } from './lib/theme'

// English or Arabic (right-to-left) before anything is drawn
applyLang()
applyTheme()

// catch Chrome's "install" offer as early as possible, so our Install app button can use it
watchInstall()

// Arabic text first (only for Arabic), then the app — so every label is in the right language from the start
loadLang()
  .catch(() => {})
  .then(() => import('./App.jsx'))
  .then(({ default: App }) =>
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PageGuard resetKey="app">
            <App />
          </PageGuard>
        </HashRouter>
      </React.StrictMode>
    )
  )

// background helper for reminders (notifications + their buttons)
registerWorker()
