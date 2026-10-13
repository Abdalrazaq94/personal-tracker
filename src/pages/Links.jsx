import { useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import { fetchPreview, hostOf, normalizeUrl } from '../lib/linkPreview'
import { Collections, Sheet, useRemembered } from '../components/Collections'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader } from '../components/ui'

export default function Links() {
  const sections = useRows('link_sections', { ascending: true })
  const links = useRows('links')
  const [selectedId, setSelectedId] = useRemembered('links.section', sections.rows)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')

  const counts = useMemo(() => {
    const c = {}
    links.rows.forEach((l) => (c[l.section_id] = (c[l.section_id] || 0) + 1))
    return c
  }, [links.rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s) return links.rows.filter((l) => `${l.title} ${l.url} ${l.site}`.toLowerCase().includes(s))
    return links.rows.filter((l) => l.section_id === selectedId)
  }, [links.rows, selectedId, q])

  const add = async (e) => {
    e.preventDefault()
    const clean = normalizeUrl(url)
    if (!clean) return links.setError('That doesn’t look like a link.')
    setBusy(true)
    const p = await fetchPreview(clean)
    const ok = await links.insert({ section_id: selectedId, url: p.url, title: p.title, image: p.image, site: p.site })
    setBusy(false)
    if (ok) setUrl('')
  }

  const error = sections.error || links.error
  const clearError = () => {
    sections.setError(null)
    links.setError(null)
  }

  return (
    <div className="page">
      <PageHeader title="Saved links" subtitle={`${links.rows.length} links in ${sections.rows.length} sections`} />
      <ErrorBar error={error} onClose={clearError} />

      {sections.rows.length > 0 && (
        <input type="search" className="search" placeholder="Search all links…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {!q && (
        <Collections
          noun="section"
          placeholder="e.g. YouTube videos"
          items={sections.rows}
          counts={counts}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={async (name) => {
            const s = await sections.insert({ name })
            if (s) setSelectedId(s.id)
          }}
          onRename={(id, name) => sections.update(id, { name })}
          onDelete={(id) => {
            sections.remove(id)
            links.setRows((r) => r.filter((l) => l.section_id !== id))
          }}
        />
      )}

      {sections.loading || links.loading ? (
        <Loading />
      ) : sections.rows.length === 0 ? (
        <Empty>Create your first section, for example “YouTube videos” or “TikTok”.</Empty>
      ) : (
        <>
          {!q && (
            <form className="card form" onSubmit={add}>
              <label className="field">
                <span>Add a link</span>
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a video or page link"
                  required
                />
              </label>
              <div className="form-foot form-foot--end">
                <button className="btn" disabled={busy}>
                  {busy ? 'Getting preview…' : 'Save link'}
                </button>
              </div>
            </form>
          )}

          {shown.length === 0 ? (
            <Empty>{q ? 'No links match.' : 'No links in this section yet.'}</Empty>
          ) : (
            <div className="link-grid">
              {shown.map((l) => (
                <LinkCard key={l.id} link={l} onEdit={() => setEditing(l)} onDelete={() => links.remove(l.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <EditLink
          link={editing}
          sections={sections.rows}
          onClose={() => setEditing(null)}
          onSave={async (vals) => {
            await links.update(editing.id, vals)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function LinkCard({ link, onEdit, onDelete }) {
  const [broken, setBroken] = useState(false)
  const showImg = link.image && !broken
  return (
    <article className="link-card">
      <a href={link.url} target="_blank" rel="noreferrer noopener" className="link-card__media">
        {showImg ? (
          <img src={link.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        ) : (
          <span className="link-card__placeholder">{link.site || hostOf(link.url)}</span>
        )}
        {/youtube|tiktok|vimeo/i.test(link.site) && <span className="play" aria-hidden>▶</span>}
      </a>
      <div className="link-card__body">
        <a href={link.url} target="_blank" rel="noreferrer noopener" className="link-card__title" dir="auto">
          {link.title || link.url}
        </a>
        <div className="link-card__foot">
          <span className="muted small">{link.site || hostOf(link.url)}</span>
          <div className="row-actions">
            <button type="button" className="icon-btn" aria-label="Edit link" onClick={onEdit}>
              ✎
            </button>
            <DeleteButton label="Delete link" onClick={onDelete} />
          </div>
        </div>
      </div>
    </article>
  )
}

function EditLink({ link, sections, onSave, onClose }) {
  const [url, setUrl] = useState(link.url)
  const [title, setTitle] = useState(link.title)
  const [sectionId, setSectionId] = useState(link.section_id)
  const [image, setImage] = useState(link.image)
  const [site, setSite] = useState(link.site)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setBusy(true)
    const p = await fetchPreview(url)
    setBusy(false)
    if (p.title) setTitle(p.title)
    setImage(p.image)
    setSite(p.site)
  }

  return (
    <Sheet title="Edit link" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          const clean = normalizeUrl(url)
          if (clean) onSave({ url: clean, title: title.trim(), section_id: sectionId, image, site })
        }}
      >
        <label className="field">
          <span>Link</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </label>
        <label className="field">
          <span>Title</span>
          <input dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </label>
        <label className="field">
          <span>Section</span>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-foot">
          <button type="button" className="btn btn--ghost btn--sm" onClick={refresh} disabled={busy}>
            {busy ? 'Loading…' : 'Refresh preview'}
          </button>
          <button className="btn">Save</button>
        </div>
      </form>
    </Sheet>
  )
}
