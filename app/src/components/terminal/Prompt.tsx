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
  // After whatever is already written, not before it: a line you are coming back to is a line
  // you meant to add to.
  useEffect(() => {
    const input = ref.current
    if (!input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }, [])
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
