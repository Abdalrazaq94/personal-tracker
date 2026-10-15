import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Small helper that loads every row of one table for the signed-in user
 * and gives back insert / update / remove functions that keep the list in sync.
 */
export function useRows(table, { order = 'created_at', ascending = false } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending })
    if (error) setError(error.message)
    else {
      setRows(data)
      setError(null)
    }
    setLoading(false)
  }, [table, order, ascending])

  useEffect(() => {
    reload()
  }, [reload])

  const insert = async (values) => {
    const { data, error } = await supabase.from(table).insert(values).select().single()
    if (error) {
      setError(error.message)
      return null
    }
    setRows((r) => (ascending ? [...r, data] : [data, ...r]))
    return data
  }

  const update = async (id, values) => {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...values } : x)))
    const { error } = await supabase.from(table).update(values).eq('id', id)
    if (error) {
      setError(error.message)
      reload()
    }
    return !error
  }

  const remove = async (id) => {
    setRows((r) => r.filter((x) => x.id !== id))
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      setError(error.message)
      reload()
    }
  }

  return { rows, setRows, loading, error, setError, insert, update, remove, reload }
}
