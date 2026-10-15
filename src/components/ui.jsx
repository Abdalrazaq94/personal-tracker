import BlurText from './bits/BlurText'
import { T } from '../lib/i18n'
export function PageHeader({ title, subtitle, right }) {
  return (
    <header className="page-header">
      <div>
        {typeof title === 'string' ? <BlurText as="h1" text={title} /> : <h1>{title}</h1>}
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Segmented({ value, onChange, options, small }) {
  return (
    <div className={`segmented ${small ? 'segmented--small' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function ErrorBar({ error, onClose }) {
  if (!error) return null
  return (
    <div className="error-bar" role="alert">
      <span>{error}</span>
      {onClose && (
        <button type="button" className="link" onClick={onClose}>{T("Dismiss")}</button>
      )}
    </div>
  );
}

export function Loading() {
  return <div className="empty muted loading-text">{T("Loading…")}</div>;
}

export function DeleteButton({ onClick, label = T('Delete') }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      title={label}
      onClick={() => {
        if (window.confirm(`${label}?`)) onClick()
      }}
    >
      ×
    </button>
  )
}
