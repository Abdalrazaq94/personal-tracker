import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { today as todayYmd } from '../lib/dates'
import { NEEDS_FAITH_SQL, addDays, faithMissing, presetRows } from '../lib/faith'
import { T } from '../lib/i18n'

const seeding = {} // faith → the one insert of its ready-made practices in this session

/** Load and save the practices of one faith (with their day-by-day counts). */
export function usePractices(faith) {
  const [list, setList] = useState(null)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!faith || faith === 'islam' || faith === 'none') return
    let alive = true
    ;(async () => {
      const since = addDays(todayYmd(), -400)
      const [p, l] = await Promise.all([
        supabase.from('practices').select('*').eq('faith', faith).eq('archived', false).order('sort', { ascending: true }),
        supabase.from('practice_logs').select('*').gte('day', since),
      ])
      if (!alive) return
      const err = p.error || l.error
      if (err) {
        setError(faithMissing(err) ? T(NEEDS_FAITH_SQL) : err.message)
        setList([])
        return
      }
      let rows = p.data || []
      // first visit for this faith: start with its ready-made practices (all editable) — only once, even if two screens ask at the same time
      if (!rows.length && presetRows(faith).length) {
        seeding[faith] ??= supabase.from('practices').insert(presetRows(faith)).select()
        const { data, error } = await seeding[faith]
        if (!alive) return
        if (error) setError(faithMissing(error) ? T(NEEDS_FAITH_SQL) : error.message)
        rows = (data || []).sort((a, b) => a.sort - b.sort)
      }
      setList([...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)))
      setLogs(l.data || [])
    })()
    return () => {
      alive = false
    }
  }, [faith])

  const setCount = async (p, day, count) => {
    setError(null)
    const old = logs.find((l) => l.practice_id === p.id && l.day === day)
    if (count <= 0) {
      setLogs((ls) => ls.filter((l) => l !== old))
      if (old?.id) {
        const { error } = await supabase.from('practice_logs').delete().eq('id', old.id)
        if (error) setError(error.message)
      }
      return
    }
    const row = { practice_id: p.id, day, count: Math.min(100000, count) }
    setLogs((ls) => [...ls.filter((l) => l !== old), { ...old, ...row }])
    const { data, error } = await supabase.from('practice_logs').upsert(row, { onConflict: 'practice_id,day' }).select().single()
    if (error) setError(error.message)
    else if (data) setLogs((ls) => [...ls.filter((l) => !(l.practice_id === p.id && l.day === day)), data])
  }
  const save = async (row, id) => {
    const q = id ? supabase.from('practices').update(row).eq('id', id).select().single() : supabase.from('practices').insert({ ...row, faith, sort: (list?.length || 0) + 1 }).select().single()
    const { data, error } = await q
    if (error) {
      setError(faithMissing(error) ? T(NEEDS_FAITH_SQL) : error.message)
      return false
    }
    setList((ls) => (id ? ls.map((x) => (x.id === id ? data : x)) : [...ls, data]))
    return true
  }
  const remove = async (p) => {
    setList((ls) => ls.filter((x) => x.id !== p.id))
    const { error } = await supabase.from('practices').delete().eq('id', p.id)
    if (error) setError(error.message)
  }
  const move = async (p, by) => {
    const i = list.findIndex((x) => x.id === p.id)
    const j = i + by
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    setList(next)
    await Promise.all(next.map((x, k) => supabase.from('practices').update({ sort: k }).eq('id', x.id)))
  }
  return { list, logs, error, setError, setCount, save, remove, move }
}

export function PracticeRow({ p, count, onCount }) {
  const done = count >= (p.target || 1)
  if (p.kind === 'count')
    return (
      <li className={`faith-row faith-row--count ${done ? 'is-done' : ''}`}>
        <span className="faith-row__emoji" aria-hidden>
          {p.emoji}
        </span>
        <span className="faith-row__text">
          <strong dir="auto">{p.title}</strong>
          <span className="muted small">
            {count}/{p.target} {p.unit}
            {p.time ? ` · ${p.time}` : ''}
          </span>
          <span className="faith-bar" aria-hidden>
            <span style={{ width: `${Math.min(100, (count / p.target) * 100)}%` }} />
          </span>
        </span>
        <span className="faith-count">
          <button type="button" className="round-btn round-btn--sm" aria-label={T('One less')} disabled={!count} onClick={() => onCount(count - 1)}>
            −
          </button>
          <button type="button" dir="ltr" className="round-btn round-btn--solid faith-tap" aria-label={T('Add one to {0}', [p.title])} onClick={() => onCount(count + 1)}>
            +1
          </button>
          {p.target >= 20 && (
            <button type="button" className="chip" onClick={() => onCount(Math.max(count, p.target))}>
              {T('All {0}', [p.target])}
            </button>
          )}
        </span>
      </li>
    )
  return (
    <li className={`faith-row ${done ? 'is-done' : ''}`}>
      <button type="button" className={`check ${done ? 'is-on' : ''}`} aria-pressed={done} aria-label={T('{0}: done', [p.title])} onClick={() => onCount(done ? 0 : 1)}>
        {done ? '✓' : ''}
      </button>
      <span className="faith-row__emoji" aria-hidden>
        {p.emoji}
      </span>
      <span className="faith-row__text">
        <strong dir="auto">{p.title}</strong>
        {(p.time || p.special) && <span className="muted small">{p.special === 'shabbat' ? T('at candle-lighting time') : p.time}</span>}
      </span>
    </li>
  )
}
