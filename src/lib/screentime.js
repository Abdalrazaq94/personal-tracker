/** Helpers for Phone time (screen time read from Digital Wellbeing screenshots). */

/** 205 → "3h 25m", 45 → "45m", 0 → "0m" */
export function fmtMins(m) {
  const n = Math.max(0, Math.round(Number(m) || 0))
  const h = Math.floor(n / 60)
  const r = n % 60
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}

/** "3h 25m", "3:25", "205", "3h", "25 min" → minutes (or null) */
export function parseMins(text) {
  const t = String(text || '').trim().toLowerCase()
  if (!t) return null
  const colon = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (colon) return Number(colon[1]) * 60 + Number(colon[2])
  const h = /(\d+(?:[.,]\d+)?)\s*h/.exec(t)
  const m = /(\d+)\s*m/.exec(t)
  if (h || m) return Math.round((h ? Number(h[1].replace(',', '.')) * 60 : 0) + (m ? Number(m[1]) : 0))
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/** Makes a phone screenshot smaller before sending it to the AI (faster, cheaper). Returns { data, mime }. */
export async function shrinkImage(file, maxSide = 1600) {
  const asDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(new Error('Could not open that picture.'))
      r.readAsDataURL(blob)
    })
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return { data: dataUrl.split(',')[1], mime: 'image/jpeg' }
  } catch {
    // the browser can't draw this picture type (e.g. HEIC) — send it as it is
    const dataUrl = await asDataUrl(file)
    return { data: String(dataUrl).split(',')[1], mime: file.type || 'image/jpeg' }
  }
}

/** Two screenshots of the same day (e.g. the app list scrolled): keep the biggest numbers, join the app lists. */
export function mergeReads(a, b) {
  if (!a) return b
  if (!b) return a
  const apps = new Map()
  for (const x of [...(a.apps || []), ...(b.apps || [])]) {
    const k = x.name.toLowerCase()
    const old = apps.get(k)
    if (!old || x.minutes > old.minutes) apps.set(k, x)
  }
  return {
    date: a.date || b.date,
    total_minutes: Math.max(a.total_minutes || 0, b.total_minutes || 0),
    unlocks: Math.max(a.unlocks || 0, b.unlocks || 0) || null,
    apps: sortApps([...apps.values()]),
  }
}

export const sortApps = (apps) => [...(apps || [])].sort((x, y) => y.minutes - x.minutes)

/** Total minutes per app over several days, biggest first. */
export function appTotals(rows) {
  const m = new Map()
  for (const r of rows)
    for (const a of r.apps || []) {
      const k = a.name.toLowerCase()
      const old = m.get(k) || { name: a.name, minutes: 0, days: 0 }
      m.set(k, { name: old.name, minutes: old.minutes + a.minutes, days: old.days + 1 })
    }
  return [...m.values()].sort((x, y) => y.minutes - x.minutes)
}
