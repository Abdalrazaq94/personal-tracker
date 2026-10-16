import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FEATURES, HOME_SECTIONS, STARTER, faithKey, featureView, normalize, saveLayout, useLayout } from '../lib/layout'
import { FAITHS } from '../lib/faith'
import { T } from '../lib/i18n'
import { PageHeader } from '../components/ui'

/** Customise Home: switch features and Home cards on or off, and move them up or down. Saves straight away. */
export default function Customize() {
  const layout = useLayout()

  const move = (list, i, by) => {
    const next = [...list]
    const j = i + by
    if (j < 0 || j >= next.length) return list
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  }
  const setFeatures = (features) => saveLayout({ ...layout, features })
  const setSections = (sections) => saveLayout({ ...layout, sections })
  const featureOn = (key) => layout.features.find((f) => f.key === key)?.on !== false
  const onCount = layout.features.filter((f) => f.on).length

  return (
    <div className="page customize">
      <PageHeader
        title={T('Customise Home')}
        subtitle={T('Choose what you track and what your Home shows. Your data is kept even when a feature is hidden.')}
      />

      <section className="card" id="faith">
        <h2 className="cust-title">{T('Faith')}</h2>
        <p className="muted small">{T('Choose your faith to track its daily prayers and practices. Changing it never deletes anything.')}</p>
        <FaithChooser
          value={layout.faith ? layout.faith : faithKey(layout)}
          onPick={(faith) =>
            saveLayout({ ...layout, faith, features: layout.features.map((f) => (f.key === 'commit' ? { ...f, on: faith !== 'none' } : f)) })
          }
        />
      </section>

      <section className="card">
        <h2 className="cust-title">{T('Features')}</h2>
        <p className="muted small">{T('Shown as buttons on Home and in the menu.')}</p>
        <ul className="cust-list">
          {layout.features.map((f, i) => {
            const d = featureView(FEATURES.find((x) => x.key === f.key), layout)
            return (
              <li key={f.key} className={f.on ? '' : 'is-off'}>
                <span className="cust-icon" aria-hidden>
                  {d.icon}
                </span>
                <span className="cust-text">
                  <strong>{T(d.label)}</strong>
                  <span className="muted small">{T(d.hint)}</span>
                </span>
                <span className="cust-move">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={T('Move {0} up', [T(d.label)])}
                    disabled={i === 0}
                    onClick={() => setFeatures(move(layout.features, i, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={T('Move {0} down', [T(d.label)])}
                    disabled={i === layout.features.length - 1}
                    onClick={() => setFeatures(move(layout.features, i, 1))}
                  >
                    ↓
                  </button>
                </span>
                <input
                  type="checkbox"
                  className="rem-switch"
                  aria-label={T('Show {0}', [T(d.label)])}
                  checked={f.on}
                  disabled={f.on && onCount <= 1}
                  onChange={(e) => setFeatures(layout.features.map((x) => (x.key === f.key ? { ...x, on: e.target.checked } : x)))}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="cust-title">{T('Cards on Home')}</h2>
        <p className="muted small">{T('Shown under the buttons, in this order.')}</p>
        <ul className="cust-list">
          {layout.sections.map((s, i) => {
            const d0 = HOME_SECTIONS.find((x) => x.key === s.key)
            const d =
              d0.key === 'prayers' && faithKey(layout) !== 'islam'
                ? { ...d0, label: featureView(FEATURES.find((x) => x.key === 'commit'), layout).label, hint: 'Today’s practices' }
                : d0
            const blocked = d.needs && !featureOn(d.needs)
            return (
              <li key={s.key} className={s.on && !blocked ? '' : 'is-off'}>
                <span className="cust-text">
                  <strong>{T(d.label)}</strong>
                  <span className="muted small">
                    {blocked ? T('Turn on {0} above to show this', [T(featureView(FEATURES.find((x) => x.key === d.needs), layout).label)]) : T(d.hint)}
                  </span>
                </span>
                <span className="cust-move">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={T('Move {0} up', [T(d.label)])}
                    disabled={i === 0}
                    onClick={() => setSections(move(layout.sections, i, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={T('Move {0} down', [T(d.label)])}
                    disabled={i === layout.sections.length - 1}
                    onClick={() => setSections(move(layout.sections, i, 1))}
                  >
                    ↓
                  </button>
                </span>
                <input
                  type="checkbox"
                  className="rem-switch"
                  aria-label={T('Show {0}', [T(d.label)])}
                  checked={s.on && !blocked}
                  disabled={blocked}
                  onChange={(e) => setSections(layout.sections.map((x) => (x.key === s.key ? { ...x, on: e.target.checked } : x)))}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <div className="cust-foot">
        <button type="button" className="btn btn--ghost" onClick={() => saveLayout(normalize(null))}>
          {T('Show everything again')}
        </button>
        <Link to="/" className="btn">
          {T('Done')}
        </Link>
      </div>
    </div>
  )
}

/** First visit: "What do you want to track?" — tap the features you want. */
export function WelcomePicker({ onDone }) {
  const layout = useLayout()
  const start = new Set(layout.chosen ? layout.features.filter((f) => f.on).map((f) => f.key) : STARTER)
  return <Picker initial={start} onDone={onDone} />
}

/** Islam · Christianity · Judaism · Hinduism · My own practices · No thanks */
export function FaithChooser({ value, onPick }) {
  return (
    <div className="welcome-grid faith-grid">
      {[...FAITHS, { key: 'none', icon: '—', name: 'No thanks' }].map((f) => (
        <button key={f.key} type="button" className={`welcome-item ${value === f.key ? 'is-on' : ''}`} aria-pressed={value === f.key} onClick={() => onPick(f.key)}>
          <span aria-hidden className="welcome-item__icon">
            {f.icon}
          </span>
          <strong>{T(f.name)}</strong>
          <span className="welcome-item__tick" aria-hidden>
            {value === f.key ? '✓' : ''}
          </span>
        </button>
      ))}
    </div>
  )
}

function Picker({ initial, onDone }) {
  const [picked, setPicked] = useState(initial)
  const [step, setStep] = useState('features')
  const [faith, setFaith] = useState(null)
  const toggle = (k) =>
    setPicked((p) => {
      const n = new Set(p)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const finish = (chosenFaith) => {
    const base = normalize(null)
    saveLayout({
      ...base,
      faith: chosenFaith,
      features: base.features.map((f) => ({ ...f, on: f.key === 'commit' ? chosenFaith !== 'none' : picked.has(f.key) })),
    })
    onDone?.()
  }
  if (step === 'faith')
    return (
      <section className="card welcome-pick" aria-labelledby="welcome-faith">
        <h2 id="welcome-faith">{T('Would you like to track your faith?')}</h2>
        <p className="muted small">{T('Daily prayers and practices, with reminders and streaks. You can change this any time.')}</p>
        <FaithChooser value={faith} onPick={setFaith} />
        <div className="welcome-acts">
          <button type="button" className="btn btn--ghost" onClick={() => setStep('features')}>
            {T('Back')}
          </button>
          <button type="button" className="btn welcome-go" disabled={!faith} onClick={() => finish(faith)}>
            {T('Start')}
          </button>
        </div>
      </section>
    )
  return (
    <section className="card welcome-pick" aria-labelledby="welcome-title">
      <h2 id="welcome-title">{T('Welcome! What do you want to track?')}</h2>
      <p className="muted small">{T('Tap to choose. You can change this any time in Customise Home.')}</p>
      <div className="welcome-grid">
        {FEATURES.filter((f) => f.key !== 'commit').map((f) => (
          <button
            key={f.key}
            type="button"
            className={`welcome-item ${picked.has(f.key) ? 'is-on' : ''}`}
            aria-pressed={picked.has(f.key)}
            onClick={() => toggle(f.key)}
          >
            <span aria-hidden className="welcome-item__icon">
              {f.icon}
            </span>
            <strong>{T(f.label)}</strong>
            <span className="welcome-item__hint">{T(f.hint)}</span>
            <span className="welcome-item__tick" aria-hidden>
              {picked.has(f.key) ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="btn welcome-go" disabled={picked.size === 0} onClick={() => setStep('faith')}>
        {T('Continue')}
      </button>
    </section>
  )
}
