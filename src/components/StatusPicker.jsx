// brown = not yet, blue = learning, green = memorized
import { T } from '../lib/i18n'
export const STATUSES = [
  { value: 'new', label: T("Not yet") },
  { value: 'learning', label: T("Learning") },
  { value: 'memorized', label: T("Memorized") },
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

