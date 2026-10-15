import { Component } from 'react'

/**
 * If a page crashes, show what happened and a Reload button instead of a blank white screen.
 * It resets by itself when you move to another page.
 */
export default class PageGuard extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack)
    this.setState({ stack: info?.componentStack || '' })
    // a reload always fixes it, so do that once by itself; only show this screen if it happens again straight away
    try {
      const last = Number(sessionStorage.getItem('tracker-auto-reload') || 0)
      if (Date.now() - last > 20000) {
        sessionStorage.setItem('tracker-auto-reload', String(Date.now()))
        sessionStorage.setItem('tracker-last-crash', `${error?.message || error}`)
        window.location.reload()
      }
    } catch {}
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const text = `${error?.name || 'Error'}: ${error?.message || String(error)}`
    return (
      <div className="page">
        <div className="card crash">
          <h2>This page had a problem</h2>
          <p className="muted small">Tap Reload. If it keeps happening, send this message to the developer:</p>
          <code className="crash__msg">{text}</code>
          <details className="crash__more" open>
            <summary className="small">Details for the developer (screenshot this)</summary>
            <pre>{`${(error?.stack || '').split('\n').slice(0, 8).join('\n')}\n—\n${(this.state.stack || '').trim().split('\n').slice(0, 8).join('\n')}`}</pre>
          </details>
          <div className="crash__acts">
            <button className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                const full = `${text}\n${window.location.href}\n${navigator.userAgent}\n${(error?.stack || '').slice(0, 800)}`
                navigator.clipboard?.writeText(full).catch(() => window.prompt('Copy this:', full))
              }}
            >
              Copy message
            </button>
          </div>
        </div>
      </div>
    )
  }
}
