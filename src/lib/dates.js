import { LOCALE, T } from './i18n'
const pad = (n) => String(n).padStart(2, '0')

/** Local date as YYYY-MM-DD */
export const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday of the current week */
export const startOfWeek = (d = new Date()) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)

export const today = () => ymd()
export const tomorrow = () => ymd(addDays(new Date(), 1))

export const dayLabel = (s) => {
  if (s === ymd()) return T('Today')
  if (s === tomorrow()) return T('Tomorrow')
  if (s === ymd(addDays(new Date(), -1))) return T('Yesterday')
  return parseYmd(s).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
}

const CURRENCY = import.meta.env.VITE_CURRENCY || 'GBP'

export const money = (n) => {
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(n)
  } catch {
    return `${Number(n).toFixed(2)} ${CURRENCY}`
  }
}
