import { useEffect, useRef } from 'react'

/** A line you type into. The caret is drawn rather than the browser's, to match everything else. */
export function Prompt({
  label,
  hint,
  digits,
  max,
  value,
  onChange,
  onDone,
  onCancel,
}: {
  label: string
  /** What a valid answer looks like, standing where the answer will go. */
  hint: string
  /** Numbers only, for the lines that are asking for one. */
  digits?: boolean
  max?: number
  value: string
  onChange: (value: string) => void
  onDone: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <p className="term-input">
      <span className="term-input-label">{label}&gt;</span>
      <input
        ref={ref}
        value={value}
        inputMode={digits ? 'numeric' : 'text'}
        maxLength={max}
        spellCheck={false}
        style={{ width: `${Math.max(1, Math.min(value.length, 48))}ch` }}
        onChange={(e) => onChange(digits ? e.target.value.replace(/[^\d]/g, '') : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <span className="term-cursor" aria-hidden="true" />
      {!value && <span className="term-hint">{hint}</span>}
    </p>
  )
}
