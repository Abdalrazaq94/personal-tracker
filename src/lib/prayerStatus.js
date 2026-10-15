import { T } from './i18n'

/**
 * How a prayer went:
 *  ontime = prayed in its time · late = prayed late, still in its time
 *  qada   = made up later, after its time · missed = didn't pray it
 * Rows saved before supabase/migrations/014_prayer_status.sql only have "late" (true/false).
 */
export const STATUSES = ['ontime', 'late', 'qada', 'missed']

export const statusOf = (log) => (!log ? null : STATUSES.includes(log.status) ? log.status : log.late ? 'late' : 'ontime')
/** Counts as prayed: on time, late or made up (Qada). */
export const isPrayed = (log) => !!log && statusOf(log) !== 'missed'

export const STATUS_LABEL = {
  ontime: 'On time',
  late: 'Late',
  qada: 'Qada',
  missed: 'Didn’t pray',
}
export const statusLabel = (s) => T(STATUS_LABEL[s] || s)
/** One-line explanation, shown as a tooltip. */
export const STATUS_HINT = {
  ontime: 'Prayed in its time',
  late: 'Prayed late, still in its time',
  qada: 'Made up later, after its time',
  missed: 'Didn’t pray it',
}

const needsMigration = (e) => /status|schema cache|column/i.test(e?.message || '')

/**
 * Save a prayer with its status. If the database hasn't got the "status" column yet (014 not run),
 * saves the old way: on time / late work, Qada is saved as late and "didn't pray" isn't saved.
 * Returns { data, error, old } — old = true when it had to fall back.
 */
export async function savePrayerLog(supabase, row, { select = false } = {}) {
  const status = row.status || 'ontime'
  const full = { ...row, status, late: status !== 'ontime' }
  let q = supabase.from('prayer_logs').upsert(full, { onConflict: 'user_id,day,prayer' })
  if (select) q = q.select().single()
  const first = await q
  if (!first.error || !needsMigration(first.error)) return first
  if (status === 'missed') return { data: null, error: new Error(T('Run the new SQL (014) in Supabase to mark “Didn’t pray”.')), old: true }
  const { status: _drop, ...plain } = full
  let q2 = supabase.from('prayer_logs').upsert(plain, { onConflict: 'user_id,day,prayer' })
  if (select) q2 = q2.select().single()
  const second = await q2
  return { ...second, data: second.data ? { ...second.data, status } : second.data, old: true }
}
