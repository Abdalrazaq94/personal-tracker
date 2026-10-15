import { motion } from 'motion/react'

/** Fades and lifts its content in when it scrolls into view (React Bits "AnimatedContent" style). */
export default function Reveal({ children, delay = 0, y = 18, as = 'div', className, ...rest }) {
  const Tag = motion[as] || motion.div
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
