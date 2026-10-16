import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { today as todayYmd } from '../lib/dates'
import { callAi } from '../lib/ai'
import { playSound } from '../lib/sounds'
import {
  NEEDS_GYM_SQL,
  PROGRAMS,
  REST_DAY,
  addDays,
  gymMissing,
  gymSummary,
  historyByExercise,
  isTrainingDay,
  lessonOf,
  mondayOf,
  muscleName,
  nextWorkout,
  oneRepMax,
  parseDay,
  photo,
  programOf,
  volumeOf,
  weekStreak,
} from '../lib/gym'
import EXERCISES from '../data/exercises.json'
import { T, Tr, LANG, LOCALE, isAr } from '../lib/i18n'
import { DeleteButton, ErrorBar, PageHeader, Segmented } from '../components/ui'
import PeriodPicker, { usePeriod } from '../components/PeriodPicker'
import { Markdown } from '../components/AiPanel'
import Reveal from '../components/bits/Reveal'
import { AiCat } from '../components/Cat'

const EX = new Map(EXERCISES.map((e) => [e.id, e]))
const exName = (id) => EX.get(id)?.name || id.replace(/_/g, ' ')
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]
const dayName = (d, style = 'short') => new Date(2026, 0, 4 + d).toLocaleDateString(LOCALE, { weekday: style })
const SESSION_KEY = 'gym-session'
const mmss = (sec) => {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ================================================================== */

export default function Gym() {
  const t = todayYmd()
  const [plan, setPlan] = useState(undefined) // undefined = loading, null = not set up yet
  const [workouts, setWorkouts] = useState([])
  const [sets, setSets] = useState([])
  const [weights, setWeights] = useState([])
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('today')
  const [editingPlan, setEditingPlan] = useState(false)
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    } catch {
      return null
    }
  })
  const [summary, setSummary] = useState(null)
  const [openEx, setOpenEx] = useState(null)

  useEffect(() => {
    ;(async () => {
      const since = addDays(t, -400)
      const [p, w, s, b] = await Promise.all([
        supabase.from('gym_plans').select('*').maybeSingle(),
        supabase.from('workouts').select('*').gte('day', since).order('day', { ascending: false }),
        supabase.from('workout_sets').select('*').order('created_at', { ascending: true }).limit(8000),
        supabase.from('body_weights').select('*').order('day', { ascending: true }),
      ])
      const err = p.error || w.error || s.error
      if (err) {
        setError(gymMissing(err) ? T(NEEDS_GYM_SQL) : err.message)
        setPlan(null)
        return
      }
      setPlan(p.data || null)
      setWorkouts(w.data || [])
      setSets(s.data || [])
      setWeights(b.error ? [] : b.data || [])
    })()
  }, [t])

  useEffect(() => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      else localStorage.removeItem(SESSION_KEY)
    } catch {
      /* fine */
    }
  }, [session])

  const history = useMemo(() => historyByExercise(workouts, sets), [workouts, sets])

  const savePlan = async (next) => {
    setError(null)
    const { data: u } = await supabase.auth.getUser()
    const row = { user_id: u.user.id, ...next, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('gym_plans').upsert(row).select().single()
    if (error) return setError(gymMissing(error) ? T(NEEDS_GYM_SQL) : error.message)
    setPlan(data)
    setEditingPlan(false)
  }

  const start = (w) =>
    setSession({
      workout: w,
      startedAt: new Date().toISOString(),
      idx: 0,
      sets: Object.fromEntries(
        w.items.map((it) => {
          const last = history.get(it.ex)?.last || []
          return [
            it.ex,
            Array.from({ length: it.sets }, (_, k) => ({
              reps: it.secs ? null : last[k]?.reps ?? last[0]?.reps ?? it.reps,
              weight: it.secs ? null : last[k]?.weight ?? last[0]?.weight ?? '',
              secs: it.secs || null,
              done: false,
            })),
          ]
        })
      ),
    })

  const finish = async () => {
    const s = session
    const done = Object.entries(s.sets).flatMap(([ex, arr]) => arr.map((x, k) => ({ ex, k, ...x })).filter((x) => x.done))
    if (!done.length) {
      setSession(null)
      return
    }
    const finished = new Date().toISOString()
    const { data: w, error } = await supabase
      .from('workouts')
      .insert({ day: t, program: plan?.program || '', workout_key: s.workout.key, title: s.workout.title, started_at: s.startedAt, finished_at: finished })
      .select()
      .single()
    if (error) return setError(gymMissing(error) ? T(NEEDS_GYM_SQL) : error.message)
    const rows = done.map((x) => ({
      workout_id: w.id,
      exercise_id: x.ex,
      set_no: x.k + 1,
      reps: x.secs ? null : Number(x.reps) || 0,
      weight: x.secs || x.weight === '' || x.weight == null ? null : Number(String(x.weight).replace(',', '.')) || 0,
      seconds: x.secs || null,
    }))
    const { data: saved, error: e2 } = await supabase.from('workout_sets').insert(rows).select()
    if (e2) setError(e2.message)
    // new personal bests
    const prs = []
    for (const r of rows) {
      const h = history.get(r.exercise_id)
      if (r.weight > 0 && (!h || r.weight > h.best) && !prs.some((p) => p.ex === r.exercise_id)) prs.push({ ex: r.exercise_id, weight: r.weight })
    }
    setWorkouts((ws) => [w, ...ws])
    setSets((ss) => [...ss, ...(saved || [])])
    setSummary({ title: s.workout.title, minutes: Math.max(1, Math.round((Date.parse(finished) - Date.parse(s.startedAt)) / 60000)), sets: rows.length, volume: volumeOf(rows), prs })
    setSession(null)
  }

  if (session) return <Session session={session} setSession={setSession} history={history} onFinish={finish} onOpenEx={setOpenEx} openEx={openEx} />

  return (
    <div className="page gym">
      <PageHeader title={T('Gym')} subtitle={T('Daily workouts with photos, step-by-step lessons and your progress')} />
      <ErrorBar error={error} onClose={() => setError(null)} />

      {plan === undefined ? (
        <div className="empty muted loading-text">{T('Loading…')}</div>
      ) : !plan || editingPlan ? (
        <PlanSetup plan={plan} onSave={savePlan} onCancel={plan ? () => setEditingPlan(false) : null} onOpenEx={setOpenEx} />
      ) : (
        <>
          {summary && <SummaryCard s={summary} onClose={() => setSummary(null)} />}
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'today', label: T('Today') },
              { value: 'progress', label: T('Progress') },
              { value: 'library', label: T('Exercises') },
            ]}
          />
          {tab === 'today' && <TodayTab plan={plan} workouts={workouts} today={t} onStart={start} onEditPlan={() => setEditingPlan(true)} onOpenEx={setOpenEx} />}
          {tab === 'progress' && (
            <ProgressTab
              plan={plan}
              workouts={workouts}
              sets={sets}
              weights={weights}
              history={history}
              today={t}
              setWorkouts={setWorkouts}
              setWeights={setWeights}
              setError={setError}
              onOpenEx={setOpenEx}
            />
          )}
          {tab === 'library' && <Library onOpenEx={setOpenEx} />}
        </>
      )}
      {openEx && <ExerciseSheet id={openEx} history={history} onClose={() => setOpenEx(null)} />}
    </div>
  )
}

/* ------------------------------ today ------------------------------ */

function TodayTab({ plan, workouts, today, onStart, onEditPlan, onOpenEx }) {
  const prog = programOf(plan.program)
  const next = nextWorkout(plan, workouts)
  const training = isTrainingDay(plan, today)
  const doneToday = workouts.filter((w) => w.day === today && w.finished_at)
  const target = (plan.days || []).length || 3
  const { streak, thisWeek } = weekStreak(workouts, today, target)
  const lesson = lessonOf(today)
  const [anyway, setAnyway] = useState(false)
  const monday = mondayOf(today)
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const show = training || anyway ? next : REST_DAY

  return (
    <>
      <Reveal as="section" className="card gym-week">
        <div className="gym-week__days">
          {week.map((d) => {
            const did = workouts.some((w) => w.day === d && w.finished_at)
            const planned = isTrainingDay(plan, d)
            return (
              <span key={d} className={`gym-day ${did ? 'is-done' : planned ? 'is-planned' : ''} ${d === today ? 'is-today' : ''}`}>
                <small>{dayName(parseDay(d).getDay(), 'narrow')}</small>
                <b>{did ? '✓' : planned ? '•' : ''}</b>
              </span>
            )
          })}
        </div>
        <p className="muted small">
          {T('{0} of {1} workouts this week', [thisWeek, target])}
          {streak > 1 ? ` · ${T('🔥 {0} weeks in a row', [streak])}` : ''}
        </p>
      </Reveal>

      {doneToday.length > 0 && (
        <p className="gym-done">{T('✓ Done today: {0}. Well done!', [doneToday.map((w) => w.title).join(', ')])}</p>
      )}

      {!show ? (
        <Reveal as="section" className="card">
          <p>{T('Add a workout to your plan to start.')}</p>
          <button type="button" className="btn btn--sm" onClick={onEditPlan}>
            {T('Build my workouts')}
          </button>
        </Reveal>
      ) : (
        <Reveal as="section" className="card gym-next">
          <div className="gym-next__head">
            <span className="gym-next__emoji" aria-hidden>
              {show.emoji}
            </span>
            <div>
              <span className="muted small">{training || anyway ? T('Today’s workout') : T('Rest day — a gentle stretch')}</span>
              <h2>{T(show.title)}</h2>
              <span className="muted small">{T('{0} exercises · about {1} min', [show.items.length, estimateMin(show)])}</span>
            </div>
          </div>
          <ul className="gym-items">
            {show.items.map((it, i) => (
              <li key={i}>
                <button type="button" className="gym-item" onClick={() => onOpenEx(it.ex)}>
                  <img src={photo(it.ex, 1)} alt="" loading="lazy" width="64" height="43" />
                  <span>
                    <strong>{exName(it.ex)}</strong>
                    <span className="muted small">{it.secs ? T('{0} × {1}s', [it.sets, it.secs]) : T('{0} × {1} reps', [it.sets, it.reps])}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn gym-start" onClick={() => onStart(show)}>
            {T('▶ Start workout')}
          </button>
          {!training && !anyway && next && (
            <button type="button" className="link small" onClick={() => setAnyway(true)}>
              {T('Train anyway: {0}', [T(next.title)])}
            </button>
          )}
        </Reveal>
      )}

      <Reveal as="section" className="card gym-lesson">
        <span className="gym-lesson__tag">{T('Lesson of the day')}</span>
        <strong>{T(lesson.t)}</strong>
        <p>{T(lesson.d)}</p>
      </Reveal>

      <p className="gym-plan muted small">
        {prog.icon} {T(prog.name)} · {(plan.days || []).map((d) => dayName(d)).join(', ')}
        {plan.remind && plan.remind_time ? ` · 🔔 ${plan.remind_time}` : ''} ·{' '}
        <button type="button" className="link small" onClick={onEditPlan}>
          {T('Change plan')}
        </button>
      </p>
    </>
  )
}

const estimateMin = (w) => Math.max(10, Math.round(w.items.reduce((a, it) => a + it.sets * ((it.secs || 40) + (it.rest || 60)), 0) / 60))

/* ------------------------------ the workout itself ------------------------------ */

function Session({ session, setSession, history, onFinish, onOpenEx, openEx }) {
  const { workout, idx } = session
  const item = workout.items[idx]
  const ex = EX.get(item.ex)
  const rows = session.sets[item.ex]
  const [rest, setRest] = useState(null) // { until, total }
  const [timer, setTimer] = useState(null) // timed set running: { k, until, total }
  const [, tick] = useState(0)
  const stopRef = useRef(null)
  const [showSteps, setShowSteps] = useState(true)

  useEffect(() => {
    if (!rest && !timer) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [rest, timer])
  // rest finished: a short sound
  useEffect(() => {
    if (rest && Date.now() >= rest.until) {
      setRest(null)
      try {
        stopRef.current = playSound('ping')
        setTimeout(() => stopRef.current?.(), 1500)
      } catch {
        /* fine */
      }
    }
    if (timer && Date.now() >= timer.until) {
      markDone(timer.k, true)
      setTimer(null)
    }
  })

  const update = (k, patch) =>
    setSession((s) => ({ ...s, sets: { ...s.sets, [item.ex]: s.sets[item.ex].map((x, i) => (i === k ? { ...x, ...patch } : x)) } }))
  const markDone = (k, done) => {
    update(k, { done })
    if (done && item.rest) setRest({ until: Date.now() + item.rest * 1000, total: item.rest })
  }
  const go = (by) => {
    setRest(null)
    setTimer(null)
    setSession((s) => ({ ...s, idx: Math.min(s.workout.items.length - 1, Math.max(0, s.idx + by)) }))
  }
  const doneCount = Object.values(session.sets).flat().filter((x) => x.done).length
  const total = Object.values(session.sets).flat().length
  const h = history.get(item.ex)
  const lastText = h?.last?.length
    ? h.last.map((x) => (x.seconds ? `${x.seconds}s` : `${x.reps}${Number(x.weight) ? `×${Number(x.weight)}` : ''}`)).join(', ')
    : null

  return (
    <div className="page gym-session">
      <div className="gym-session__top">
        <button
          type="button"
          className="link small"
          onClick={() => {
            if (!doneCount || window.confirm(T('Stop this workout without saving?'))) setSession(null)
          }}
        >
          {T('✕ Stop')}
        </button>
        <span className="muted small">
          {T('Exercise {0} of {1}', [idx + 1, workout.items.length])} · {T('{0}/{1} sets', [doneCount, total])}
        </span>
        <button type="button" className="btn btn--sm" onClick={onFinish}>
          {T('Finish')}
        </button>
      </div>
      <div className="gym-progress" aria-hidden>
        <span style={{ width: `${(doneCount / Math.max(1, total)) * 100}%` }} />
      </div>

      <section className="card gym-ex">
        <div className="gym-anim" role="img" aria-label={T('{0}: start and end position', [exName(item.ex)])}>
          <img src={photo(item.ex, 0)} alt="" />
          <img src={photo(item.ex, 1)} alt="" className="gym-anim__end" />
        </div>
        <h2>{exName(item.ex)}</h2>
        <p className="muted small">
          {(ex?.primary || []).map(muscleName).join(', ')}
          {ex?.equipment && ex.equipment !== 'none' && ex.equipment !== 'body only' ? ` · ${T(ex.equipment)}` : ''}
          {' · '}
          {item.secs ? T('{0} × {1}s', [item.sets, item.secs]) : T('{0} × {1} reps', [item.sets, item.reps])}
          {item.rest ? ` · ${T('rest {0}s', [item.rest])}` : ''}
        </p>
        {lastText && <p className="gym-last small">{Tr('Last time: {0}', <bdi dir="ltr">{lastText}</bdi>)}</p>}

        <button type="button" className="link small" onClick={() => setShowSteps(!showSteps)}>
          {showSteps ? T('Hide how to do it') : T('How to do it')}
        </button>
        {showSteps && (
          <ol className="gym-steps" dir="ltr">
            {(ex?.steps || []).map((st, i) => (
              <li key={i}>{st}</li>
            ))}
          </ol>
        )}

        <ul className="gym-sets">
          {rows.map((x, k) => (
            <li key={k} className={x.done ? 'is-done' : ''}>
              <span className="gym-sets__no">{k + 1}</span>
              {x.secs ? (
                <span className="gym-sets__timed">
                  {timer?.k === k ? (
                    <strong>{mmss((timer.until - Date.now()) / 1000)}</strong>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--sm" disabled={x.done || !!timer} onClick={() => setTimer({ k, until: Date.now() + x.secs * 1000, total: x.secs })}>
                      {T('▶ {0}s', [x.secs])}
                    </button>
                  )}
                </span>
              ) : (
                <>
                  <label className="gym-sets__field">
                    <input inputMode="numeric" aria-label={T('Reps')} value={x.reps ?? ''} onChange={(e) => update(k, { reps: e.target.value.replace(/\D/g, '') })} />
                    <span>{T('reps')}</span>
                  </label>
                  <label className="gym-sets__field">
                    <input inputMode="decimal" aria-label={T('Weight (kg)')} placeholder="—" value={x.weight ?? ''} onChange={(e) => update(k, { weight: e.target.value.replace(/[^\d.,]/g, '') })} />
                    <span>kg</span>
                  </label>
                </>
              )}
              <button type="button" className={`check ${x.done ? 'is-on' : ''}`} aria-pressed={x.done} aria-label={T('Set {0} done', [k + 1])} onClick={() => markDone(k, !x.done)}>
                {x.done ? '✓' : ''}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="link small"
          onClick={() => setSession((s) => ({ ...s, sets: { ...s.sets, [item.ex]: [...s.sets[item.ex], { ...s.sets[item.ex].at(-1), done: false }] } }))}
        >
          {T('+ Add a set')}
        </button>

        {rest && (
          <div className="gym-rest" role="timer" aria-live="polite">
            <span>{T('Rest')}</span>
            <strong>{mmss((rest.until - Date.now()) / 1000)}</strong>
            <span className="gym-rest__bar" aria-hidden>
              <span style={{ width: `${Math.max(0, ((rest.until - Date.now()) / 1000 / rest.total) * 100)}%` }} />
            </span>
            <button type="button" className="link small" onClick={() => setRest(null)}>
              {T('Skip')}
            </button>
          </div>
        )}
      </section>

      <div className="gym-nav">
        <button type="button" className="btn btn--ghost" disabled={idx === 0} onClick={() => go(-1)}>
          {isAr ? '→' : '←'} {T('Previous')}
        </button>
        {idx < workout.items.length - 1 ? (
          <button type="button" className="btn" onClick={() => go(1)}>
            {T('Next')} {isAr ? '←' : '→'}
          </button>
        ) : (
          <button type="button" className="btn" onClick={onFinish}>
            {T('✓ Finish workout')}
          </button>
        )}
      </div>
      <ul className="gym-upnext">
        {workout.items.map((it, i) => (
          <li key={i} className={i === idx ? 'is-on' : session.sets[it.ex].every((x) => x.done) ? 'is-done' : ''}>
            <button type="button" onClick={() => setSession((s) => ({ ...s, idx: i }))}>
              <img src={photo(it.ex, 0)} alt="" loading="lazy" />
              <span>{exName(it.ex)}</span>
            </button>
          </li>
        ))}
      </ul>
      {openEx && <ExerciseSheet id={openEx} history={history} onClose={() => onOpenEx(null)} />}
    </div>
  )
}

function SummaryCard({ s, onClose }) {
  return (
    <Reveal as="section" className="card gym-summary">
      <button type="button" className="icon-btn gym-summary__x" aria-label={T('Close')} onClick={onClose}>
        ×
      </button>
      <span className="gym-summary__icon" aria-hidden>
        🎉
      </span>
      <h2>{T('Workout done!')}</h2>
      <p>
        {T(s.title)} · {T('{0} min', [s.minutes])} · {T('{0} sets', [s.sets])}
        {s.volume ? ` · ${T('{0} kg lifted', [Math.round(s.volume)])}` : ''}
      </p>
      {s.prs.length > 0 && (
        <ul className="gym-prs">
          {s.prs.map((p) => (
            <li key={p.ex}>{T('🏆 New best: {0} — {1} kg', [exName(p.ex), p.weight])}</li>
          ))}
        </ul>
      )}
    </Reveal>
  )
}

/* ------------------------------ progress ------------------------------ */

function ProgressTab({ plan, workouts, sets, weights, history, today, setWorkouts, setWeights, setError, onOpenEx }) {
  const done = workouts.filter((w) => w.finished_at)
  const target = (plan.days || []).length || 3
  const { streak, thisWeek } = weekStreak(workouts, today, target)
  const month = today.slice(0, 7)
  const monthW = done.filter((w) => w.day.startsWith(month))
  const monthIds = new Set(monthW.map((w) => w.id))
  const monthVol = volumeOf(sets.filter((x) => monthIds.has(x.workout_id)))
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(mondayOf(today), (i - 11) * 7))
  const perWeek = weeks.map((m) => done.filter((w) => mondayOf(w.day) === m).length)
  const maxW = Math.max(target, ...perWeek)
  const records = [...history.entries()].filter(([, h]) => h.best > 0).sort((a, b) => b[1].count - a[1].count).slice(0, 12)
  const [open, setOpen] = useState(null)

  const removeWorkout = async (w) => {
    setWorkouts((ws) => ws.filter((x) => x.id !== w.id))
    const { error } = await supabase.from('workouts').delete().eq('id', w.id)
    if (error) setError(error.message)
  }

  return (
    <>
      <div className="review-kpis">
        <Kpi label={T('This week')} value={`${thisWeek}/${target}`} />
        <Kpi label={T('Weeks in a row')} value={streak} />
        <Kpi label={T('Workouts this month')} value={monthW.length} />
        <Kpi label={T('Lifted this month')} value={`${Math.round(monthVol).toLocaleString(LOCALE)} kg`} />
      </div>

      <Reveal as="section" className="card">
        <h2 className="faith-sec">{T('Workouts per week')}</h2>
        <div className="gym-bars" role="img" aria-label={T('Workouts per week, last 12 weeks')}>
          {perWeek.map((n, i) => (
            <span key={i} className={`gym-bars__bar ${n >= target ? 'is-good' : ''}`} style={{ height: `${(n / maxW) * 100}%` }} title={`${weeks[i]}: ${n}`}>
              {n ? <b>{n}</b> : null}
            </span>
          ))}
          <span className="gym-bars__goal" style={{ bottom: `${(target / maxW) * 100}%` }} aria-hidden />
        </div>
        <p className="muted small">{T('Last 12 weeks · dashed line = your goal of {0} a week', [target])}</p>
      </Reveal>

      {records.length > 0 && (
        <Reveal as="section" className="card">
          <h2 className="faith-sec">{T('Personal bests')}</h2>
          <ul className="gym-records">
            {records.map(([id, h]) => (
              <li key={id}>
                <button type="button" className="gym-item" onClick={() => onOpenEx(id)}>
                  <img src={photo(id, 1)} alt="" loading="lazy" width="64" height="43" />
                  <span>
                    <strong>{exName(id)}</strong>
                    <span className="muted small">
                      {T('Best {0} kg · about {1} kg for 1 rep', [h.best, Math.round(h.e1rm)])}
                      {h.firstBest && h.best > h.firstBest ? ` · ${T('+{0} kg since you started', [Math.round((h.best - h.firstBest) * 10) / 10])}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Reveal>
      )}

      <BodyWeight weights={weights} setWeights={setWeights} today={today} setError={setError} />

      <Reveal as="section" className="card">
        <h2 className="faith-sec">{T('History')}</h2>
        {done.length === 0 ? (
          <p className="muted small">{T('Your finished workouts will appear here.')}</p>
        ) : (
          <ul className="gym-history">
            {done.slice(0, 40).map((w) => {
              const ws = sets.filter((x) => x.workout_id === w.id)
              const mins = w.started_at && w.finished_at ? Math.round((Date.parse(w.finished_at) - Date.parse(w.started_at)) / 60000) : null
              return (
                <li key={w.id}>
                  <div className="gym-history__row">
                    <button type="button" className="gym-history__main" onClick={() => setOpen(open === w.id ? null : w.id)} aria-expanded={open === w.id}>
                      <strong>{T(w.title) || T('Workout')}</strong>
                      <span className="muted small">
                        {parseDay(w.day).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {mins ? ` · ${T('{0} min', [mins])}` : ''} · {T('{0} sets', [ws.length])}
                        {volumeOf(ws) ? ` · ${Math.round(volumeOf(ws))} kg` : ''}
                      </span>
                    </button>
                    <DeleteButton label={T('Delete this workout')} onClick={() => removeWorkout(w)} />
                  </div>
                  {open === w.id && (
                    <ul className="gym-history__sets">
                      {[...new Set(ws.map((x) => x.exercise_id))].map((id) => (
                        <li key={id}>
                          <strong>{exName(id)}</strong>{' '}
                          <span className="muted" dir="ltr">
                            {ws
                              .filter((x) => x.exercise_id === id)
                              .map((x) => (x.seconds ? `${x.seconds}s` : `${x.reps}${Number(x.weight) ? `×${Number(x.weight)}kg` : ''}`))
                              .join(', ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Reveal>

      <GymAi plan={plan} workouts={workouts} sets={sets} weights={weights} today={today} />
    </>
  )
}

function Kpi({ label, value }) {
  return (
    <div className="review-kpi">
      <span className="review-kpi__label">{label}</span>
      <strong className="review-kpi__value">{value}</strong>
    </div>
  )
}

function BodyWeight({ weights, setWeights, today, setError }) {
  const [kg, setKg] = useState('')
  const save = async (e) => {
    e.preventDefault()
    const n = Number(String(kg).replace(',', '.'))
    if (!(n >= 20 && n <= 400)) return setError(T('Enter your weight in kg (20–400).'))
    const { data, error } = await supabase.from('body_weights').upsert({ day: today, kg: n }, { onConflict: 'user_id,day' }).select().single()
    if (error) return setError(gymMissing(error) ? T(NEEDS_GYM_SQL) : error.message)
    setWeights((ws) => [...ws.filter((x) => x.day !== today), data].sort((a, b) => (a.day < b.day ? -1 : 1)))
    setKg('')
  }
  const pts = weights.slice(-30)
  const W = 320
  const H = 90
  const min = Math.min(...pts.map((x) => Number(x.kg))) - 1
  const max = Math.max(...pts.map((x) => Number(x.kg))) + 1
  const xy = (x, i) => [10 + (i / Math.max(1, pts.length - 1)) * (W - 20), 8 + (1 - (Number(x.kg) - min) / Math.max(0.5, max - min)) * (H - 16)]
  const first = pts[0]
  const last = pts.at(-1)
  return (
    <Reveal as="section" className="card">
      <h2 className="faith-sec">{T('Body weight')}</h2>
      {pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="gym-weight" role="img" aria-label={T('Body weight over time')}>
          <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" points={pts.map((x, i) => xy(x, i).join(',')).join(' ')} />
          {pts.map((x, i) => (
            <circle key={x.day} cx={xy(x, i)[0]} cy={xy(x, i)[1]} r="2.5" fill="currentColor" />
          ))}
        </svg>
      )}
      {last && (
        <p className="muted small">
          {T('Now {0} kg', [Number(last.kg)])}
          {first && first !== last ? ` · ${T('{0} kg since {1}', [`${Number(last.kg) - Number(first.kg) > 0 ? '+' : ''}${Math.round((Number(last.kg) - Number(first.kg)) * 10) / 10}`, parseDay(first.day).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })])}` : ''}
        </p>
      )}
      <form className="gym-weight-form" onSubmit={save}>
        <input inputMode="decimal" placeholder="kg" aria-label={T('Today’s weight in kg')} value={kg} onChange={(e) => setKg(e.target.value)} />
        <button className="btn btn--sm" disabled={!kg}>
          {T('Save today’s weight')}
        </button>
      </form>
    </Reveal>
  )
}

function GymAi({ plan, workouts, sets, weights, today }) {
  const pick = usePeriod('month')
  const { period } = pick
  const key = `gym-ai|${LANG}|${period.from}|${period.to}`
  const read = () => {
    try {
      return localStorage.getItem(key) || ''
    } catch {
      return ''
    }
  }
  const [text, setText] = useState(read)
  useEffect(() => setText(read()), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await callAi({ kind: 'gym', label: pick.label, from: period.from, to: period.to, today, summary: gymSummary(plan, workouts, sets, period, exName, weights) })
      setText(r.text)
      try {
        localStorage.setItem(key, r.text)
      } catch {
        /* fine */
      }
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }
  return (
    <>
      <h2 className="promise-report__title">{T('Progress report')}</h2>
      <PeriodPicker state={pick} />
      <Reveal as="section" className="card review-ai">
        <h2>{Tr('{0} AI coach', <AiCat />)}</h2>
        {!text && !busy && <p className="small">{T('The AI looks at your workouts, weights and consistency, and tells you what to lift next and how to keep improving.')}</p>}
        <button type="button" className="btn btn--sm" disabled={busy} onClick={run}>
          {text ? T('↻ Analyse again') : T('✦ Analyse my training')}
        </button>
        {busy && <div className="ai-loading">{T('Thinking…')}</div>}
        {err && <p className="error-text">{err}</p>}
        {text && !busy && <Markdown text={text} />}
      </Reveal>
    </>
  )
}

/* ------------------------------ exercise library ------------------------------ */

const MUSCLES = [...new Set(EXERCISES.flatMap((e) => e.primary))].sort()

function Library({ onOpenEx, onPick }) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const [kind, setKind] = useState('')
  const list = EXERCISES.filter(
    (e) =>
      (!q || e.name.toLowerCase().includes(q.toLowerCase())) &&
      (!muscle || e.primary.includes(muscle)) &&
      (!kind || (kind === 'none' ? ['body only', 'none'].includes(e.equipment) : kind === 'stretch' ? e.category === 'stretching' : e.equipment === kind))
  )
  return (
    <section className="gym-lib">
      <input dir="auto" className="gym-lib__search" placeholder={T('Search {0} exercises', [EXERCISES.length])} value={q} onChange={(e) => setQ(e.target.value)} aria-label={T('Search exercises')} />
      <div className="chips-row">
        {[
          ['', 'All'],
          ['none', 'No equipment'],
          ['dumbbell', 'Dumbbells'],
          ['barbell', 'Barbell'],
          ['machine', 'Machines'],
          ['cable', 'Cable'],
          ['stretch', 'Stretches'],
        ].map(([v, l]) => (
          <button key={v} type="button" className={`chip ${kind === v ? 'is-active chip--solid' : ''}`} onClick={() => setKind(v)}>
            {T(l)}
          </button>
        ))}
      </div>
      <select value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label={T('Muscle')}>
        <option value="">{T('All muscles')}</option>
        {MUSCLES.map((m) => (
          <option key={m} value={m}>
            {muscleName(m)}
          </option>
        ))}
      </select>
      <p className="muted small">{T('{0} exercises', [list.length])}</p>
      <ul className="gym-grid">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" className="gym-card" onClick={() => (onPick ? onPick(e.id) : onOpenEx(e.id))}>
              <img src={photo(e.id, 1)} alt="" loading="lazy" width="240" height="160" />
              <strong>{e.name}</strong>
              <span className="muted small">{e.primary.map(muscleName).join(', ')}</span>
              {onPick && <span className="gym-card__add">+</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ExerciseSheet({ id, history, onClose }) {
  const e = EX.get(id)
  const h = history.get(id)
  useEffect(() => {
    const k = (ev) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  if (!e) return null
  return (
    <div className="gym-sheet-back" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <section className="gym-sheet" role="dialog" aria-modal="true" aria-label={e.name}>
        <button type="button" className="icon-btn gym-sheet__x" aria-label={T('Close')} onClick={onClose}>
          ×
        </button>
        <div className="gym-anim">
          <img src={photo(id, 0)} alt="" />
          <img src={photo(id, 1)} alt="" className="gym-anim__end" />
        </div>
        <h2>{e.name}</h2>
        <p className="muted small">
          {e.primary.map(muscleName).join(', ')}
          {e.secondary.length ? ` (+ ${e.secondary.map(muscleName).join(', ')})` : ''} · {T(e.equipment)} · {T(e.level)}
        </p>
        {h && (
          <p className="gym-last small">
            {h.best ? T('Your best: {0} kg', [h.best]) : ''}
            {h.best && h.e1rm ? ` · ${T('about {0} kg for 1 rep', [Math.round(oneRepMax(h.best, h.last?.[0]?.reps || 1))])}` : ''}
            {` · ${T('done {0} times', [h.count])}`}
          </p>
        )}
        <h3>{T('How to do it')}</h3>
        <ol className="gym-steps" dir="ltr">
          {e.steps.map((st, i) => (
            <li key={i}>{st}</li>
          ))}
        </ol>
        <p className="muted small gym-credit">{T('Photos and steps: Free Exercise DB (public domain)')}</p>
      </section>
    </div>
  )
}

/* ------------------------------ plan ------------------------------ */

function PlanSetup({ plan, onSave, onCancel, onOpenEx }) {
  const [program, setProgram] = useState(plan?.program || 'home')
  const [days, setDays] = useState(plan?.days || programOf('home').days)
  const [time, setTime] = useState(plan?.remind_time || '')
  const [remind, setRemind] = useState(!!plan?.remind)
  const [routines, setRoutines] = useState(plan?.routines || [])
  const [picking, setPicking] = useState(null) // routine index we add an exercise to
  const [busy, setBusy] = useState(false)

  const choose = (k) => {
    setProgram(k)
    if (!plan) setDays(programOf(k).days)
  }
  const save = async () => {
    setBusy(true)
    await onSave({ program, days: [...days].sort(), remind_time: time || null, remind: !!time && remind, routines })
    setBusy(false)
  }
  const setRoutine = (i, patch) => setRoutines((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  if (picking !== null)
    return (
      <section className="card">
        <div className="faith-manage__head">
          <h2 className="faith-sec">{T('Add an exercise')}</h2>
          <button type="button" className="icon-btn" aria-label={T('Close')} onClick={() => setPicking(null)}>
            ×
          </button>
        </div>
        <Library
          onOpenEx={onOpenEx}
          onPick={(id) => {
            const stretch = EX.get(id)?.category === 'stretching'
            setRoutine(picking, { items: [...routines[picking].items, stretch ? { ex: id, sets: 2, secs: 30, rest: 15 } : { ex: id, sets: 3, reps: 10, rest: 75 }] })
            setPicking(null)
          }}
        />
      </section>
    )

  return (
    <Reveal as="section" className="card gym-setup">
      <h2>{plan ? T('Your plan') : T('Let’s set up your training')}</h2>
      <p className="muted small">{T('Pick a program. Each day you get a workout with photos and step-by-step instructions.')}</p>
      <div className="gym-programs">
        {PROGRAMS.map((p) => (
          <button key={p.key} type="button" className={`welcome-item ${program === p.key ? 'is-on' : ''}`} aria-pressed={program === p.key} onClick={() => choose(p.key)}>
            <span className="welcome-item__icon" aria-hidden>
              {p.icon}
            </span>
            <strong>{T(p.name)}</strong>
            <span className="welcome-item__hint">{T(p.hint)}</span>
            <span className="welcome-item__tick" aria-hidden>
              {program === p.key ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>

      {program === 'custom' && (
        <div className="gym-routines">
          {routines.map((r, i) => (
            <div key={i} className="gym-routine">
              <div className="gym-routine__head">
                <input dir="auto" maxLength={60} value={r.title} aria-label={T('Workout name')} onChange={(e) => setRoutine(i, { title: e.target.value })} />
                <DeleteButton label={T('Delete {0}', [r.title])} onClick={() => setRoutines((rs) => rs.filter((_, k) => k !== i))} />
              </div>
              <ul className="gym-routine__items">
                {r.items.map((it, j) => (
                  <li key={j}>
                    <img src={photo(it.ex, 1)} alt="" loading="lazy" width="48" height="32" />
                    <span className="gym-routine__name">{exName(it.ex)}</span>
                    <input inputMode="numeric" aria-label={T('Sets')} value={it.sets} onChange={(e) => setRoutine(i, { items: r.items.map((x, k) => (k === j ? { ...x, sets: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } : x)) })} />
                    <span>×</span>
                    <input
                      inputMode="numeric"
                      aria-label={it.secs ? T('Seconds') : T('Reps')}
                      value={it.secs || it.reps}
                      onChange={(e) => setRoutine(i, { items: r.items.map((x, k) => (k === j ? (x.secs ? { ...x, secs: Math.max(5, Number(e.target.value) || 5) } : { ...x, reps: Math.max(1, Number(e.target.value) || 1) }) : x)) })}
                    />
                    <span className="muted small">{it.secs ? 's' : T('reps')}</span>
                    <button type="button" className="icon-btn" aria-label={T('Remove')} onClick={() => setRoutine(i, { items: r.items.filter((_, k) => k !== j) })}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="link small" onClick={() => setPicking(i)}>
                {T('+ Add an exercise')}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setRoutines((rs) => [...rs, { key: `my-${Date.now().toString(36)}`, title: T('My workout {0}', [rs.length + 1]), emoji: '💪', items: [] }])}
          >
            {T('+ New workout')}
          </button>
        </div>
      )}

      <div className="field">
        <span>{T('Training days')}</span>
        <div className="faith-days">
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" className={days.includes(d) ? 'is-on' : ''} aria-pressed={days.includes(d)} onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>
              {dayName(d)}
            </button>
          ))}
        </div>
      </div>
      <div className="row-2">
        <label className="field">
          <span>{T('Reminder time (optional)')}</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="faith-remind">
          <input type="checkbox" className="rem-switch" checked={remind && !!time} disabled={!time} onChange={(e) => setRemind(e.target.checked)} />
          <span>{T('Remind me on training days')}</span>
        </label>
      </div>
      <p className="muted small">{T('Not medical advice. If you have an injury or a health condition, check with a doctor before starting.')}</p>
      <div className="form-foot form-foot--end">
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {T('Cancel')}
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={busy || !days.length || (program === 'custom' && !routines.some((r) => r.items.length))}
          onClick={save}
        >
          {busy ? '…' : plan ? T('Save') : T('Start training')}
        </button>
      </div>
    </Reveal>
  )
}
