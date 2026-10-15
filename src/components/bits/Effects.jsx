import { useEffect, useRef } from 'react'

/**
 * Site-wide touches, in black and white:
 *  - ClickSpark: little lines burst out where you tap or click (React Bits "ClickSpark" style)
 *  - Spotlight: elements with class "spot" get a soft light that follows the pointer (React Bits "SpotlightCard" style)
 * Both switch off when the phone asks for reduced motion.
 */
export default function Effects() {
  const canvas = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const cv = canvas.current
    const ctx = cv.getContext('2d')
    let sparks = []
    let raf = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = () => {
      cv.width = window.innerWidth * dpr
      cv.height = window.innerHeight * dpr
      cv.style.width = `${window.innerWidth}px`
      cv.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    const color = () => getComputedStyle(document.body).color || '#0a0a0a'

    const draw = (now) => {
      ctx.clearRect(0, 0, cv.width, cv.height)
      sparks = sparks.filter((s) => now - s.t < 420)
      for (const s of sparks) {
        const p = (now - s.t) / 420
        const ease = p * (2 - p)
        const dist = ease * 22
        const len = 9 * (1 - ease)
        const x1 = s.x + Math.cos(s.a) * dist
        const y1 = s.y + Math.sin(s.a) * dist
        const x2 = s.x + Math.cos(s.a) * (dist + len)
        const y2 = s.y + Math.sin(s.a) * (dist + len)
        ctx.strokeStyle = s.c
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      raf = sparks.length ? requestAnimationFrame(draw) : 0
    }
    const onDown = (e) => {
      if (e.button > 0) return
      const t = performance.now()
      const c = color()
      for (let i = 0; i < 8; i++) sparks.push({ x: e.clientX, y: e.clientY, a: (Math.PI * 2 * i) / 8, t, c })
      if (!raf) raf = requestAnimationFrame(draw)
    }

    // spotlight: remember where the pointer is on the card under it
    const onMove = (e) => {
      const el = e.target.closest?.('.spot')
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`)
      el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }

    window.addEventListener('resize', size)
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', size)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return <canvas ref={canvas} className="click-spark" aria-hidden />
}
