import { motion } from 'motion/react'

/** Words that arrive one after another, from blurred to sharp (React Bits "BlurText" style). */
export default function BlurText({ text, as = 'span', className = '', delay = 0.06, start = 0 }) {
  const Tag = motion[as] || motion.span
  const words = String(text).split(' ')
  return (
    <Tag className={`blur-text ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          aria-hidden
          className="blur-text__word"
          initial={{ opacity: 0, filter: 'blur(10px)', y: -8 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ duration: 0.5, delay: start + i * delay, ease: [0.22, 1, 0.36, 1] }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </Tag>
  )
}
