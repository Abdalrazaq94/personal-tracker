import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import PageGuard from './components/PageGuard'
import './styles.css'
import { registerWorker } from './lib/push'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PageGuard resetKey="app">
        <App />
      </PageGuard>
    </HashRouter>
  </React.StrictMode>
)

// background helper for reminders (notifications + their buttons)
registerWorker()
