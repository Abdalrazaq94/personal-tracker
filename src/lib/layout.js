import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { faithOf } from './faith'

/**
 * "Your Home, your way": which features you use (Home buttons + menu) and which cards appear on Home, in your order.
 * Saved on this phone straight away and in your account (user_settings.home_layout, migrations/019_home_layout.sql),
 * so every device shows the same Home. Features you hide disappear from Home and the menu, not your data.
 */

// Every feature, in the default order. Labels are English keys (translated where shown).
export const FEATURES = [
  { key: 'tasks', to: '/tasks', icon: '✅', label: 'Tasks', hint: 'Daily tasks and what you finish' },
  { key: 'plan', to: '/plan', icon: '🗓️', label: 'Plan', hint: 'Plan tomorrow and the week' },
  { key: 'habits', to: '/habits', icon: '🔁', label: 'Habits', hint: 'Good habits to build, bad ones to cut' },
  { key: 'spend', to: '/spend', icon: '💷', label: 'Spend', hint: 'Spending and a monthly budget' },
  { key: 'commit', to: '/commit', icon: '🕌', label: 'Prayers', hint: 'Islamic prayer times, adhan and tracking' },
  { key: 'promises', to: '/promises', icon: '🤝', label: 'Promises', hint: 'Promises to yourself, with streaks' },
  { key: 'sleep', to: '/sleep', icon: '😴', label: 'Sleep', hint: 'Bedtime, wake-up and how you slept' },
  { key: 'words', to: '/words', icon: '📖', label: 'Words', hint: 'Learn new English words' },
  { key: 'notes', to: '/notes', icon: '📝', label: 'Notes', hint: 'Notebooks with note cards' },
  { key: 'links', to: '/links', icon: '🔗', label: 'Links', hint: 'Save videos and web links' },
  { key: 'jobs', to: '/jobs', icon: '💼', label: 'Jobs', hint: 'Job applications (Trello)' },
  { key: 'reminders', to: '/reminders', icon: '🔔', label: 'Reminders', hint: 'Phone notifications and sounds' },
  { key: 'review', to: '/review', icon: '📊', label: 'Review', hint: 'Your week, month or year at a glance', wide: true },
]

// Cards under the Home buttons. "needs" = the feature it belongs to (hidden with it).
export const HOME_SECTIONS = [
  { key: 'quickadd', label: 'Add anything + Your day', hint: 'Microphone and the AI summary of your day' },
  { key: 'tasks', label: 'Daily tasks', hint: 'Chart and open tasks', needs: 'tasks' },
  { key: 'plans', label: 'Plans', hint: 'Today and coming up', needs: 'plan' },
  { key: 'prayers', label: 'Prayers', hint: 'Next prayer and any not marked', needs: 'commit' },
  { key: 'habits', label: 'Habits', hint: 'Today’s habits with +', needs: 'habits' },
  { key: 'words', label: 'Words to practise', hint: 'Today’s words', needs: 'words' },
  { key: 'spending', label: 'Spending', hint: 'Today, this month and budget', needs: 'spend' },
]

// What a brand-new person starts with on the "What do you want to track?" screen.
export const STARTER = ['tasks', 'plan', 'habits', 'spend', 'promises', 'sleep', 'reminders', 'review']

const KEY = 'tracker-layout'

/** Fills in anything missing (e.g. a feature added after you saved your layout): new things are switched on, at the end. */
export function normalize(raw) {
  const fix = (saved, defs) => {
    const list = Array.isArray(saved) ? saved.filter((x) => x && defs.some((d) => d.key === x.key)) : []
    const seen = new Set(list.map((x) => x.key))
    return [...list.map((x) => ({ key: x.key, on: x.on !== false })), ...defs.filter((d) => !seen.has(d.key)).map((d) => ({ key: d.key, on: true }))]
  }
  const faith = raw?.faith === 'none' || faithOf(raw?.faith) ? raw.faith : null
  return { features: fix(raw?.features, FEATURES), sections: fix(raw?.sections, HOME_SECTIONS), chosen: !!raw?.chosen, faith }
}

function readLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    return raw ? normalize(raw) : null
  } catch {
    return null
  }
}

let current = readLocal() || normalize(null)
let hasLocal = !!readLocal()
const listeners = new Set()
const emit = () => listeners.forEach((f) => f(current))

export const getLayout = () => current

/** Show it everywhere at once, keep it on this phone, then save it to the account. */
export async function saveLayout(next) {
  current = normalize({ ...next, chosen: true })
  hasLocal = true
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* fine */
  }
  emit()
  try {
    const { data: u } = await supabase.auth.getUser()
    if (u?.user) await supabase.from('user_settings').upsert({ user_id: u.user.id, home_layout: current, updated_at: new Date().toISOString() })
  } catch {
    /* needs 019_home_layout.sql; the phone keeps it anyway */
  }
}

/** After sign-in: use the layout saved in the account (so all devices match). Returns true if the account has one. */
export async function followAccountLayout() {
  try {
    const { data, error } = await supabase.from('user_settings').select('home_layout').maybeSingle()
    if (error || !data?.home_layout) return hasLocal
    current = normalize(data.home_layout)
    hasLocal = true
    try {
      localStorage.setItem(KEY, JSON.stringify(current))
    } catch {
      /* fine */
    }
    emit()
    return true
  } catch {
    return hasLocal
  }
}

export function useLayout() {
  const [l, setL] = useState(current)
  useEffect(() => {
    listeners.add(setL)
    setL(current)
    return () => listeners.delete(setL)
  }, [])
  return l
}

/** Your faith: islam | christian | jewish | hindu | custom | none. Accounts from before the choice existed keep Islam. */
export const faithKey = (l) => l.faith || 'islam'

/** A feature as you see it: the faith button takes your faith's icon and name. */
export function featureView(def, l) {
  if (def.key !== 'commit') return def
  const f = faithOf(faithKey(l))
  if (!f) return def
  return { ...def, icon: f.icon, label: f.feature, hint: f.key === 'islam' ? def.hint : 'Daily practices for your faith, with streaks' }
}
/** Features switched on, in your order (full definitions). */
export const shownFeatures = (l) => l.features.filter((f) => f.on).map((f) => featureView(FEATURES.find((d) => d.key === f.key), l))
export const isShown = (l, key) => l.features.find((f) => f.key === key)?.on !== false
/** Home cards switched on, in your order, whose feature is also on. */
export const shownSections = (l) =>
  l.sections
    .filter((s) => s.on)
    .map((s) => HOME_SECTIONS.find((d) => d.key === s.key))
    .filter((s) => !s.needs || isShown(l, s.needs))
