import { useEffect, useState } from 'react'
import { useBackToClose } from '../lib/useBack'
import { T, Tr } from '../lib/i18n'

/** Bottom sheet on phones, centred dialog on bigger screens. */
export function Sheet({ title, onClose, children }) {
  useBackToClose(true, onClose) // phone back button closes the sheet
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label={T("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Small form inside a sheet that asks for one name. */
export function NameSheet({ title, label, initial = '', placeholder, submitLabel = 'Save', onSubmit, onClose }) {
  const [name, setName] = useState(initial)
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSubmit(name.trim())
        }}
      >
        <label className="field">
          <span>{label}</span>
          <input dir="auto" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} required />
        </label>
        <button className="btn btn--block">{submitLabel}</button>
      </form>
    </Sheet>
  )
}

/**
 * Row of chips for user-made groups (link sections, notebooks):
 * pick one, add a new one, and rename / delete the selected one.
 */
export function Collections({ items, selectedId, onSelect, onCreate, onRename, onDelete, noun, placeholder, counts = {} }) {
  const [sheet, setSheet] = useState(null) // 'new' | 'rename'
  const selected = items.find((i) => i.id === selectedId)

  return (
    <>
      <div className="scroll-x">
        <div className="collections">
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`chip ${i.id === selectedId ? 'is-active chip--solid' : ''}`}
              onClick={() => onSelect(i.id)}
              dir="auto"
            >
              {i.name}
              {counts[i.id] !== undefined && <span className="count">{counts[i.id]}</span>}
            </button>
          ))}
          <button type="button" className="chip chip--dashed" onClick={() => setSheet('new')}>{Tr("+ New {0}", noun)}</button>
        </div>
      </div>

      {selected && (
        <div className="collection-head">
          <h2 dir="auto">{selected.name}</h2>
          <div className="collection-head__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSheet('rename')}>{T("Rename")}</button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (window.confirm(T("Delete the {0} \"{1}\" and everything in it?", [noun, selected.name]))) onDelete(selected.id)
              }}
            >{T("Delete")}</button>
          </div>
        </div>
      )}

      {sheet === 'new' && (
        <NameSheet
          title={T("New {0}", [noun])}
          label={T('{0} name', [noun])}
          placeholder={placeholder}
          submitLabel={T('Create {0}', [noun])}
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            await onCreate(name)
            setSheet(null)
          }}
        />
      )}
      {sheet === 'rename' && selected && (
        <NameSheet
          title={T("Rename {0}", [noun])}
          label={T('{0} name', [noun])}
          initial={selected.name}
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            await onRename(selected.id, name)
            setSheet(null)
          }}
        />
      )}
    </>
  );
}

/** Remembers which section/notebook was open last (per browser). */
export function useRemembered(key, items) {
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  })
  const valid = items.some((i) => i.id === id) ? id : items[0]?.id ?? null
  const set = (v) => {
    setId(v)
    try {
      localStorage.setItem(key, v)
    } catch {}
  }
  return [valid, set]
}
