import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRows } from '../lib/useRows'
import { callAi } from '../lib/ai'
import { addDays, dayLabel, parseYmd, today, ymd } from '../lib/dates'
import { appTotals, fmtMins, mergeReads, parseMins, shrinkImage, sortApps } from '../lib/screentime'
import { ErrorBar, PageHeader } from '../components/ui'

const NEEDS_TABLE =
  'Phone time needs a small database update: in Supabase open SQL Editor, paste the file supabase/migrations/005_screen_time.sql and press Run. Then refresh this page.'
const missingTable = (e) => /screen_time|relation .* does not exist|schema cache/i.test(e || '')

export default function Phone() {
  const { rows, setRows, loading, error, setError, remove } = useRows('screen_time', { order: 'day' })
  const [picked, setPicked] = useState(null) // selected day (YYYY-MM-DD)
  const [draft, setDraft] = useState(null) // the form being checked before saving
  const [reading, setReading] = useState('')
  const [howOpen, setHowOpen] = useState(false)
  const fileRef = useRef(null)

  const byDay = useMemo(() => new Map(rows.map((r) => [r.day, r])), [rows])
  const latest = rows[0]?.day
  const day = picked || (byDay.has(today()) ? today() : latest) || today()
  const sel = byDay.get(day)

  // last 7 days ending on the selected day's week (always ends today)
  const week = useMemo(() => {
    const out = []
    for (let i = 6; i >= 0; i--) {
      const d = ymd(addDays(new Date(), -i))
      out.push({ day: d, row: byDay.get(d) })
    }
    return out
  }, [byDay])
  const weekRows = week.map((w) => w.row).filter(Boolean)
  const avg = weekRows.length ? Math.round(weekRows.reduce((t, r) => t + r.total_minutes, 0) / weekRows.length) : 0
  const prevWeek = useMemo(() => {
    const list = []
    for (let i = 13; i >= 7; i--) {
      const r = byDay.get(ymd(addDays(new Date(), -i)))
      if (r) list.push(r)
    }
    return list.length ? Math.round(list.reduce((t, r) => t + r.total_minutes, 0) / list.length) : null
  }, [byDay])
  const topWeek = appTotals(weekRows).slice(0, 6)

  /* ---------------- add from screenshots ---------------- */
  const onFiles = async (files) => {
    const list = [...(files || [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (!list.length) return
    setError(null)
    let merged = draft && draft.fromPhoto ? draft.read : null
    try {
      for (let i = 0; i < list.length; i++) {
        setReading(list.length > 1 ? `Reading screenshot ${i + 1} of ${list.length}…` : 'Reading your screenshot…')
        const { data, mime } = await shrinkImage(list[i])
        const read = await callAi({ kind: 'screentime', image: data, mime, today: today() }, { timeoutMs: 60000 })
        merged = mergeReads(merged, read)
      }
      setDraft(toDraft(merged, true))
    } catch (e) {
      setError(e.message)
    } finally {
      setReading('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    const total = parseMins(draft.total)
    if (total === null || total > 1440) return setError('Please enter the total time, for example 3h 25m.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day) || draft.day > today()) return setError('Please choose a day (not in the future).')
    const apps = sortApps(
      draft.apps
        .map((a) => ({ name: a.name.trim(), minutes: parseMins(a.time) }))
        .filter((a) => a.name && a.minutes !== null && a.minutes > 0)
    )
    const row = {
      day: draft.day,
      total_minutes: total,
      unlocks: draft.unlocks === '' ? null : Math.max(0, Math.round(Number(draft.unlocks)) || 0),
      apps,
      source: draft.fromPhoto ? 'photo' : '',
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('screen_time').upsert(row, { onConflict: 'user_id,day' }).select().single()
    if (error) return setError(error.message)
    setRows((r) => [data || row, ...r.filter((x) => x.day !== row.day)].sort((a, b) => (a.day < b.day ? 1 : -1)))
    setPicked(row.day)
    setDraft(null)
  }

  const shownError = missingTable(error) ? NEEDS_TABLE : error

  return (
    <div className="page">
      <PageHeader title="Phone time" subtitle="How long you used your phone, and on which apps" />
      <ErrorBar error={shownError} onClose={() => setError(null)} />

      {/* ---------------- add ---------------- */}
      {!draft && (
        <section className="card phone-add">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          {reading ? (
            <p className="phone-reading">{reading}</p>
          ) : (
            <>
              <div className="phone-add__row">
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  Add screenshot
                </button>
                <button className="btn btn--ghost" onClick={() => setDraft(toDraft({ date: today() }, false))}>
                  Type it in
                </button>
              </div>
              <button className="link small" onClick={() => setHowOpen((v) => !v)}>
                {howOpen ? 'Hide how to' : 'How do I take the screenshot?'}
              </button>
              {howOpen && <HowTo />}
            </>
          )}
        </section>
      )}

      {draft && (
        <DraftForm
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
          onMore={() => fileRef.current?.click()}
          reading={reading}
          fileInput={
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          }
        />
      )}

      {loading ? (
        <div className="empty muted">Loading…</div>
      ) : !rows.length ? (
        !draft && (
          <div className="empty">
            No phone time yet. Add a screenshot of Digital Wellbeing and it fills in by itself.
          </div>
        )
      ) : (
        <>
          {/* ---------------- the chosen day ---------------- */}
          <section className="card phone-day">
            <div className="phone-day__head">
              <div>
                <p className="muted small">{dayLabel(day)}</p>
                <p className="phone-big">{sel ? fmtMins(sel.total_minutes) : 'No data'}</p>
                {sel && (
                  <p className="muted small">
                    {avg ? compare(sel.total_minutes, avg) : ''}
                    {sel.unlocks ? `${avg ? ' · ' : ''}Unlocked ${sel.unlocks} times` : ''}
                  </p>
                )}
              </div>
              {sel && (
                <div className="phone-day__acts">
                  <button className="btn btn--ghost btn--sm" onClick={() => setDraft(toDraft(sel, false, true))}>
                    Edit
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Delete this day"
                    title="Delete this day"
                    onClick={() => window.confirm(`Delete phone time for ${dayLabel(day)}?`) && remove(sel.id)}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            {sel?.apps?.length > 0 ? <AppBars apps={sel.apps} total={sel.total_minutes} /> : sel && <p className="muted small">No apps listed for this day.</p>}
          </section>

          {/* ---------------- last 7 days ---------------- */}
          <section className="card">
            <div className="phone-sec">
              <h2>Last 7 days</h2>
              <span className="muted small">
                {avg ? `${fmtMins(avg)} a day` : ''}
                {avg && prevWeek ? ` · ${weekChange(avg, prevWeek)}` : ''}
              </span>
            </div>
            <WeekBars week={week} picked={day} onPick={setPicked} avg={avg} />
          </section>

          {topWeek.length > 0 && (
            <section className="card">
              <div className="phone-sec">
                <h2>Most used this week</h2>
              </div>
              <AppBars apps={topWeek} total={weekRows.reduce((t, r) => t + r.total_minutes, 0)} perDay={weekRows.length} />
            </section>
          )}

          {/* ---------------- older days ---------------- */}
          {rows.length > 7 && (
            <section className="card">
              <div className="phone-sec">
                <h2>All days</h2>
              </div>
              <ul className="phone-days">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button className={r.day === day ? 'is-on' : ''} onClick={() => setPicked(r.day)}>
                      <span>{dayLabel(r.day)}</span>
                      <strong>{fmtMins(r.total_minutes)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function toDraft(read, fromPhoto, editing = false) {
  return {
    fromPhoto,
    editing,
    read: fromPhoto ? read : null,
    day: read?.day || read?.date || today(),
    total: read?.total_minutes ? fmtMins(read.total_minutes) : '',
    unlocks: read?.unlocks ?? '',
    apps: (read?.apps || []).map((a) => ({ name: a.name, time: fmtMins(a.minutes) })),
    noDate: fromPhoto && !read?.date,
  }
}

const compare = (m, avg) => {
  const diff = m - avg
  if (Math.abs(diff) < 5) return 'About your daily average'
  return `${fmtMins(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than your average`
}
const weekChange = (avg, prev) => {
  const pct = Math.round(((avg - prev) / prev) * 100)
  if (Math.abs(pct) < 3) return 'same as the week before'
  return `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than the week before`
}

function AppBars({ apps, total, perDay }) {
  const list = sortApps(apps)
  const top = list[0]?.minutes || 1
  return (
    <ul className="phone-apps">
      {list.map((a) => (
        <li key={a.name}>
          <div className="phone-apps__row">
            <span dir="auto" className="phone-apps__name">
              {a.name}
            </span>
            <span className="phone-apps__time">
              {fmtMins(a.minutes)}
              {perDay > 1 && <span className="muted"> · {fmtMins(a.minutes / perDay)}/day</span>}
              {!perDay && total > 0 && <span className="muted"> · {Math.round((a.minutes / total) * 100)}%</span>}
            </span>
          </div>
          <div className="phone-apps__bar">
            <span style={{ width: `${Math.max(2, (a.minutes / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function WeekBars({ week, picked, onPick, avg }) {
  const max = Math.max(60, ...week.map((w) => w.row?.total_minutes || 0))
  const busiest = week.reduce((b, w) => ((w.row?.total_minutes || 0) > (b?.row?.total_minutes || 0) ? w : b), null)
  return (
    <div className="phone-week" role="list">
      {avg > 0 && (
        <div className="phone-week__avg" style={{ bottom: `calc(28px + ${(avg / max) * 140}px)` }}>
          <span>avg {fmtMins(avg)}</span>
        </div>
      )}
      {week.map((w) => {
        const m = w.row?.total_minutes || 0
        const d = parseYmd(w.day)
        return (
          <button
            key={w.day}
            role="listitem"
            className={`phone-week__col ${w.day === picked ? 'is-on' : ''} ${w.row ? '' : 'is-empty'}`}
            onClick={() => w.row && onPick(w.day)}
            title={`${dayLabel(w.day)}: ${w.row ? fmtMins(m) : 'no data'}`}
            aria-label={`${dayLabel(w.day)}: ${w.row ? fmtMins(m) : 'no data'}`}
          >
            <span className="phone-week__val">{w.row && (w === busiest || w.day === picked) ? fmtMins(m) : ''}</span>
            <span className="phone-week__bar" style={{ height: `${w.row ? Math.max(4, (m / max) * 140) : 4}px` }} />
            <span className="phone-week__day">{d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</span>
          </button>
        )
      })}
    </div>
  )
}

function DraftForm({ draft, setDraft, onSave, onCancel, onMore, reading, fileInput }) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setApp = (i, patch) => set({ apps: draft.apps.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  return (
    <section className="card phone-form">
      {fileInput}
      <h2>{draft.fromPhoto ? 'Check what the AI read' : draft.editing ? 'Edit this day' : 'Type in your phone time'}</h2>
      {draft.fromPhoto && (
        <p className="muted small">
          Fix anything that looks wrong, then save.{draft.noDate ? ' The screenshot didn’t show the day, so check the date.' : ''}
        </p>
      )}
      <div className="row-2">
        <label className="field">
          <span>Day</span>
          <input type="date" max={today()} value={draft.day} onChange={(e) => set({ day: e.target.value })} />
        </label>
        <label className="field">
          <span>Total time</span>
          <input placeholder="3h 25m" value={draft.total} onChange={(e) => set({ total: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Unlocks (optional)</span>
        <input inputMode="numeric" placeholder="e.g. 64" value={draft.unlocks} onChange={(e) => set({ unlocks: e.target.value.replace(/\D/g, '') })} />
      </label>

      <div className="field">
        <span>Apps</span>
        <ul className="phone-form__apps">
          {draft.apps.map((a, i) => (
            <li key={i}>
              <input dir="auto" placeholder="App" value={a.name} onChange={(e) => setApp(i, { name: e.target.value })} />
              <input placeholder="45m" value={a.time} onChange={(e) => setApp(i, { time: e.target.value })} />
              <button className="icon-btn" aria-label="Remove app" onClick={() => set({ apps: draft.apps.filter((_, j) => j !== i) })}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <button className="link small phone-form__add" onClick={() => set({ apps: [...draft.apps, { name: '', time: '' }] })}>
          + Add an app
        </button>
      </div>

      {reading && <p className="phone-reading">{reading}</p>}
      <div className="phone-form__acts">
        <button className="btn" onClick={onSave} disabled={!!reading}>
          Save
        </button>
        <button className="btn btn--ghost" onClick={onMore} disabled={!!reading}>
          {draft.fromPhoto ? 'Add another screenshot' : 'Read from a screenshot'}
        </button>
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

function HowTo() {
  return (
    <ol className="phone-how">
      <li>
        On your Android phone open <strong>Settings → Digital Wellbeing &amp; parental controls</strong> (or search “Digital Wellbeing” in
        Settings).
      </li>
      <li>You’ll see today’s screen time and your apps. Take a screenshot (press <strong>Power + Volume down</strong>).</li>
      <li>More apps below? Scroll down and take another screenshot. Add both together.</li>
      <li>For yesterday, tap the chart, choose yesterday’s bar, and screenshot that.</li>
      <li>Here, tap <strong>Add screenshot</strong> and pick the pictures. The AI reads them; you check and save.</li>
    </ol>
  )
}
