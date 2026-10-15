import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addCard, authorizeUrl, getBoard, getBoards, getLists, moveCard } from '../lib/trello'
import { Sheet } from '../components/Collections'
import { Empty, ErrorBar, Loading, PageHeader } from '../components/ui'
import { T, Tr, LOCALE } from '../lib/i18n'

export default function Jobs() {
  const [settings, setSettings] = useState(undefined) // undefined = loading, null = not connected
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    supabase
      .from('user_settings')
      .select('*')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setSettings(data && data.trello_token && data.trello_board_id ? data : null)
      })
  }, [])

  const save = async (vals) => {
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({ ...vals, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return setError(error.message)
    setSettings(data)
    setEditing(false)
  }

  const disconnect = async () => {
    if (!window.confirm(T("Disconnect Trello from this app? Your Trello board is not changed."))) return
    await save({ trello_key: '', trello_token: '', trello_board_id: '' })
    setSettings(null)
  }

  if (settings === undefined) return <div className="page"><Loading /></div>

  return (
    <div className="page">
      {settings && !editing ? (
        <Board settings={settings} onChangeBoard={() => setEditing(true)} onDisconnect={disconnect} />
      ) : (
        <>
          <PageHeader title={T("Jobs applied")} subtitle={T("Connected to your Trello board")} />
          <ErrorBar error={error} onClose={() => setError(null)} />
          <Connect initial={settings} onSave={save} onCancel={settings ? () => setEditing(false) : null} />
        </>
      )}
    </div>
  );
}

/* ------------------------------ connect flow ------------------------------ */

function Connect({ initial, onSave, onCancel }) {
  const [key, setKey] = useState(initial?.trello_key || '')
  const [token, setToken] = useState(initial?.trello_token || '')
  const [boards, setBoards] = useState(null)
  const [boardId, setBoardId] = useState(initial?.trello_board_id || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadBoards = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const b = await getBoards({ key: key.trim(), token: token.trim() })
      setBoards(b)
      if (!b.some((x) => x.id === boardId)) setBoardId((b.find((x) => /job|apply|appl/i.test(x.name)) || b[0])?.id || '')
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? T("Could not reach Trello. Check your internet connection.") : err.message)
    }
    setBusy(false)
  }

  useEffect(() => {
    if (initial?.trello_key && initial?.trello_token) loadBoards()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="card form connect">
      <h2 className="connect__title">{T("Connect Trello")}</h2>
      <ol className="steps">
        <li>{Tr(
            "Open {0}, click {1}, fill in any name, then open {2} and copy the key.",
            <a href="https://trello.com/power-ups/admin" target="_blank" rel="noreferrer">
              trello.com/power-ups/admin
            </a>,
            <b>{T("New")}</b>,
            <b>{T("API key")}</b>
          )}</li>
        <li>{Tr(
            "Paste the key below, then tap {0}, click {1} and copy the token Trello shows you.",
            <b>{T("Get token")}</b>,
            <b>{T("Allow")}</b>
          )}</li>
        <li>{Tr(
            "Paste the token, tap {0} and pick your jobs board.",
            <b>{T("Load boards")}</b>
          )}</li>
      </ol>

      <form className="form" onSubmit={loadBoards}>
        <label className="field">
          <span>{T("API key")}</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck="false" required />
        </label>
        <div className="field">
          <span>{T("Token")}</span>
          <div className="input-row">
            <input value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck="false" required />
            <a
              className={`btn btn--ghost btn--sm ${key.trim() ? '' : 'is-disabled'}`}
              href={key.trim() ? authorizeUrl(key.trim()) : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!key.trim()}
            >{T("Get token")}</a>
          </div>
        </div>
        <div className="form-foot form-foot--end">
          <button className="btn btn--ghost" disabled={busy}>
            {busy ? T("Loading…") : T("Load boards")}
          </button>
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      {boards && (
        <>
          <label className="field">
            <span>{T("Board")}</span>
            <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn--block"
            disabled={!boardId}
            onClick={() => onSave({ trello_key: key.trim(), trello_token: token.trim(), trello_board_id: boardId })}
          >{T("Save & show board")}</button>
        </>
      )}
      {onCancel && (
        <button className="btn btn--ghost btn--block" onClick={onCancel}>{T("Cancel")}</button>
      )}
    </div>
  );
}

/* --------------------------------- board ---------------------------------- */

function Board({ settings, onChangeBoard, onDisconnect }) {
  const auth = useMemo(() => ({ key: settings.trello_key, token: settings.trello_token }), [settings])
  const [board, setBoard] = useState(null)
  const [lists, setLists] = useState(null)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([getBoard(auth, settings.trello_board_id), getLists(auth, settings.trello_board_id)])
      setBoard(b)
      setLists(l)
      setError(null)
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? T("Could not reach Trello.") : e.message)
      setLists((x) => x || [])
    }
  }, [auth, settings.trello_board_id])

  useEffect(() => {
    load()
  }, [load])

  const listName = useMemo(() => Object.fromEntries((lists || []).map((l) => [l.id, l.name])), [lists])
  const cards = useMemo(() => {
    const all = (lists || []).flatMap((l) => l.cards || [])
    const s = q.trim().toLowerCase()
    return all
      .filter((c) => (filter === 'all' || c.idList === filter) && (!s || `${c.name} ${c.desc}`.toLowerCase().includes(s)))
      .sort((a, b) => new Date(b.dateLastActivity) - new Date(a.dateLastActivity))
  }, [lists, filter, q])

  const total = (lists || []).reduce((a, l) => a + (l.cards?.length || 0), 0)

  const move = async (card, idList) => {
    setLists((ls) =>
      ls.map((l) => ({
        ...l,
        cards: l.id === idList ? [{ ...card, idList, dateLastActivity: new Date().toISOString() }, ...l.cards] : l.cards.filter((c) => c.id !== card.id),
      }))
    )
    try {
      await moveCard(auth, card.id, idList)
    } catch (e) {
      setError(e.message)
      load()
    }
  }

  return (
    <>
      <PageHeader
        title={T("Jobs applied")}
        subtitle={board ? T("{0} jobs · {1}", [total, board.name]) : T("Trello")}
        right={
          lists?.length > 0 && (
            <button className="btn btn--sm" onClick={() => setAdding(true)}>
              + Add job
            </button>
          )
        }
      />
      <ErrorBar error={error} onClose={() => setError(null)} />

      {lists === null ? (
        <Loading />
      ) : (
        <>
          {lists.length > 0 && (
            <>
              <div className="job-stats">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`job-stat ${filter === l.id ? 'is-active' : ''}`}
                    onClick={() => setFilter(filter === l.id ? 'all' : l.id)}
                  >
                    <strong>{l.cards.length}</strong>
                    <span dir="auto">{l.name}</span>
                  </button>
                ))}
              </div>
              <input type="search" className="search" placeholder={T("Search jobs…")} value={q} onChange={(e) => setQ(e.target.value)} />
              {filter !== 'all' && (
                <p className="small muted">{Tr(
                    "Showing {0} · {1}",
                    <b>{listName[filter]}</b>,
                    <button className="link" onClick={() => setFilter('all')}>{T("show all")}</button>
                  )}</p>
              )}
            </>
          )}

          {cards.length === 0 ? (
            <Empty>{total ? T("No jobs match.") : T("This board has no cards yet.")}</Empty>
          ) : (
            <ul className="list">
              {cards.map((c) => (
                <li key={c.id} className="item job">
                  <div className="job__top">
                    <a href={c.url} target="_blank" rel="noreferrer" className="job__name" dir="auto">
                      {c.name}
                    </a>
                    <span className="muted small nowrap">
                      {new Date(c.dateLastActivity).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  {c.desc && (
                    <p className="job__desc muted" dir="auto">
                      {c.desc}
                    </p>
                  )}
                  {(c.labels?.length > 0 || c.due) && (
                    <div className="job__labels">
                      {c.labels.map((lb) => (
                        <span key={lb.id} className="tag">
                          {lb.name || lb.color}
                        </span>
                      ))}
                      {c.due && (
                        <span className={`tag ${c.dueComplete ? '' : 'tag--solid'}`}>{Tr(
                            "Due {0}",
                            new Date(c.due).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
                          )}</span>
                      )}
                    </div>
                  )}
                  <label className="job__move">
                    <span className="muted small">{T("List")}</span>
                    <select value={c.idList} onChange={(e) => move(c, e.target.value)}>
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="home-footer">
        {board?.url ? (
          <a href={board.url} target="_blank" rel="noreferrer" className="muted">{T("Open in Trello ↗")}</a>
        ) : (
          <span />
        )}
        <div className="row-actions">
          <button className="btn btn--ghost btn--sm" onClick={onChangeBoard}>{T("Change board")}</button>
          <button className="btn btn--ghost btn--sm" onClick={onDisconnect}>{T("Disconnect")}</button>
        </div>
      </div>

      {adding && (
        <AddJob
          lists={lists}
          onClose={() => setAdding(false)}
          onAdd={async ({ name, desc, idList }) => {
            try {
              const card = await addCard(auth, idList, name, desc)
              setLists((ls) => ls.map((l) => (l.id === idList ? { ...l, cards: [card, ...l.cards] } : l)))
              setAdding(false)
            } catch (e) {
              setError(e.message)
            }
          }}
        />
      )}
    </>
  );
}

function AddJob({ lists, onAdd, onClose }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [idList, setIdList] = useState(lists[0]?.id)
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title={T("Add job")} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setBusy(true)
          await onAdd({ name: name.trim(), desc: desc.trim(), idList })
          setBusy(false)
        }}
      >
        <label className="field">
          <span>{T("Company & role")}</span>
          <input dir="auto" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={T("e.g. Acme — Data Analyst")} required />
        </label>
        <label className="field">
          <span>{T("Notes / job link")}</span>
          <textarea dir="auto" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={T("Optional")} />
        </label>
        <label className="field">
          <span>{T("List")}</span>
          <select value={idList} onChange={(e) => setIdList(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--block" disabled={busy}>
          {busy ? T("Adding…") : T("Add to Trello")}
        </button>
      </form>
    </Sheet>
  );
}
