/** Words that arrive one after another, from blurred to sharp (React Bits "BlurText" style) — pure CSS, no library. */
export default function BlurText({ text, as: Tag = 'span', className = '', delay = 0.06, start = 0 }) {
  const words = String(text).split(' ')
  return (
    <Tag className={`blur-text ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} aria-hidden className="blur-text__word" style={{ animationDelay: `${start + i * delay}s` }}>
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  )
}
