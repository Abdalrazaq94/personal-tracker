import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, startOfMonth, today, tomorrow, ymd } from '../lib/dates'

export default function Home({ session }) {
  const [s, setS] = useState(null)

  useEffect(() => {
    const load = async () => {
      const [words, tasks, habits, logs, spend, plans, links, notes, trello] = await Promise.all([
        supabase.from('words').select('status'),
        supabase.from('tasks').select('status, priority'),
        supabase.from('habits').select('id, target'),
        supabase.from('habit_logs').select('habit_id, count').eq('day', today()),
        supabase.from('expenses').select('amount').gte('spent_on', ymd(startOfMonth())),
        supabase.from('plans').select('done').eq('plan_date', tomorrow()),
        supabase.from('links').select('id', { count: 'exact', head: true }),
        supabase.from('notes').select('id', { count: 'exact', head: true }),
        supabase.from('user_settings').select('trello_board_id').maybeSingle(),
      ])
      const w = words.data || []
      const t = tasks.data || []
      const h = habits.data || []
      const l = logs.data || []
      const doneHabits = h.filter((hb) => (l.find((x) => x.habit_id === hb.id)?.count || 0) >= hb.target).length
      setS({
        words: w.length,
        memorized: w.filter((x) => x.status === 'memorized').length,
        openTasks: t.filter((x) => x.status !== 'done').length,
        importantTasks: t.filter((x) => x.status !== 'done' && x.priority === 'important').length,
        habits: h.length,
        doneHabits,
        month: (spend.data || []).reduce((a, x) => a + Number(x.amount), 0),
        tomorrow: (plans.data || []).filter((x) => !x.done).length,
        links: links.count || 0,
        notes: notes.count || 0,
        trello: Boolean(trello.data?.trello_board_id),
      })
    }
    load()
  }, [])

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const v = (fn) => (s ? fn(s) : '—')

  const cards = [
    { to: '/words', title: 'Words', big: v((x) => x.words), small: v((x) => `${x.memorized} memorized`) },
    { to: '/tasks', title: 'Daily tasks', big: v((x) => x.openTasks), small: v((x) => `open · ${x.importantTasks} important`) },
    { to: '/habits', title: 'Habits', big: v((x) => `${x.doneHabits}/${x.habits}`), small: 'done today' },
    { to: '/spend', title: 'Spending', big: v((x) => money(x.month)), small: 'this month' },
    { to: '/plan', title: 'Plan', big: v((x) => x.tomorrow), small: 'planned for tomorrow' },
    { to: '/links', title: 'Saved links', big: v((x) => x.links), small: 'videos & pages' },
    { to: '/notes', title: 'Notes', big: v((x) => x.notes), small: 'note cards' },
    { to: '/jobs', title: 'Jobs applied', big: v((x) => (x.trello ? 'Trello' : 'Connect')), small: v((x) => (x.trello ? 'board connected' : 'link your Trello board')) },
  ]

  return (
    <div className="page">
      <header className="home-header">
        <p className="muted">{date}</p>
        <h1 className="display">{greet}.</h1>
      </header>

      <div className="home-grid">
        {cards.map((c, i) => (
          <Link key={c.to} to={c.to} className={`home-card ${i === 0 ? 'home-card--wide' : ''} ${i > 0 && i === cards.length - 1 && cards.length % 2 === 0 ? 'home-card--span' : ''}`}>
            <span className="home-card__title">{c.title}</span>
            <span className="home-card__big">{c.big}</span>
            <span className="home-card__small">{c.small}</span>
            <span className="home-card__arrow" aria-hidden>→</span>
          </Link>
        ))}
      </div>

      <footer className="home-footer">
        <span className="muted">{session.user.email}</span>
        <button className="btn btn--ghost btn--sm" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </footer>
    </div>
  )
}
