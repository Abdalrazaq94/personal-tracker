/** Prayer times, calculated on this device with the open-source "adhan" library (no paid service). */
import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan'
import { isAr, T, LOCALE } from './i18n'

export const PRAYERS = [
  { key: 'fajr', name: 'Fajr', ar: 'الفجر' },
  { key: 'dhuhr', name: 'Dhuhr', ar: 'الظهر' },
  { key: 'asr', name: 'Asr', ar: 'العصر' },
  { key: 'maghrib', name: 'Maghrib', ar: 'المغرب' },
  { key: 'isha', name: 'Isha', ar: 'العشاء' },
]

export const METHODS = [
  { key: 'MoonsightingCommittee', label: T("Moonsighting Committee (UK & US)") },
  { key: 'MuslimWorldLeague', label: T("Muslim World League") },
  { key: 'NorthAmerica', label: T("ISNA (North America)") },
  { key: 'Egyptian', label: T("Egyptian Authority") },
  { key: 'Karachi', label: T("Karachi (University of Islamic Sciences)") },
  { key: 'UmmAlQura', label: T("Umm al-Qura (Makkah)") },
  { key: 'Dubai', label: T("Dubai") },
  { key: 'Qatar', label: T("Qatar") },
  { key: 'Kuwait', label: T("Kuwait") },
  { key: 'Turkey', label: T("Turkey (Diyanet)") },
  { key: 'Singapore', label: T("Singapore") },
  { key: 'Tehran', label: T("Tehran") },
]

export const DEFAULT_PLACE = null // the user picks a city the first time

/** The 5 prayer times (plus sunrise) for a place on a given calendar day (YYYY-MM-DD, the place's own date). */
export function timesFor(place, day) {
  const [y, m, d] = day.split('-').map(Number)
  const coords = new Coordinates(place.lat, place.lon)
  const make = CalculationMethod[place.method] || CalculationMethod.MoonsightingCommittee
  const params = make()
  params.madhab = place.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi
  params.highLatitudeRule = HighLatitudeRule.recommended(coords) // keeps Fajr/Isha sensible in Scotland in summer
  const t = new PrayerTimes(coords, new Date(y, m - 1, d), params)
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha }
}

/** "13:08" in the place's own time zone. */
export function clock(date, tz) {
  try {
    return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: tz || undefined })
  } catch {
    return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
  }
}

/** Today's date (YYYY-MM-DD) in the place's time zone. */
export function placeToday(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
    const get = (t) => parts.find((p) => p.type === t)?.value
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/** The next prayer from now, with how long until it. */
export function nextPrayer(place, today) {
  const now = Date.now()
  const t = timesFor(place, today)
  for (const p of PRAYERS) if (t[p.key].getTime() > now) return { ...p, at: t[p.key], inMs: t[p.key].getTime() - now }
  // after Isha: tomorrow's Fajr
  const [y, m, d] = today.split('-').map(Number)
  const tm = new Date(y, m - 1, d + 1)
  const next = `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, '0')}-${String(tm.getDate()).padStart(2, '0')}`
  const f = timesFor(place, next).fajr
  return { ...PRAYERS[0], at: f, inMs: f.getTime() - now, tomorrow: true }
}

/** Which prayer's time is running now (it has started and the next one hasn't). */
export function currentPrayer(place, today) {
  const now = Date.now()
  const t = timesFor(place, today)
  let cur = null
  for (const p of PRAYERS) if (t[p.key].getTime() <= now) cur = p.key
  return cur
}

export const inWords = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(m / 60)
  return h ? T('{0}h {1}m', [h, m % 60]) : T('{0}m', [m])
}

/** The prayer's name in the app's language (Fajr / الفجر). */
export const prayerName = (p) => (isAr ? p.ar : p.name)

/** Islamic (Hijri) date, e.g. "22 Rabiʻ II 1448". */
export function hijri(day) {
  const [y, m, d] = day.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat(isAr ? 'ar-u-ca-islamic-umalqura-nu-latn' : 'en-GB-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(y, m - 1, d, 12))
      .replace(/\s?(AH|هـ)$/, '');
  } catch {
    return ''
  }
}

/** City search (free, no key): Open-Meteo geocoding. */
export async function findPlaces(query) {
  const q = query.trim()
  if (q.length < 2) return []
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(T("City search is not available right now. Try “Use my location”."))
  const out = await res.json()
  return (out.results || []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone,
  }))
}
