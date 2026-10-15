/**
 * Your own adhan recording(s), kept on this phone (IndexedDB), used for prayer reminders when you pick "Adhan".
 * Two slots: 'adhan' (all prayers) and 'adhan-fajr' (optional, used for Fajr only).
 */
const DB = 'tracker-sounds'
const STORE = 'files'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const r = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(r?.result)
    t.onerror = () => reject(t.error)
  })
}

/** Saves a chosen audio file. Returns { name, size }. */
export async function saveAdhan(slot, file) {
  if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|wav|opus)$/i.test(file.name)) throw new Error('Please choose an audio file (mp3, m4a, ogg or wav).')
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is too big (over 25 MB).')
  const rec = { name: file.name, size: file.size, type: file.type || 'audio/mpeg', blob: file }
  await tx('readwrite', (s) => s.put(rec, slot))
  return { name: rec.name, size: rec.size }
}
export const getAdhan = (slot) => tx('readonly', (s) => s.get(slot)).catch(() => null)
export const removeAdhan = (slot) => tx('readwrite', (s) => s.delete(slot))

/** Plays your adhan (Fajr's own one for Fajr, if you added it). Returns stop(), or null if no file is saved. */
export async function playAdhan(prayer) {
  const rec = (prayer === 'fajr' && (await getAdhan('adhan-fajr'))) || (await getAdhan('adhan'))
  if (!rec?.blob) return null
  const url = URL.createObjectURL(rec.blob)
  const audio = new Audio(url)
  audio.play().catch(() => {})
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    audio.pause()
    URL.revokeObjectURL(url)
  }
  audio.addEventListener('ended', stop)
  return stop
}
