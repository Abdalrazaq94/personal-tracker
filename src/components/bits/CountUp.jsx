import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/** A number that counts up to its value (and glides when it changes). `format` turns the number into text. */
export default function CountUp({ to, format = (n) => Math.round(n), duration = 0.9 }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? to : 0)
  const from = useRef(reduce ? to : 0)
  useEffect(() => {
    if (reduce) {
      setShown(to)
      return
    }
    const c = animate(from.current, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        from.current = v
        setShown(v)
      },
    })
    return () => c.stop()
  }, [to, duration, reduce])
  return <span className="count-up">{format(shown)}</span>
}
