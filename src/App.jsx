import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useBackToClose } from './lib/useBack'
import PageGuard from './components/PageGuard'
import AlarmOverlay from './components/AlarmOverlay'
import { MotionConfig, motion } from 'motion/react'
import InstallApp from './components/InstallApp'
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
import Commit from './pages/Commit'
import Reminders from './pages/Reminders'

export const SECTIONS = [
  { to: '/words', label: 'Words', hint: 'New English words & translations' },
  { to: '/tasks', label: 'Tasks', hint: 'Daily tasks · AI analysis' },
  { to: '/habits', label: 'Habits', hint: 'Track habits every day' },
  { to: '/spend', label: 'Spend', hint: 'Daily spending · AI analysis' },
  { to: '/plan', label: 'Plan', hint: 'Plan tomorrow & the week' },
  { to: '/links', label: 'Links', hint: 'Saved video & web links' },
  { to: '/notes', label: 'Notes', hint: 'Notebooks with note cards' },
  { to: '/jobs', label: 'Jobs', hint: 'Jobs applied · Trello' },
  { to: '/commit', label: 'Commit', hint: 'Commitments · prayer times' },
  { to: '/reminders', label: 'Reminders', hint: 'Notifications for plans & prayers' },
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

  // braces matter: newer Chrome's scrollTo returns a promise, which React would try to run as a clean-up function
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  if (!configured) return <SetupNotice />
  if (session === undefined) return <div className="splash">Loading…</div>
  if (!session) return <Login />

  const inMore = pathname === '/more' || (!MOBILE.includes(pathname) && pathname !== '/')

  return (
    <MotionConfig reducedMotion="user">
    <div className="shell">
      <MobileBar pathname={pathname} email={session.user.email} />
      <AlarmOverlay />
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
        <PageGuard resetKey={pathname}>
        <motion.div
          key={pathname}
          className="page-anim"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
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
          <Route path="/commit" element={<Commit />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </motion.div>
        </PageGuard>
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
    </MotionConfig>
  )
}

/** Phones: a slim bar at the top with ☰ — opens a list of every page. The phone's back button closes it. */
function MobileBar({ pathname, email }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  useBackToClose(open, () => setOpen(false))

  const here = pathname === '/' ? 'Home' : SECTIONS.find((s) => pathname.startsWith(s.to))?.label || 'Tracker'
  const go = (to) => {
    // close the menu first (that takes its own history step back out), then open the page
    const after = () => {
      window.removeEventListener('popstate', after)
      if (to !== pathname) navigate(to)
    }
    window.addEventListener('popstate', after)
    setOpen(false)
  }

  return (
    <>
      <header className="mobilebar">
        <button type="button" className="mobilebar__burger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
        <span className="mobilebar__title">{here}</span>
      </header>

      {open && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <nav className="drawer" aria-label="All pages">
            <div className="drawer__head">
              <span className="drawer__brand">Tracker</span>
              <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <ul>
              {[{ to: '/', label: 'Home', hint: 'Today at a glance' }, ...SECTIONS].map((s) => {
                const active = s.to === '/' ? pathname === '/' : pathname.startsWith(s.to)
                return (
                  <li key={s.to}>
                    <button type="button" className={active ? 'is-active' : ''} onClick={() => go(s.to)}>
                      <strong>{s.label}</strong>
                      <span>{s.hint}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <InstallApp compact />
            <div className="drawer__foot">
              <span className="muted small">{email}</span>
              <button className="btn btn--ghost btn--sm" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
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
