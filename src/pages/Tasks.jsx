import { useMemo, useState } from 'react'
import { useRows } from '../lib/useRows'
import AiPanel from '../components/AiPanel'
import { DeleteButton, Empty, ErrorBar, Loading, PageHeader, Segmented } from '../components/ui'

const STATUS_ORDER = { doing: 0, todo: 1, done: 2 }

export default function Tasks() {
  const { rows, loading, error, setError, insert, update, remove } = useRows('tasks')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('normal')
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
    const ok = await insert({ title: title.trim(), priority })
    if (ok) {
      setTitle('')
      setPriority('normal')
    }
  }

  return (
    <div className="page">
      <PageHeader title="Daily tasks" subtitle={`${counts.done} of ${counts.all} done`} />
      <ErrorBar error={error} onClose={() => setError(null)} />

      <form className="card form" onSubmit={add}>
        <label className="field">
          <span>New task</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" required />
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
          <button className="btn">Add</button>
        </div>
      </form>

      <AiPanel kind="tasks" examples={['What should I focus on tomorrow?', 'Which tasks am I avoiding?']} />

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
          <span>Important on top</span>
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>{rows.length ? 'Nothing here.' : 'No tasks yet.'}</Empty>
      ) : (
        <ul className="list">
          {shown.map((t) => (
            <li key={t.id} className={`item task task--${t.status} ${t.priority === 'important' ? 'task--important' : ''}`}>
              <div className="task__main">
                <button
                  type="button"
                  className={`check ${t.status === 'done' ? 'is-on' : ''}`}
                  aria-label={t.status === 'done' ? 'Mark not done' : 'Mark done'}
                  onClick={() => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
                >
                  {t.status === 'done' ? '✓' : ''}
                </button>
                <span className="task__title" dir="auto">
                  {t.title}
                </span>
                <DeleteButton label="Delete task" onClick={() => remove(t.id)} />
              </div>
              <div className="task__meta">
                <button
                  type="button"
                  className={`badge ${t.priority === 'important' ? 'badge--solid' : ''}`}
                  onClick={() => update(t.id, { priority: t.priority === 'important' ? 'normal' : 'important' })}
                >
                  {t.priority === 'important' ? '! Important' : 'Normal'}
                </button>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
