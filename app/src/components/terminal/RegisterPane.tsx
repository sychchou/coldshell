import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  DAYS_PER_SHELL,
  MAX_SHELLS,
  MAX_STAKE_USDC,
  MIN_STAKE_USDC,
  RULES_URL,
  USDC_DECIMALS,
  explorerTxUrl,
} from '../../config'
import { enterTx, sendPrepared } from '../../lib/api'
import { mondayOfShell, startingShell } from '../../lib/shell'
import type { RunView } from '../../lib/useRun'
import { useCommands, useScrollOutput } from './chips'
import { Prompt } from './Prompt'
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

/** The dates a run of shells actually covers, because a shell number is not a date. */
function span(first: number, shells: number) {
  const day = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  const from = mondayOfShell(first)
  const to = new Date(mondayOfShell(first + shells).getTime() - 60_000)
  return `${day(from)} – ${day(to)}`
}

type Payment =
  | { kind: 'idle' }
  /** The last thing before the money moves: the terms, and whether they were read. */
  | { kind: 'agreeing' }
  | { kind: 'paying' }
  | { kind: 'paid'; signature: string; firstShell: number }
  | { kind: 'error'; message: string }

/** Where a stake is placed and a run of shells begins. */
export function RegisterPane({ active, run }: { active: boolean; run: RunView }) {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  // Shells start on Mondays, so a run paid for midweek begins on the next one.
  const first = startingShell()
  const [shells, setShells] = useState<Entry | null>(null)
  const [stake, setStake] = useState<Entry | null>(null)
  const [order, setOrder] = useState<Field[]>([])
  const [paid, setPaid] = useState<Payment>({ kind: 'idle' })
  // Agreeing to terms nobody opened is not agreement, so the y is not there until they are.
  const [read, setRead] = useState(false)

  const editing = shells?.editing || stake?.editing
  const shellsDone = shells && !shells.editing ? Number(shells.value) : null
  const stakeDone = stake && !stake.editing ? Number(stake.value) : null
  const ready = shellsDone !== null && stakeDone !== null

  const open = (field: Field) => {
    setPaid({ kind: 'idle' })
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

  /**
   * The stake leaves the wallet here. The platform assembles the transaction and signs it as fee
   * payer, so the only thing this wallet needs is USDC — never SOL.
   */
  const pay = async () => {
    if (!publicKey || !signTransaction || shellsDone === null || stakeDone === null) return
    setPaid({ kind: 'paying' })
    try {
      const prepared = await enterTx(publicKey.toBase58(), shellsDone, stakeDone * 10 ** USDC_DECIMALS)
      const signature = await sendPrepared(connection, signTransaction, prepared)
      setPaid({ kind: 'paid', signature, firstShell: prepared.firstShell })
      await run.refresh()
    } catch (err) {
      setPaid({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
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
            {
              key: 'calendar',
              label: 'calendar',
              // The first thing worth doing is seeing which weeks are on offer.
              tone: !order.includes('calendar') ? ('yes' as const) : undefined,
              onClick: () => open('calendar'),
            },
            // Green is the next thing to do and only ever one thing: weeks, then stake, then
            // pay. A bar where everything is green says nothing about where to start.
            {
              key: 'shells',
              label: shellsDone === null ? 'weeks' : 'edit weeks',
              tone: order.includes('calendar') && shellsDone === null ? ('yes' as const) : undefined,
              onClick: () => open('shells'),
            },
            {
              key: 'stake',
              label: stakeDone === null ? 'stake' : 'edit stake',
              tone: shellsDone !== null && stakeDone === null ? ('yes' as const) : undefined,
              onClick: () => open('stake'),
            },
            ...(ready
              ? [
                  ...(paid.kind === 'agreeing'
                    ? [
                        {
                          key: 'rules',
                          label: 'rules',
                          href: RULES_URL,
                          tone: read ? undefined : ('yes' as const),
                          onClick: () => setRead(true),
                        },
                        { key: 'agree', label: 'y', tone: 'yes' as const, onClick: pay, disabled: !read },
                        {
                          key: 'decline',
                          label: 'n',
                          tone: 'no' as const,
                          onClick: () => setPaid({ kind: 'idle' }),
                        },
                      ]
                    : [
                        {
                          key: 'pay',
                          label: paid.kind === 'paying' ? 'paying…' : 'pay',
                          tone: 'yes' as const,
                          // Reading comes before paying, and the reading is one click away.
                          onClick: () => setPaid({ kind: 'agreeing' }),
                          disabled: !publicKey || paid.kind !== 'idle' || Boolean(run.run),
                        },
                      ]),
                ]
              : []),
          ],
      back: order.length > 0 ? () => cancel(order[order.length - 1]) : undefined,
    },
    [editing, shellsDone, stakeDone, ready, order.length, publicKey, paid.kind, read, run.run],
    active,
  )

  useScrollOutput([order, shellsDone, stakeDone, paid.kind, editing])

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
            digits
            hint={field === 'shells' ? `${MIN_SHELLS}–${MAX_SHELLS}` : `${MIN_STAKE}–${MAX_STAKE}`}
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
            · {shellsDone * DAYS_PER_SHELL} days ({span(first, shellsDone)})
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

      {paid.kind !== 'idle' && (
        <div className="term-entry">
          <p className="term-prompt">pay</p>
          {paid.kind === 'agreeing' && (
            <>
              <p className="term-line">
                {stakeDone !== null && shellsDone !== null
                  ? `$${stakeDone} for shell ${first}${shellsDone > 1 ? ` – ${first + shellsDone - 1}` : ''}. a week you finish comes back whole; a week with a day missing does not come back at all.`
                  : 'a week you finish comes back whole; a week with a day missing does not come back at all.'}
              </p>
              <p className="term-line">
                {read ? 'do you agree to them?' : 'the rules are short. read them and come back.'}
              </p>
              <p className="term-line term-dim">
                {read ? 'y — place the stake · n — not yet' : 'rules — open them · n — not yet'}
              </p>
            </>
          )}
          {paid.kind === 'paying' && (
            <p className="term-line term-dim">approve it in your wallet…</p>
          )}
          {paid.kind === 'error' && <p className="term-line term-bad">{paid.message}</p>}
          {paid.kind === 'paid' && (
            <>
              <p className="term-line">
                staked. your run begins in shell {paid.firstShell}.
              </p>
              <p className="term-line term-dim">
                <a href={explorerTxUrl(paid.signature)} target="_blank" rel="noreferrer">
                  {paid.signature.slice(0, 16)}…
                </a>
              </p>
            </>
          )}
        </div>
      )}
      {run.run && paid.kind === 'idle' && (
        <>
          <p className="term-line term-dim">
            this wallet is already in shell {run.run.firstShell}
            {run.run.shells > 1 && ` – ${run.run.firstShell + run.run.shells - 1}`}.
          </p>
          <p className="term-line term-dim">
            one run at a time, and a week off between them: the last week settles on the tuesday
            after it ends, and by then the next one has started. so the soonest another run can
            begin is the monday after that.
          </p>
        </>
      )}
      {ready && !publicKey && <p className="term-line term-bad">connect a wallet to pay.</p>}
    </>
  )
}
