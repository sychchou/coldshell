import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { BackIcon, ResetIcon } from '../icons'

/**
 * One command under the window. The terminal itself only ever prints; everything you can do is
 * a chip, so a view switch and a transaction can never look like the same thing.
 */
export type Chip = {
  key: string
  label: string
  onClick?: () => void
  /** External link; shown with an arrow so leaving the site is never a surprise. */
  href?: string
  disabled?: boolean
  /** 'yes' and 'no' answer a question the terminal just printed. */
  tone?: 'yes' | 'no'
}

/** What the command bar offers right now: the commands, and how to take one back. */
export type Commands = { chips: Chip[]; back?: () => void }

const CommandContext = createContext<(commands: Commands) => void>(() => {})

export function ChipProvider({ value, children }: { value: (commands: Commands) => void; children: ReactNode }) {
  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
}

/**
 * A pane declares its commands. Hidden panes stay mounted so their output survives a trip to
 * another tab, and `active` is what keeps them from fighting over the command bar.
 */
export function useCommands(commands: Commands, deps: unknown[], active = true) {
  const setCommands = useContext(CommandContext)
  useEffect(() => {
    if (!active) return
    setCommands(commands)
    return () => setCommands({ chips: [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, active])
}

/**
 * Scrolls the output to the newest line when something new is printed. It deliberately does
 * nothing on the first run: opening a tab should show the top of its output, not the bottom.
 */
export function useScrollOutput(deps: unknown[]) {
  const printed = useRef(false)
  useEffect(() => {
    if (!printed.current) {
      printed.current = true
      return
    }
    const out = document.querySelector('.term-out')
    out?.scrollTo({ top: out.scrollHeight, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Back on the left, the session's own reset on the right, the commands in between. */
export function ChipBar({ commands, onReset }: { commands: Commands; onReset: () => void }) {
  const { chips, back } = commands

  const bar = useRef<HTMLDivElement>(null)

  /**
   * Enter presses whatever is green.
   *
   * It clicks the element rather than calling the handler, because some chips are links and
   * calling their handler alone would mark the rules as read without opening them — which is
   * the one thing that step exists to prevent.
   *
   * Not while typing: a line being written has its own idea of what Enter means.
   */
  useEffect(() => {
    const go = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const green = chips.find((chip) => chip.tone === 'yes' && !chip.disabled)
      if (!green) return
      const element = bar.current?.querySelector<HTMLElement>(`[data-chip="${green.key}"]`)
      if (!element) return
      event.preventDefault()
      element.click()
    }
    window.addEventListener('keydown', go)
    return () => window.removeEventListener('keydown', go)
  }, [chips])

  return (
    <div className="chip-bar" ref={bar}>
      <button
        type="button"
        className="chip chip-fixed"
        title="Undo the last command"
        aria-label="Undo the last command"
        disabled={!back}
        onClick={back}
      >
        <BackIcon />
      </button>
      <span className="chip-commands">
        {chips.map((chip) =>
          chip.href ? (
            <a
              key={chip.key}
              data-chip={chip.key}
              className="chip"
              href={chip.href}
              target="_blank"
              rel="noopener noreferrer"
              data-tone={chip.tone}
              onClick={chip.onClick}
            >
              {chip.label} ↗
            </a>
          ) : (
            <button
              key={chip.key}
              data-chip={chip.key}
              type="button"
              className="chip"
              data-tone={chip.tone}
              disabled={chip.disabled}
              onClick={chip.onClick}
            >
              {chip.label}
            </button>
          ),
        )}
      </span>
      <button
        type="button"
        className="chip chip-fixed"
        title="Start a fresh session"
        aria-label="Start a fresh session"
        onClick={onReset}
      >
        <ResetIcon />
      </button>
    </div>
  )
}
