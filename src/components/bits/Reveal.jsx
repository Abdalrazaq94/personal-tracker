import { createElement, useEffect, useRef, useState } from 'react'

/** Fades and lifts its content in when it scrolls into view (React Bits "AnimatedContent" style) — no library. */
export default function Reveal({ children, delay = 0, as = 'div', className = '', style, ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return setShown(true)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -40px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return createElement(
    as,
    { ref, className: `reveal ${shown ? 'is-shown' : ''} ${className}`.trim(), style: delay ? { ...style, transitionDelay: `${delay}s` } : style, ...rest },
    children
  )
}
