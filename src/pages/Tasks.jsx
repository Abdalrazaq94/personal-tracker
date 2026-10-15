import { useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import AiPanel from '../components/AiPanel'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader, Segmented } from '../components/ui'
import { T } from '../lib/i18n'

const STATUS_ORDER = { doing: 0, todo: 1, done: 2 }

// "2026-10-15T15:40" for <input type="datetime-local">, in this phone's time
const toLocalInput = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const inAnHour = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  return toLocalInput(d)
}
const remindPatch = (local) => ({
  remind_at: local ? new Date(local).toISOString() : null,
  notify_count: 0,
  last_notified: null,
  snoozed_until: null,
})
function whenLabel(iso) {
  const d = new Date(iso)
  const day = new Date(d).setHours(0, 0, 0, 0)
  const today = new Date().setHours(0, 0, 0, 0)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  if (day === today) return `Today ${time}`
  if (day === today + 864e5) return `Tomorrow ${time}`
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}

export default function Tasks() {
  const { rows, loading, error, setError, insert, update, remove } = useRows('tasks')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('normal')
  const [remind, setRemind] = useState('') // '' = no reminder
  const [editing, setEditing] = useState(null) // task id whose reminder is being set
  const [filter, setFilter] = useState('all')
  const [importantTop, setImportantTop] = useState(() => {
    try {
      return localStorage.getItem('importantTop') !== 'no'
    } catch {
      return true
    }
  })

  const toggleTop = () => {
    const next = !importantTop
    setImportantTop(next)
    try {
      localStorage.setItem('importantTop', next ? 'yes' : 'no')
    } catch {}
  }

  const counts = useMemo(() => {
    const c = { all: rows.length, todo: 0, doing: 0, done: 0 }
    rows.forEach((r) => c[r.status]++)
    return c
  }, [rows])

  const shown = useMemo(() => {
    const list = rows.filter((r) => filter === 'all' || r.status === filter)
    return [...list].sort((a, b) => {
      if (importantTop && a.priority !== b.priority) return a.priority === 'important' ? -1 : 1
      if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [rows, filter, importantTop])

  const add = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    const ok = await insert({ title: title.trim(), priority, ...(remind ? remindPatch(remind) : {}) })
    if (ok) {
      setTitle('')
      setPriority('normal')
      setRemind('')
    }
  }

  return (
    <div className="page">
      <PageHeader title={T("Daily tasks")} subtitle={T("{0} of {1} done", [counts.done, counts.all])} />
      <ErrorBar error={error} onClose={() => setError(null)} />

      <form className="card form" onSubmit={add}>
        <label className="field">
          <span>{T("New task")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={T("What needs doing?")} required />
        </label>
        <div className="form-foot">
          <Segmented
            small
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'important', label: 'Important' },
            ]}
          />
          <button type="button" className={`badge ${remind ? 'badge--solid' : ''}`} onClick={() => setRemind(remind ? '' : inAnHour())}>
            ⏰ {remind ? T("Reminder on") : T("Remind me")}
          </button>
          <button className="btn">{T("Add")}</button>
        </div>
        {remind && (
          <label className="field">
            <span>{T("Remind me at")}</span>
            <input type="datetime-local" value={remind} onChange={(e) => setRemind(e.target.value)} required />
          </label>
        )}
      </form>

      <AiPanel kind="tasks" examples={[T("What should I focus on tomorrow?"), T("Which tasks am I avoiding?")]} />

      <div className="toolbar">
        <div className="scroll-x">
          <Segmented
            small
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'todo', label: 'To do', count: counts.todo },
              { value: 'doing', label: 'Doing', count: counts.doing },
              { value: 'done', label: 'Done', count: counts.done },
            ]}
          />
        </div>
        <label className="switch">
          <input type="checkbox" checked={importantTop} onChange={toggleTop} />
          <span className="switch__track" />
          <span>{T("Important on top")}</span>
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>{rows.length ? T("Nothing here.") : T("No tasks yet.")}</Empty>
      ) : (
        <ul className="list">
          {shown.map((t) => (
            <li key={t.id} className={`item task task--${t.status} ${t.priority === 'important' ? 'task--important' : ''}`}>
              <div className="task__main">
                <button
                  type="button"
                  className={`check ${t.status === 'done' ? 'is-on' : ''}`}
                  aria-label={t.status === 'done' ? T("Mark not done") : T("Mark done")}
                  onClick={() => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
                >
                  {t.status === 'done' ? '✓' : ''}
                </button>
                <span className="task__title" dir="auto">
                  {t.title}
                </span>
                <DeleteButton label={T("Delete task")} onClick={() => remove(t.id)} />
              </div>
              <div className="task__meta">
                <button
                  type="button"
                  className={`badge ${t.priority === 'important' ? 'badge--solid' : ''}`}
                  onClick={() => update(t.id, { priority: t.priority === 'important' ? 'normal' : 'important' })}
                >
                  {t.priority === 'important' ? T("! Important") : T("Normal")}
                </button>
                {t.remind_at && t.status !== 'done' ? (
                  <span className="task__remind">
                    <button type="button" className="badge" onClick={() => setEditing(editing === t.id ? null : t.id)}>
                      ⏰ {whenLabel(t.remind_at)}
                    </button>
                    <button type="button" className="badge" aria-label={T("Remove reminder")} onClick={() => update(t.id, remindPatch(null))}>
                      ✕
                    </button>
                  </span>
                ) : (
                  t.status !== 'done' && (
                    <button type="button" className="badge" aria-label={T("Add a reminder")} onClick={() => setEditing(editing === t.id ? null : t.id)}>
                      ⏰
                    </button>
                  )
                )}
                <Segmented
                  small
                  value={t.status}
                  onChange={(s) => update(t.id, { status: s })}
                  options={[
                    { value: 'todo', label: 'To do' },
                    { value: 'doing', label: 'Doing' },
                    { value: 'done', label: 'Done' },
                  ]}
                />
              </div>
              {editing === t.id && (
                <form
                  className="task__remind-form"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const v = new FormData(e.currentTarget).get('at')
                    if (v && (await update(t.id, remindPatch(v)))) setEditing(null)
                  }}
                >
                  <input type="datetime-local" name="at" defaultValue={t.remind_at ? toLocalInput(new Date(t.remind_at)) : inAnHour()} required aria-label={T("Remind me at")} />
                  <button className="btn">{T("Save")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
