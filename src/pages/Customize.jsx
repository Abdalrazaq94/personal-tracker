import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FEATURES, HOME_SECTIONS, STARTER, faithKey, featureView, getLayout, normalize, saveLayout, saveLook, useLayout } from '../lib/layout'
import { FAITHS } from '../lib/faith'
import { LANG, setLang, T } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { setTheme, themeChoice, useTheme } from '../lib/theme'
import { ACCENTS, ACCESSORIES, FURS } from '../lib/look'
import { PageHeader } from '../components/ui'
import GlareHover from '../components/reactbits/GlareHover'
import Cat from '../components/Cat'

/** Settings: colours, light / dark, language, the cat, your faith, and which features and Home cards you see. Saves straight away. */
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
        title={T('Settings')}
        subtitle={T('Make the app yours: colours, your cat, and what you track. Your data is kept even when a feature is hidden.')}
      />

      <Appearance look={layout.look} />
      <CatStudio cat={layout.look.cat} />

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
        <button type="button" className="btn btn--ghost" onClick={() => saveLayout({ ...normalize(null), look: layout.look, faith: layout.faith })}>
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
      look: getLayout().look,
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
      <p className="muted small">{T('Tap to choose. You can change this any time in Settings.')}</p>
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

/** Colour themes (React Bits GlareHover cards, each one a live preview), light / dark and language. */
function Appearance({ look }) {
  const mode = useTheme()
  const [choice, setChoice] = useState(themeChoice)
  const pickMode = (m) => {
    setTheme(m)
    setChoice(m)
  }
  return (
    <section className="card" id="look">
      <h2 className="cust-title">{T('Colours')}</h2>
      <p className="muted small">{T('Pick a theme. Each one has a light and a dark look.')}</p>
      <div className="theme-grid" role="radiogroup" aria-label={T('Colours')}>
        {ACCENTS.map((a) => {
          const on = look.accent === a.key
          const classic = a.key === 'classic'
          const dark = mode === 'dark'
          return (
            <GlareHover
              key={a.key}
              className="theme-glare"
              background="var(--bg)"
              borderColor="var(--line)"
              borderRadius="20px"
              glareColor="#ffffff"
              glareOpacity={0.45}
              glareAngle={-35}
              glareSize={60}
              variant="sheen"
              blendMode="screen"
              transitionDuration={700}
            >
              <button
                type="button"
                role="radio"
                aria-checked={on}
                className={`theme-card ${on ? 'is-on' : ''}`}
                onClick={() => saveLook({ accent: a.key })}
              >
                <span
                  className="theme-card__preview"
                  data-accent={a.key}
                  {...(classic ? {} : { 'data-soft': '' })}
                  style={{ background: classic ? (dark ? '#0e0e10' : '#f5f5f5') : 'var(--page)' }}
                  aria-hidden
                >
                  {a.sw.map((c, i) => (
                    <i key={i} style={{ background: classic ? (i % 2 ? (dark ? '#2a2a2f' : '#e7e7e7') : dark ? '#18181c' : '#ffffff') : `color-mix(in srgb, ${c} var(--sw-mix), var(--t-base))` }} />
                  ))}
                  <b style={{ background: classic ? (dark ? '#f2f2f3' : '#0a0a0a') : 'var(--primary)' }} />
                </span>
                <span className="theme-card__name">
                  {T(a.name)}
                  {on && (
                    <span className="theme-card__tick" aria-hidden>
                      ✓
                    </span>
                  )}
                </span>
              </button>
            </GlareHover>
          )
        })}
      </div>

      <div className="set-row">
        <span>
          <strong>{T('Light or dark')}</strong>
          <span className="muted small">{T('Auto follows your phone.')}</span>
        </span>
        <div className="segmented" role="group" aria-label={T('Light or dark')}>
          {[
            ['light', T('☀️ Light')],
            ['dark', T('🌙 Dark')],
            ['system', T('Auto')],
          ].map(([k, label]) => (
            <button key={k} type="button" className={choice === k ? 'is-active' : ''} aria-pressed={choice === k} onClick={() => pickMode(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <span>
          <strong>{T('Language')}</strong>
        </span>
        <div className="segmented" role="group" aria-label={T('Language')}>
          <button type="button" lang="en" className={LANG === 'en' ? 'is-active' : ''} aria-pressed={LANG === 'en'} onClick={() => LANG !== 'en' && setLang('en', supabase)}>
            English
          </button>
          <button type="button" lang="ar" className={LANG === 'ar' ? 'is-active' : ''} aria-pressed={LANG === 'ar'} onClick={() => LANG !== 'ar' && setLang('ar', supabase)}>
            العربية
          </button>
        </div>
      </div>
    </section>
  )
}

/** Design your own cat: name, fur and what it wears. */
function CatStudio({ cat }) {
  const [name, setName] = useState(cat.name)
  const save = (c) => saveLook({ cat: { ...cat, ...c } })
  return (
    <section className="card" id="cat">
      <div className="set-row">
        <span>
          <h2 className="cust-title">{T('Your cat')}</h2>
          <span className="muted small">{T('A little friend on Home who cheers you on. Tap it!')}</span>
        </span>
        <input type="checkbox" className="rem-switch" aria-label={T('Show the cat on Home')} checked={cat.on} onChange={(e) => save({ on: e.target.checked })} />
      </div>
      {cat.on && (
        <div className="cat-studio">
          <div className="set-stage">
            <Cat look={cat} wins={3} awake />
          </div>
          <div className="cat-studio__opts">
            <label className="field">
              <span>{T('Name')}</span>
              <input
                dir="auto"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name.trim() !== cat.name && save({ name: name.trim() })}
              />
            </label>
            <div className="field">
              <span>{T('Fur')}</span>
              <div className="swatches" role="radiogroup" aria-label={T('Fur')}>
                {FURS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={cat.fur === f.key}
                    aria-label={T(f.name)}
                    title={T(f.name)}
                    className={`swatch swatch--${f.key} ${cat.fur === f.key ? 'is-on' : ''}`}
                    style={{ background: `radial-gradient(circle at 35% 30%, ${f.l}, ${f.c} 55%, ${f.d})` }}
                    onClick={() => save({ fur: f.key })}
                  />
                ))}
              </div>
            </div>
            <div className="field">
              <span>{T('Wears')}</span>
              <div className="chips-row">
                {ACCESSORIES.map((a) => (
                  <button key={a.key} type="button" className={`chip chip--solid ${cat.acc === a.key ? 'is-active' : ''}`} aria-pressed={cat.acc === a.key} onClick={() => save({ acc: a.key })}>
                    {T(a.name)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
