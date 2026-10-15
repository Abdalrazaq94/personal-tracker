import { useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import { Collections, Sheet, useRemembered } from '../components/Collections'
import { Empty, ErrorBar, Loading, PageHeader } from '../components/ui'
import { T, Tr } from '../lib/i18n'

export default function Notes() {
  const books = useRows('notebooks', { ascending: true })
  const notes = useRows('notes', { order: 'updated_at' })
  const [selectedId, setSelectedId] = useRemembered('notes.book', books.rows)
  const [open, setOpen] = useState(null) // note object, or 'new'
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const c = {}
    notes.rows.forEach((n) => (c[n.notebook_id] = (c[n.notebook_id] || 0) + 1))
    return c
  }, [notes.rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s
      ? notes.rows.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(s))
      : notes.rows.filter((n) => n.notebook_id === selectedId)
    return [...list].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }, [notes.rows, selectedId, q])

  const save = async ({ title, body }) => {
    const now = new Date().toISOString()
    if (open === 'new') await notes.insert({ notebook_id: selectedId, title, body })
    else await notes.update(open.id, { title, body, updated_at: now })
    setOpen(null)
  }

  const error = books.error || notes.error

  return (
    <div className="page">
      <PageHeader
        title={T("Notes")}
        subtitle={`${notes.rows.length} notes`}
        right={
          books.rows.length > 0 && (
            <button className="btn btn--sm" onClick={() => setOpen('new')}>
              + New note
            </button>
          )
        }
      />
      <ErrorBar
        error={error}
        onClose={() => {
          books.setError(null)
          notes.setError(null)
        }}
      />

      {books.rows.length > 0 && (
        <input type="search" className="search" placeholder={T("Search all notes…")} value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {!q && (
        <Collections
          noun="notebook"
          placeholder={T("e.g. Daily notes")}
          items={books.rows}
          counts={counts}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={async (name) => {
            const b = await books.insert({ name })
            if (b) setSelectedId(b.id)
          }}
          onRename={(id, name) => books.update(id, { name })}
          onDelete={(id) => {
            books.remove(id)
            notes.setRows((r) => r.filter((n) => n.notebook_id !== id))
          }}
        />
      )}

      {books.loading || notes.loading ? (
        <Loading />
      ) : books.rows.length === 0 ? (
        <Empty>{T("Create your first notebook, for example “Daily notes”.")}</Empty>
      ) : shown.length === 0 ? (
        <Empty>
          {q ? (
            T("No notes match.")
          ) : (
            <>{Tr(
                "No notes here yet. {0}",
                <button className="link" onClick={() => setOpen('new')}>{T("Write one")}</button>
              )}</>
          )}
        </Empty>
      ) : (
        <div className="note-grid">
          {shown.map((n) => (
            <button key={n.id} type="button" className="note-card" onClick={() => setOpen(n)}>
              {n.title && (
                <h3 dir="auto" className="note-card__title">
                  {n.title}
                </h3>
              )}
              {n.body && (
                <p dir="auto" className="note-card__body">
                  {n.body}
                </p>
              )}
              <span className="note-card__date">
                {new Date(n.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <NoteEditor
          note={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onSave={save}
          onDelete={
            open !== 'new'
              ? () => {
                  notes.remove(open.id)
                  setOpen(null)
                }
              : null
          }
        />
      )}
    </div>
  );
}

function NoteEditor({ note, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(note?.title || '')
  const [body, setBody] = useState(note?.body || '')
  return (
    <Sheet title={note ? T("Edit note") : T("New note")} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim() || body.trim()) onSave({ title: title.trim(), body: body.trim() })
        }}
      >
        <input dir="auto" className="note-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={T("Title")} autoFocus={!note} />
        <textarea dir="auto" value={body} onChange={(e) => setBody(e.target.value)} placeholder={T("Write your note…")} rows={10} />
        <div className="form-foot">
          {onDelete ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => window.confirm('Delete this note?') && onDelete()}
            >{T("Delete")}</button>
          ) : (
            <span />
          )}
          <button className="btn">{T("Save")}</button>
        </div>
      </form>
    </Sheet>
  );
}
