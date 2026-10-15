import { supabase } from './supabase'
import { T } from './i18n'

/**
 * Monthly budget (needs supabase/migrations/015_budget.sql).
 * The amount is kept in user_settings.budget; the reminder server warns at 80% and 100%.
 */
const NEEDS = 'Run supabase/migrations/015_budget.sql in Supabase first.'
const missing = (e) => /budget|column|schema cache/i.test(e?.message || '')

/** { budget: number|null, notify: boolean } — or { needsUpdate: true } when the database hasn't got it yet. */
export async function loadBudget() {
  const { data, error } = await supabase.from('user_settings').select('budget, budget_notify').maybeSingle()
  if (error) return missing(error) ? { budget: null, notify: true, needsUpdate: true } : { budget: null, notify: true }
  return { budget: data?.budget != null ? Number(data.budget) : null, notify: data?.budget_notify !== false }
}

/** budget = null removes it. */
export async function saveBudget(budget, notify = true) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: u.user.id, budget, budget_notify: notify, budget_alerted: null, updated_at: new Date().toISOString() })
  if (error) throw new Error(missing(error) ? T(NEEDS) : error.message)
}

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Everything the budget card shows, for the month that `today` ("YYYY-MM-DD") is in.
 * expenses: rows with amount, spent_on (and note for the top list). Only this month's rows are used.
 */
export function budgetStats(expenses, budget, today, now = new Date()) {
  const [y, m, d] = today.split('-').map(Number)
  const first = ymdOf(new Date(y, m - 1, 1))
  const daysInMonth = new Date(y, m, 0).getDate()
  const mine = expenses.filter((x) => x.spent_on >= first && x.spent_on <= today)
  const spent = mine.reduce((a, x) => a + Number(x.amount), 0)
  const spentToday = mine.filter((x) => x.spent_on === today).reduce((a, x) => a + Number(x.amount), 0)

  // how far through the month we are (counting the part of today that has passed)
  const dayPart = Math.min(1, (now.getHours() * 60 + now.getMinutes()) / (24 * 60))
  const elapsed = d - 1 + Math.max(dayPart, 0.25) // never project from a tiny slice of the first morning
  const share = elapsed / daysInMonth
  const daysLeft = daysInMonth - d + 1 // including today
  // the pace forecast only means something after a few days
  const forecast = d >= 4 ? (spent / elapsed) * daysInMonth : null

  const groups = new Map()
  for (const x of mine) {
    const name = (x.note || '').trim()
    const key = name.toLowerCase() || '—'
    const g = groups.get(key) || { name: name || '—', amount: 0, n: 0 }
    g.amount += Number(x.amount)
    g.n++
    groups.set(key, g)
  }
  const top = [...groups.values()].sort((a, b) => b.amount - a.amount).slice(0, 4)

  if (!budget) return { budget: null, spent, spentToday, daysLeft, daysInMonth, forecast, top }
  const left = budget - spent
  // left over at the start of today, shared over the days left (today included)
  const perDay = Math.max(0, (budget - (spent - spentToday)) / daysLeft)
  const pct = spent / budget
  const expected = budget * share // where you'd be if you spent evenly
  const state = pct >= 1 ? 'over' : pct >= 0.8 || (forecast != null && forecast > budget * 1.05) ? 'watch' : 'ok'
  return { budget, spent, spentToday, left, perDay, pct, expected, share, daysLeft, daysInMonth, forecast, state, top }
}
