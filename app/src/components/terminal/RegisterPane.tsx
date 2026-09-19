import { useEffect, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { DAYS_PER_SHELL, MAX_SHELLS, MAX_STAKE_USDC, MIN_STAKE_USDC } from '../../config'
import { startingShell } from '../../lib/shell'
import { useCommands, useScrollOutput } from './chips'
import { ShellCalendar } from './ShellCalendar'

// The bounds come out of the program, so the screen cannot promise terms it would then refuse.
const MIN_SHELLS = 1
const MIN_STAKE = MIN_STAKE_USDC
const MAX_STAKE = MAX_STAKE_USDC

type Field = 'calendar' | 'shells' | 'stake'

/** What has been typed for a field, and whether it is still being typed. */
type Entry = { value: string; editing: boolean }

function checkShells(value: string) {
  const n = Number(value)
  if (!/^\d+$/.test(value.trim())) return 'weeks has to be a whole number.'
  if (n < MIN_SHELLS || n > MAX_SHELLS) return `between ${MIN_SHELLS} and ${MAX_SHELLS} weeks.`
  return null
}

function checkStake(value: string) {
  const n = Number(value)
  if (!/^\d+$/.test(value.trim())) return 'stake has to be a whole number of dollars.'
  if (n < MIN_STAKE || n > MAX_STAKE) return `between $${MIN_STAKE} and $${MAX_STAKE}.`
  return null
}

/** A line you type into. The caret is drawn rather than the browser's, to match everything else. */
function Prompt({
  label,
  value,
  onChange,
  onDone,
  onCancel,
}: {
  label: string
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
        inputMode="numeric"
        spellCheck={false}
        style={{ width: `${Math.max(1, value.length)}ch` }}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <span className="term-cursor" aria-hidden="true" />
    </p>
  )
}

/** Where a stake is placed and a run of shells begins. */
export function RegisterPane({ active }: { active: boolean }) {
  const { publicKey } = useWallet()
  // Shells start on Mondays, so a run paid for midweek begins on the next one.
  const first = startingShell()
  const [shells, setShells] = useState<Entry | null>(null)
  const [stake, setStake] = useState<Entry | null>(null)
  const [order, setOrder] = useState<Field[]>([])
  const [paid, setPaid] = useState(false)

  const editing = shells?.editing || stake?.editing
  const shellsDone = shells && !shells.editing ? Number(shells.value) : null
  const stakeDone = stake && !stake.editing ? Number(stake.value) : null
  const ready = shellsDone !== null && stakeDone !== null

  const open = (field: Field) => {
    setPaid(false)
    if (field === 'calendar') {
      // Running a command again puts its output at the bottom, where it was just asked for.
      setOrder((current) => [...current.filter((f) => f !== 'calendar'), 'calendar'])
      return
    }
    setOrder((current) => (current.includes(field) ? current : [...current, field]))
    const entry = { value: '', editing: true }
    if (field === 'shells') setShells(entry)
    else setStake(entry)
  }

  const commit = (field: Field) => {
    const entry = field === 'shells' ? shells : stake
    if (!entry) return
    const problem = field === 'shells' ? checkShells(entry.value) : checkStake(entry.value)
    if (problem) return
    const done = { value: entry.value.trim(), editing: false }
    if (field === 'shells') setShells(done)
    else setStake(done)
  }

  const cancel = (field: Field) => {
    setOrder((current) => current.filter((f) => f !== field))
    if (field === 'shells') setShells(null)
    if (field === 'stake') setStake(null)
  }

  useCommands(
    {
      chips: editing
        ? []
        : [
            { key: 'calendar', label: 'calendar', onClick: () => open('calendar') },
            { key: 'shells', label: shellsDone === null ? 'weeks' : 'edit weeks', onClick: () => open('shells') },
            { key: 'stake', label: stakeDone === null ? 'stake' : 'edit stake', onClick: () => open('stake') },
            ...(ready
              ? [
                  {
                    key: 'pay',
                    label: 'pay',
                    tone: 'yes' as const,
                    onClick: () => setPaid(true),
                    disabled: !publicKey,
                  },
                ]
              : []),
          ],
      back: order.length > 0 ? () => cancel(order[order.length - 1]) : undefined,
    },
    [editing, shellsDone, stakeDone, ready, order.length, publicKey],
    active,
  )

  useScrollOutput([order, shellsDone, stakeDone, paid, editing])

  const block = (field: Field) => {
    if (field === 'calendar') return <ShellCalendar key="calendar" first={first} shells={shellsDone} />
    const entry = field === 'shells' ? shells : stake
    if (!entry) return null
    const label = field === 'shells' ? 'weeks' : 'stake'
    const problem = entry.editing ? null : field === 'shells' ? checkShells(entry.value) : checkStake(entry.value)
    return (
      <div className="term-entry" key={field}>
        <p className="term-prompt">{label}</p>
        {entry.editing ? (
          <Prompt
            label={label}
            value={entry.value}
            onChange={(value) =>
              field === 'shells' ? setShells({ value, editing: true }) : setStake({ value, editing: true })
            }
            onDone={() => commit(field)}
            onCancel={() => cancel(field)}
          />
        ) : (
          <p className="term-line term-dim">
            {label}&gt; {entry.value}
          </p>
        )}
        {problem && <p className="term-line term-bad">{problem}</p>}
        {!entry.editing && !problem && field === 'shells' && shellsDone !== null && (
          <p className="term-line">
            {shellsDone === 1
              ? `shell ${first}`
              : `shell ${first} – shell ${first + shellsDone - 1}`}{' '}
            · {shellsDone * DAYS_PER_SHELL} days
          </p>
        )}
        {!entry.editing && !problem && field === 'stake' && stakeDone !== null && (
          <p className="term-line">
            {shellsDone === null
              ? `$${stakeDone} staked. set the weeks to see the weekly split.`
              : `$${stakeDone} staked · $${(stakeDone / shellsDone).toFixed(2)} back for each week you finish`}
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <p className="term-prompt">register</p>
      <p className="term-line">a shell is one week. commit to between {MIN_SHELLS} and {MAX_SHELLS} of them.</p>
      <p className="term-line">
        stake anything from ${MIN_STAKE} to ${MAX_STAKE} — whatever would hurt to lose.
      </p>
      <p className="term-line">
        each week is settled on its own. finish one and that week&rsquo;s share comes back in full;
        miss a day and only that week is gone.
      </p>

      {order.map(block)}

      {paid && (
        <div className="term-entry">
          <p className="term-prompt">pay</p>
          <p className="term-line term-dim">
            nothing to pay into yet — the program comes next.
          </p>
        </div>
      )}
      {ready && !publicKey && <p className="term-line term-bad">connect a wallet to pay.</p>}
    </>
  )
}
