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
    // keep a copy so it can be read later (and in the browser console)
    console.error('Page crashed:', error, info?.componentStack)
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
