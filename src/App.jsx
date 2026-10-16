import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useBackToClose } from './lib/useBack'
import PageGuard from './components/PageGuard'
import AlarmOverlay from './components/AlarmOverlay'
import InstallApp from './components/InstallApp'
import LangSwitch from './components/LangSwitch'
import TopControls from './components/TopControls'
import { followAccountLang } from './lib/i18n'
import { configured, supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import { T, Tr } from './lib/i18n'
import { FEATURES, faithKey, featureView, followAccountLayout, useLayout } from './lib/layout'

// Pages load when you open them (Home is part of the first download). After the first screen, the rest load quietly in the background.
const PAGES = {
  words: () => import('./pages/Words'),
  tasks: () => import('./pages/Tasks'),
  habits: () => import('./pages/Habits'),
  spend: () => import('./pages/Spend'),
  plan: () => import('./pages/Plan'),
  links: () => import('./pages/Links'),
  notes: () => import('./pages/Notes'),
  jobs: () => import('./pages/Jobs'),
  commit: () => import('./pages/Commit'),
  reminders: () => import('./pages/Reminders'),
  review: () => import('./pages/Review'),
  sleep: () => import('./pages/Sleep'),
  promises: () => import('./pages/Promises'),
  customize: () => import('./pages/Customize'),
  faith: () => import('./pages/Faith'),
  gym: () => import('./pages/Gym'),
}
const Words = lazy(PAGES.words)
const Tasks = lazy(PAGES.tasks)
const Habits = lazy(PAGES.habits)
const Spend = lazy(PAGES.spend)
const Plan = lazy(PAGES.plan)
const Links = lazy(PAGES.links)
const Notes = lazy(PAGES.notes)
const Jobs = lazy(PAGES.jobs)
const Commit = lazy(PAGES.commit)
const Reminders = lazy(PAGES.reminders)
const Review = lazy(PAGES.review)
const Sleep = lazy(PAGES.sleep)
const Promises = lazy(PAGES.promises)
const Customize = lazy(PAGES.customize)
const Faith = lazy(PAGES.faith)
const Gym = lazy(PAGES.gym)
/** The faith page: Islam keeps its prayer-times page; other faiths get their daily practices. */
function FaithRoute() {
  const layout = useLayout()
  return faithKey(layout) === 'islam' ? <Commit /> : <Faith />
}
function prefetchPages() {
  const go = () => Object.values(PAGES).forEach((load) => load().catch(() => {}))
  if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 2500)
}

/** Saved AI answers, an unfinished workout and this person's Home layout are removed from this browser on sign-out. */
function clearPrivateCache() {
  const PREFIXES = ['review:', 'sleep-ai|', 'promises-ai|', 'faith-ai|', 'gym-ai|', 'gym-session', 'tracker-layout', 'today-brief', 'brief:']
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      Object.keys(store)
        .filter((k) => PREFIXES.some((p) => k.startsWith(p)) || k.startsWith('ai-answer|'))
        .forEach((k) => store.removeItem(k))
    } catch {
      /* fine */
    }
  }
}

export const SECTIONS = [
  { to: '/words', label: T("Words"), hint: T("New English words & translations") },
  { to: '/tasks', label: T("Tasks"), hint: T("Daily tasks · AI analysis") },
  { to: '/habits', label: T("Habits"), hint: T("Track habits every day") },
  { to: '/spend', label: T("Spend"), hint: T("Daily spending · AI analysis") },
  { to: '/plan', label: T("Plan"), hint: T("Plan tomorrow & the week") },
  { to: '/links', label: T("Links"), hint: T("Saved video & web links") },
  { to: '/notes', label: T("Notes"), hint: T("Notebooks with note cards") },
  { to: '/jobs', label: T("Jobs"), hint: T("Jobs applied · Trello") },
  { to: '/commit', label: T("Prayers"), hint: T("Commitments · prayer times") },
  { to: '/sleep', label: T("Sleep"), hint: T("Bedtime, wake-up · AI analysis") },
  { to: '/promises', label: T("Promises"), hint: T("Promises to yourself · streaks") },
  { to: '/gym', label: T("Gym"), hint: T("Daily workouts with photos and lessons") },
  { to: '/review', label: T("Review"), hint: T("Week, month or year at a glance") },
  { to: '/reminders', label: T("Reminders"), hint: T("Notifications for plans & prayers") },
]

// The pages you chose to show (Customise Home), in your order. Hidden features leave the menus, not your data.
function useSections() {
  const layout = useLayout()
  const order = layout.features.filter((f) => f.on).map((f) => '/' + f.key)
  const faith = featureView(FEATURES.find((f) => f.key === 'commit'), layout)
  return SECTIONS.filter((s) => order.includes(s.to))
    .sort((a, b) => order.indexOf(a.to) - order.indexOf(b.to))
    .map((s) => (s.to === '/commit' && faithKey(layout) !== 'islam' ? { ...s, label: T(faith.label), hint: T(faith.hint) } : s))
}
const CUSTOMIZE = { to: '/customize', label: T('Customise Home'), hint: T('Choose what you track and what Home shows') }

export default function App() {
  const [session, setSession] = useState(undefined)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) {
        prefetchPages() // the other pages, quietly, so opening them is instant
        followAccountLayout() // your Home and menu, as you set them on any device
      }
      followAccountLang(data.session?.user) // use the language saved in your account
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') clearPrivateCache() // a shared computer shouldn't show the last person's answers
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // braces matter: newer Chrome's scrollTo returns a promise, which React would try to run as a clean-up function
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const sections = useSections()
  // bottom bar on phones: your first three pages + "More"
  const MOBILE = sections.filter((s) => s.to !== '/review' && s.to !== '/reminders').slice(0, 3).map((s) => s.to)

  if (!configured) return <SetupNotice />
  if (session === undefined) return <div className="splash">{T("Loading…")}</div>;
  if (!session) return <Login />

  const inMore = pathname === '/more' || (!MOBILE.includes(pathname) && pathname !== '/')

  return (
      <div className="shell">
        <MobileBar pathname={pathname} email={session.user.email} sections={sections} />
        <AlarmOverlay />
        <nav className="topbar" aria-label={T("Sections")}>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>{T("Home")}</NavLink>
          {sections.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {n.label}
            </NavLink>
          ))}
          <TopControls className="top-controls--top" />
        </nav>

        <main className="content">
          <PageGuard resetKey={pathname}>
          <div key={pathname} className="page-anim">
          <Suspense fallback={<div className="empty muted loading-text">{T('Loading…')}</div>}>
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
            <Route path="/commit" element={<FaithRoute />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/review" element={<Review />} />
            <Route path="/sleep" element={<Sleep />} />
            <Route path="/promises" element={<Promises />} />
            <Route path="/customize" element={<Customize />} />
            <Route path="/gym" element={<Gym />} />
            <Route path="/more" element={<More sections={sections} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </div>
          </PageGuard>
        </main>

        <nav className="tabbar" aria-label={T("Main")}>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>{T("Home")}</NavLink>
          {MOBILE.map((to) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {SECTIONS.find((s) => s.to === to).label}
            </NavLink>
          ))}
          <NavLink to="/more" className={inMore ? 'is-active' : ''}>{T("More")}</NavLink>
        </nav>
      </div>
  );
}

/** Phones: a slim bar at the top with ☰ — opens a list of every page. The phone's back button closes it. */
function MobileBar({ pathname, email, sections }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  useBackToClose(open, () => setOpen(false))

  const here = pathname === '/' ? T('Home') : [...sections, ...SECTIONS, CUSTOMIZE].find((s) => pathname.startsWith(s.to))?.label || T('Tracker')
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
        <button type="button" className="mobilebar__burger" aria-label={T("Open menu")} aria-expanded={open} onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
        <span className="mobilebar__title">{here}</span>
        <TopControls />
      </header>

      {open && (
        <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <nav className="drawer" aria-label={T("All pages")}>
            <div className="drawer__head">
              <span className="drawer__brand">{T("Tracker")}</span>
              <button type="button" className="icon-btn" aria-label={T("Close menu")} onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <ul>
              {[{ to: '/', label: T("Home"), hint: T("Today at a glance") }, ...sections, CUSTOMIZE].map((s) => {
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
            <div className="drawer__lang">
              <LangSwitch />
            </div>
            <InstallApp compact />
            <div className="drawer__foot">
              <span className="muted small">{email}</span>
              <button className="btn btn--ghost btn--sm" onClick={() => supabase.auth.signOut()}>{T("Sign out")}</button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

function More({ sections }) {
  return (
    <div className="page">
      <header className="page-header">
        <h1>{T("All sections")}</h1>
      </header>
      <ul className="list list--tight">
        {[...sections, CUSTOMIZE].map((s) => (
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
  );
}

function SetupNotice() {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="brand">{T("Tracker")}</h1>
        <p>{T("The database isn't connected yet.")}</p>
        <p className="muted">{Tr(
            "Create a {0} file with {1} and {2} (see README.md), then restart the app.",
            <code>.env</code>,
            <code>VITE_SUPABASE_URL</code>,
            <code>VITE_SUPABASE_ANON_KEY</code>
          )}</p>
      </div>
    </div>
  );
}
