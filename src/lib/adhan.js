/**
 * Your own adhan recording(s), kept on this phone (IndexedDB), used for prayer reminders when you pick "Adhan".
 * Two slots: 'adhan' (all prayers) and 'adhan-fajr' (optional, used for Fajr only).
 */
import { getAppAdhan } from './appAdhan'

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

/**
 * Built-in adhan recordings, ready for everyone. They stream from Wikimedia Commons, which only hosts freely licensed files
 * (author and licence on each file page, linked from the Reminders page). Each one tries an mp3 copy first (plays on every phone),
 * then the original file.
 */
const WM = 'https://upload.wikimedia.org/wikipedia/commons'
export const BUILTIN_ADHANS = {
  adhan: {
    label: 'Adhan 1',
    page: 'https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg',
    sources: [
      `${WM}/transcoded/b/b0/Beautiful_adhan.ogg/Beautiful_adhan.ogg.mp3`,
      `${WM}/b/b0/Beautiful_adhan.ogg`,
      'https://commons.wikimedia.org/wiki/Special:FilePath/Beautiful_adhan.ogg',
    ],
  },
  adhan2: {
    label: 'Adhan 2',
    page: 'https://commons.wikimedia.org/wiki/File:Adhan_wiki.oga',
    sources: [
      `${WM}/transcoded/1/16/Adhan_wiki.oga/Adhan_wiki.oga.mp3`,
      `${WM}/1/16/Adhan_wiki.oga`,
      'https://commons.wikimedia.org/wiki/Special:FilePath/Adhan_wiki.oga',
    ],
  },
}
BUILTIN_ADHANS.adhan1 = BUILTIN_ADHANS.adhan // Adhan 1 by name, even when the app adhan takes the default spot
export const isAdhan = (id) => ['adhan', 'adhan1', 'adhan2', 'adhan-mine'].includes(id)

/** Plays audio from the first source that works. Resolves to stop(), or null if none could play. */
function playFirst(sources, onEnd) {
  return new Promise((resolve) => {
    let i = 0
    let audio = null
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      audio?.pause()
      onEnd?.()
    }
    const next = () => {
      if (i >= sources.length) return resolve(null)
      audio = new Audio(sources[i++])
      audio.preload = 'auto'
      audio.addEventListener('error', next, { once: true })
      audio.addEventListener('ended', stop, { once: true })
      audio.play().then(() => resolve(stop)).catch((e) => {
        // blocked autoplay is not "missing": keep the element so it plays as soon as the browser allows
        if (e?.name === 'NotAllowedError') resolve(stop)
        else next()
      })
    }
    next()
  })
}

/** Your own recording (Fajr's own one for Fajr, if you added it). Resolves to stop(), or null if none is saved. */
async function playMine(prayer) {
  const rec = (prayer === 'fajr' && (await getAdhan('adhan-fajr'))) || (await getAdhan('adhan'))
  if (!rec?.blob) return null
  const url = URL.createObjectURL(rec.blob)
  return playFirst([url], () => URL.revokeObjectURL(url))
}

/**
 * Plays the adhan you picked: 'adhan' / 'adhan2' (built in) or 'adhan-mine' (your recording).
 * Falls back to the other choices if one can't play (e.g. offline). Resolves to stop(), or null if nothing could play.
 */
export async function playAdhan(prayer, choice = 'adhan') {
  if (choice === 'adhan-mine') return (await playMine(prayer)) || playFirst(BUILTIN_ADHANS.adhan.sources)
  // "adhan" (the default) = the app adhan when the owner has uploaded one, otherwise Adhan 1
  const app = choice === 'adhan' ? await getAppAdhan() : null
  const first = BUILTIN_ADHANS[choice] || BUILTIN_ADHANS.adhan
  return (await playFirst([...(app ? [app.url] : []), ...first.sources])) || (await playMine(prayer))
}
