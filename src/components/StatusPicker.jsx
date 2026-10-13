// brown = not yet, blue = learning, green = memorized
export const STATUSES = [
  { value: 'new', label: 'Not yet' },
  { value: 'learning', label: 'Learning' },
  { value: 'memorized', label: 'Memorized' },
]

export function StatusPicker({ value, onChange }) {
  return (
    <div className="status-pick">
      {STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`chip chip--${s.value} ${value === s.value ? 'is-active' : ''}`}
          onClick={() => onChange(s.value)}
        >
          <i className={`dot dot--${s.value}`} />
          {s.label}
        </button>
      ))}
    </div>
  )
}

