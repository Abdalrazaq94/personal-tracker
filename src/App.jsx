import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { configured, supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import Words from './pages/Words'
import Tasks from './pages/Tasks'
import Habits from './pages/Habits'
import Spend from './pages/Spend'
import Plan from './pages/Plan'
import Links from './pages/Links'
import Notes from './pages/Notes'
import Jobs from './pages/Jobs'
import Phone from './pages/Phone'
import Commit from './pages/Commit'

export const SECTIONS = [
  { to: '/words', label: 'Words', hint: 'New English words & translations' },
  { to: '/tasks', label: 'Tasks', hint: 'Daily tasks · AI analysis' },
  { to: '/habits', label: 'Habits', hint: 'Track habits every day' },
  { to: '/spend', label: 'Spend', hint: 'Daily spending · AI analysis' },
  { to: '/plan', label: 'Plan', hint: 'Plan tomorrow & the week' },
  { to: '/links', label: 'Links', hint: 'Saved video & web links' },
  { to: '/notes', label: 'Notes', hint: 'Notebooks with note cards' },
  { to: '/jobs', label: 'Jobs', hint: 'Jobs applied · Trello' },
  { to: '/phone', label: 'Phone', hint: 'Phone time · which apps' },
  { to: '/commit', label: 'Commit', hint: 'Commitments · prayer times' },
]

// bottom bar on phones: the most used pages + "More"
const MOBILE = ['/tasks', '/words', '/spend']

export default function App() {
  const [session, setSession] = useState(undefined)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => window.scrollTo(0, 0), [pathname])

  if (!configured) return <SetupNotice />
  if (session === undefined) return <div className="splash">Loading…</div>
  if (!session) return <Login />

  const inMore = pathname === '/more' || (!MOBILE.includes(pathname) && pathname !== '/')

  return (
    <div className="shell">
      <nav className="topbar" aria-label="Sections">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Home
        </NavLink>
        {SECTIONS.map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {n.label}
          </NavLink>
        ))}
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/words" element={<Words />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/spend" element={<Spend />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/links" element={<Links />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/phone" element={<Phone />} />
          <Route path="/commit" element={<Commit />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Home
        </NavLink>
        {MOBILE.map((to) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {SECTIONS.find((s) => s.to === to).label}
          </NavLink>
        ))}
        <NavLink to="/more" className={inMore ? 'is-active' : ''}>
          More
        </NavLink>
      </nav>
    </div>
  )
}

function More() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>All sections</h1>
      </header>
      <ul className="list list--tight">
        {SECTIONS.map((s) => (
          <li key={s.to} className="item more-item">
            <Link to={s.to}>
              <span>
                <strong>{s.label}</strong>
                <span className="muted small">{s.hint}</span>
              </span>
              <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="brand">Tracker</h1>
        <p>The database isn't connected yet.</p>
        <p className="muted">
          Create a <code>.env</code> file with <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          (see README.md), then restart the app.
        </p>
      </div>
    </div>
  )
}
