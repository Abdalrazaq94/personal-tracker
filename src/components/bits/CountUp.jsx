import { useEffect, useRef, useState } from 'react'

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A number that counts up to its value (and glides when it changes). `format` turns the number into text. */
export default function CountUp({ to, format = (n) => Math.round(n), duration = 0.9 }) {
  const [shown, setShown] = useState(() => (reduced() ? to : 0))
  const from = useRef(shown)
  useEffect(() => {
    if (reduced()) {
      from.current = to
      setShown(to)
      return
    }
    const a = from.current
    const start = performance.now()
    let raf = 0
    const step = (now) => {
      const p = Math.min(1, (now - start) / (duration * 1000))
      const e = 1 - Math.pow(1 - p, 3) // ease out
      const v = a + (to - a) * e
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, duration])
  return <span className="count-up">{format(shown)}</span>
}
