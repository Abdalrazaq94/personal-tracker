import { supabase } from './supabase'
import { callAi } from './ai'
import { dayLabel, money, today } from './dates'

/**
 * Carries out the actions the AI found in a quick-add note.
 * Returns one result per action: { label, ok, undo() }.
 */
export async function runActions(actions, { lang = 'Arabic' } = {}) {
  const results = []
  for (const a of actions) {
    try {
      results.push(await run(a, lang))
    } catch (e) {
      results.push({ label: `Couldn’t add: ${e.message}`, ok: false })
    }
  }
  return results
}

const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

async function run(a, lang) {
  switch (a.type) {
    case 'task': {
      const row = must(await supabase.from('tasks').insert({ title: a.title, priority: a.important ? 'important' : 'normal' }).select().single())
      return { label: `Task${a.important ? ' (important)' : ''}: ${a.title}`, ok: true, undo: () => supabase.from('tasks').delete().eq('id', row.id) }
    }
    case 'plan': {
      const row = must(await supabase.from('plans').insert({ title: a.title, plan_date: a.date }).select().single())
      return { label: `Plan · ${dayLabel(a.date)}: ${a.title}`, ok: true, undo: () => supabase.from('plans').delete().eq('id', row.id) }
    }
    case 'expense': {
      const row = must(await supabase.from('expenses').insert({ amount: a.amount, note: a.note || '', spent_on: a.date || today() }).select().single())
      return {
        label: `Spent ${money(a.amount)}${a.note ? ` · ${a.note}` : ''}${a.date && a.date !== today() ? ` · ${dayLabel(a.date)}` : ''}`,
        ok: true,
        undo: () => supabase.from('expenses').delete().eq('id', row.id),
      }
    }
    case 'word': {
      const row = must(await supabase.from('words').insert({ word: a.word, translation: '', status: 'new' }).select().single())
      // translate in the background, like the Words page
      callAi({ kind: 'translate', word: a.word, lang })
        .then((r) => r?.translation && supabase.from('words').update({ translation: r.translation }).eq('id', row.id))
        .catch(() => {})
      return { label: `New word: ${a.word}`, ok: true, undo: () => supabase.from('words').delete().eq('id', row.id) }
    }
    case 'habit': {
      const day = today()
      const cur = must(await supabase.from('habit_logs').select('count').eq('habit_id', a.habit_id).eq('day', day).maybeSingle())
      const before = cur?.count || 0
      must(await supabase.from('habit_logs').upsert({ habit_id: a.habit_id, day, count: before + a.count }, { onConflict: 'habit_id,day' }))
      return {
        label: `Habit: ${a.name} +${a.count}`,
        ok: true,
        undo: () => supabase.from('habit_logs').upsert({ habit_id: a.habit_id, day, count: before }, { onConflict: 'habit_id,day' }),
      }
    }
    case 'note': {
      let book = must(await supabase.from('notebooks').select('id').eq('name', 'Quick notes').limit(1).maybeSingle())
      if (!book) book = must(await supabase.from('notebooks').insert({ name: 'Quick notes' }).select().single())
      const row = must(await supabase.from('notes').insert({ notebook_id: book.id, title: '', body: a.text }).select().single())
      return { label: `Note: ${a.text.length > 60 ? a.text.slice(0, 60) + '…' : a.text}`, ok: true, undo: () => supabase.from('notes').delete().eq('id', row.id) }
    }
    default:
      return { label: 'Not sure what to do with that', ok: false }
  }
}
