import { useEffect, useMemo, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  DAYS_PER_SHELL,
  DAY_MS,
  MAX_SHELLS,
  MAX_STAKE_USDC,
  MIN_STAKE_USDC,
  NETWORK_LABEL,
  RPC_ENDPOINT,
  RECORD_EARLY_MS,
  RECORD_LATE_MS,
  CLAIM_WINDOW_MS,
  SHORT_CLOCK,
  TREASURY,
  USDC_MINT,
  explorerUrl,
} from '../config'
import { PROGRAM_ID, usdcAta, vaultAta } from '../lib/program'
import {
  claimDeadline,
  closable,
  closeIx,
  fetchRun,
  fetchRuns,
  currentShell,
  shellComplete,
  shellDays,
  shellEnd,
  shellSettles,
  shellStart,
  shellState,
  share,
  sweepIx,
  sweepable,
  type Run,
  type ShellState,
} from '../lib/runs'
import { startingShell, today, untilNextDay } from '../lib/shell'

type Kind = 'cmd' | 'out' | 'dim' | 'ok' | 'bad'
type Line = { id: number; kind: Kind; text: string; href?: string }

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const HEADS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const pad = (n: number) => String(n).padStart(2, '0')
const usd = (base: bigint | number) => `$${(Number(base) / 1e6).toFixed(2)}`
const short = (key: PublicKey | string) => {
  const s = key.toString()
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

/**
 * Everything the program decides, it decides in UTC. The site shows people their own local day
 * on purpose, but in here that would only make two clocks to confuse — so every moment below is
 * the chain's.
 */
function when(ms: number) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function stamp(ms: number) {
  const d = new Date(ms)
  return `${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function local(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function span(ms: number) {
  if (ms <= 0) return 'now'
  const units: [number, string][] = [[86_400_000, 'd'], [3_600_000, 'h'], [60_000, 'm'], [1000, 's']]
  const parts: string[] = []
  let left = ms
  for (const [size, label] of units) {
    const n = Math.floor(left / size)
    left -= n * size
    if (n) parts.push(`${n}${label}`)
  }
  return parts.slice(0, 2).join(' ') || '0s'
}

/** A fixed-width key so the output reads like a table without being one. */
const row = (key: string, value: string) => `${key.padEnd(17)}${value}`

const GLYPH: Record<ShellState, string> = {
  open: '·',
  claimable: '$',
  returned: '+',
  forfeit: '!',
  expired: '!',
  swept: '-',
}

const HELP = [
  row('clock', 'where the week is right now'),
  row('rules', 'every number the program enforces'),
  row('runs', 'every run on chain'),
  row('run <wallet>', 'one run, day by day'),
  row('sweep <w> <#>', 'collect a forfeited or expired shell'),
  row('close <wallet>', 'give the rent back and free the wallet'),
  row('treasury', 'what the platform is holding'),
  row('clear', 'empty the screen'),
]

/**
 * The back room. Everything the program knows, read out loud — and the two things the platform
 * can do on its own, which are collecting a week nobody finished and putting a run away.
 *
 * It is a console rather than a dashboard because the questions are not fixed: half of running
 * this is looking at one wallet and asking why the chain thinks what it thinks.
 */
export function StaffPage() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState(-1)
  const nextId = useRef(0)
  const outRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const print = useMemo(
    () => (kind: Kind, text: string, href?: string) =>
      setLines((all) => [...all, { id: nextId.current++, kind, text, href }]),
    [],
  )

  const greeted = useRef(false)
  useEffect(() => {
    if (greeted.current) return // strict mode runs effects twice; the banner is not a retry
    greeted.current = true
    print('dim', `coldshell staff · ${NETWORK_LABEL.toLowerCase()} · ${short(PROGRAM_ID)}`)
    print('out', 'type help')
    print('dim', 'every time below is utc, because that is the only clock the program keeps')
    if (SHORT_CLOCK) print('bad', `short clock: a day is ${span(DAY_MS)} and a week ${span(DAY_MS * DAYS_PER_SHELL)}`)
  }, [print])

  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight })
  }, [lines])

  const wallet = (word: string | undefined): PublicKey => {
    if (!word || word === '.' || word === 'me') {
      if (!publicKey) throw new Error('no wallet connected, so there is no "." to stand in for one')
      return publicKey
    }
    try {
      return new PublicKey(word)
    } catch {
      throw new Error(`${word} is not an address`)
    }
  }

  async function send(what: string, ix: ReturnType<typeof sweepIx>) {
    if (!publicKey) throw new Error('connect a wallet first — somebody has to pay the fee')
    const tx = new Transaction().add(ix)
    const signature = await sendTransaction(tx, connection)
    print('dim', `${what} sent, waiting`)
    const latest = await connection.getLatestBlockhash()
    await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
    print('ok', `${what} confirmed`)
    print('dim', signature, explorerUrl('tx', signature))
  }

  function printRun(run: Run, now: number) {
    const last = run.firstShell + run.shells - 1
    print('out', row('run', run.address.toString()))
    print('out', row('wallet', run.user.toString()))
    print('out', row('vault', vaultAta(run.user).toString()))
    print('out', row('stake', `${usd(run.stake)} over ${run.shells} shell${run.shells > 1 ? 's' : ''}`))
    print('out', row('shells', run.shells === 1 ? `#${run.firstShell}` : `#${run.firstShell} – #${last}`))
    print('out', row('entered', when(run.enteredAt)))
    print('dim', '')

    for (let offset = 0; offset < run.shells; offset++) {
      const index = run.firstShell + offset
      const state = shellState(run, offset, now)
      const marks = shellDays(run, offset)
      const done = marks.filter(Boolean).length
      const settles = shellSettles(index)

      print('out', `shell #${index}   ${stamp(shellStart(index))} → ${stamp(shellEnd(index) - 60_000)}`)
      print('dim', `  ${HEADS.map((h) => h.padStart(3)).join(' ')}`)
      print(
        'out',
        `  ${marks
          .map((hit, day) => {
            if (hit) return '#'
            // A day still inside its window can still be saved; a closed one cannot.
            const open = now < shellStart(index) + day * DAY_MS + RECORD_LATE_MS
            return open ? '_' : '.'
          })
          .map((m) => m.padStart(3))
          .join(' ')}   ${done}/${DAYS_PER_SHELL}`,
      )

      const money = usd(share(run, offset))
      if (state === 'open') {
        const detail = shellComplete(run, offset)
          ? `all seven in · ${money} unlocks ${stamp(settles)}`
          : `${DAYS_PER_SHELL - done} to go · settles ${stamp(settles)}`
        print('out', `  open — ${detail}`)
      } else if (state === 'claimable') {
        print('ok', `  claimable — ${money} until ${stamp(claimDeadline(index))}`)
      } else if (state === 'returned') {
        print('ok', `  returned — ${money} went back`)
      } else if (state === 'swept') {
        print('dim', `  swept — ${money} went to the treasury`)
      } else if (state === 'forfeit') {
        print('bad', `  forfeit — a day missing · ${money} sweepable now`)
      } else {
        print('bad', `  expired — never collected · ${money} sweepable now`)
      }
      print('dim', '')
    }

    print('dim', closable(run, now) ? 'close is available' : 'a shell is still open, so close is not')
  }

  const COMMANDS: Record<string, (args: string[]) => Promise<void> | void> = {
    help: () => {
      for (const line of HELP) print('out', line)
      print('dim', '. or me stands in for the connected wallet')
    },

    clear: () => setLines([]),

    clock: () => {
      const now = Date.now()
      const zone = -new Date().getTimezoneOffset() / 60
      const chain = currentShell(now)
      const { shell, dayOfShell, weekday } = today(now)

      print('out', row('now', `${when(now)} utc`))
      print('dim', row('', `${local(now)} here (UTC${zone >= 0 ? '+' : ''}${zone})`))
      print('out', row('shell', `#${chain} · day ${Math.floor((now - shellStart(chain)) / DAY_MS) + 1} of ${DAYS_PER_SHELL}`))
      if (shell !== chain || `${weekday}` !== WEEKDAYS[new Date(now).getUTCDay()]) {
        // The site counts the participant's own day, which can be ahead of or behind the chain's.
        print('dim', row('', `the site would say shell #${shell}, day ${dayOfShell}, ${weekday}`))
      }
      print('out', row('next day in', span(untilNextDay(now))))
      print('dim', '')
      print('out', row('week ends', stamp(shellEnd(chain))))
      print('out', row('and settles', `${stamp(shellSettles(chain))} — a day later, once sunday's window shuts`))
      print('out', row('claim until', stamp(shellSettles(chain) + CLAIM_WINDOW_MS)))
      print('dim', '')
      const starting = startingShell(now)
      print(
        'out',
        starting === shell
          ? `a run paid for now starts today, in shell #${shell}`
          : `a run paid for now starts shell #${starting}, ${stamp(shellStart(starting))}`,
      )
    },

    rules: () => {
      print('out', row('stake', `${usd(MIN_STAKE_USDC * 1e6)} – ${usd(MAX_STAKE_USDC * 1e6)}`))
      print('out', row('shells', `1 – ${MAX_SHELLS}, ${DAYS_PER_SHELL} days each`))
      print('out', row('a day opens', `${span(RECORD_EARLY_MS)} before it starts`))
      print('out', row('and closes', `${span(RECORD_LATE_MS)} after it starts`))
      print('out', row('a week settles', `${span(RECORD_LATE_MS - DAY_MS)} after the week ends`))
      print('out', row('claim window', span(CLAIM_WINDOW_MS)))
      print('out', row('a day lasts', span(DAY_MS)))
      print('dim', '')
      print('out', row('program', PROGRAM_ID.toString()))
      print('out', row('treasury', TREASURY.toString()))
      print('out', row('usdc', USDC_MINT.toString()))
    },

    treasury: async () => {
      const ata = usdcAta(TREASURY)
      const [sol, token] = await Promise.all([
        connection.getBalance(TREASURY),
        connection.getTokenAccountBalance(ata).catch(() => null),
      ])
      print('out', row('treasury', TREASURY.toString()))
      print('out', row('sol', `${(sol / 1e9).toFixed(4)}`))
      print('out', row('usdc account', ata.toString()))
      if (token) print('out', row('usdc', usd(Number(token.value.amount))))
      else print('bad', 'the usdc account does not exist yet — sweep and close will both fail')
    },

    runs: async () => {
      const runs = await fetchRuns(connection)
      if (!runs.length) return print('dim', 'nothing on chain yet')
      const now = Date.now()
      print('dim', `${'wallet'.padEnd(17)}${'shells'.padEnd(14)}${'stake'.padEnd(10)}${'days'.padEnd(8)}state`)
      for (const run of runs) {
        const last = run.firstShell + run.shells - 1
        const range = run.shells === 1 ? `#${run.firstShell}` : `#${run.firstShell}–#${last}`
        const done = [...Array(run.shells * DAYS_PER_SHELL)].filter((_, d) => (run.days >> BigInt(d)) & 1n).length
        const glyphs = [...Array(run.shells)].map((_, o) => GLYPH[shellState(run, o, now)]).join('')
        print(
          'out',
          `${short(run.user).padEnd(17)}${range.padEnd(14)}${usd(run.stake).padEnd(10)}${`${done}/${run.shells * DAYS_PER_SHELL}`.padEnd(8)}${glyphs}`,
        )
      }
      print('dim', '')
      print('dim', '· open   $ claimable   + returned   ! sweepable   - swept')
    },

    run: async (args) => {
      const user = wallet(args[0])
      const run = await fetchRun(connection, user)
      if (!run) return print('dim', `${short(user)} has no run open`)
      printRun(run, Date.now())
    },

    sweep: async (args) => {
      const user = wallet(args[0])
      const index = Number(args[1]?.replace('#', ''))
      if (!Number.isInteger(index)) throw new Error('which shell? sweep <wallet> <#shell>')
      const run = await fetchRun(connection, user)
      if (!run) throw new Error(`${short(user)} has no run open`)
      const offset = index - run.firstShell
      if (offset < 0 || offset >= run.shells) {
        throw new Error(`shell #${index} is not part of this run (#${run.firstShell} – #${run.firstShell + run.shells - 1})`)
      }
      const state = shellState(run, offset, Date.now())
      if (!sweepable(state)) throw new Error(`shell #${index} is ${state}, and only a forfeited or expired shell can be swept`)
      print('out', `sweeping ${usd(share(run, offset))} from shell #${index} of ${short(user)}`)
      await send('sweep', sweepIx(user, offset))
    },

    close: async (args) => {
      const user = wallet(args[0])
      const run = await fetchRun(connection, user)
      if (!run) throw new Error(`${short(user)} has no run open`)
      if (!publicKey) throw new Error('connect a wallet first')
      if (!publicKey.equals(user) && !publicKey.equals(TREASURY)) {
        throw new Error('only the participant or the treasury can close a run')
      }
      if (!closable(run, Date.now())) throw new Error('a shell is still open — claim or sweep it first')
      await send('close', closeIx(publicKey, user))
    },
  }

  async function submit(raw: string) {
    const text = raw.trim()
    print('cmd', `$ ${text}`)
    if (!text) return
    setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 50))
    const [name, ...args] = text.split(/\s+/)
    const command = COMMANDS[name]
    if (!command) return print('bad', `${name}? try help`)
    setBusy(true)
    try {
      await command(args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // The browser's word for a dead RPC is "Failed to fetch", which says nothing useful.
      print('bad', message === 'Failed to fetch' ? `${RPC_ENDPOINT} did not answer` : message)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !busy) {
      const text = input
      setInput('')
      setCursor(-1)
      void submit(text)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!history.length) return
      event.preventDefault()
      const next = event.key === 'ArrowUp' ? Math.min(cursor + 1, history.length - 1) : Math.max(cursor - 1, -1)
      setCursor(next)
      setInput(next === -1 ? '' : history[next])
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault()
      setLines([])
    }
  }

  return (
    <main className="staff">
      <div className="console">
        <div className="console-bar">
          <span className="console-name">coldshell staff@{NETWORK_LABEL.toLowerCase()}: ~</span>
          <span className="console-account">
            <WalletMultiButton />
          </span>
        </div>
        <div className="console-out" ref={outRef} onClick={() => inputRef.current?.focus()}>
          {lines.map(({ id, kind, text, href }) => (
            <div key={id} className="console-line" data-kind={kind}>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer">
                  {text}
                </a>
              ) : (
                text || ' '
              )}
            </div>
          ))}
          <div className="console-line console-prompt">
            <span aria-hidden>$</span>
            <input
              ref={inputRef}
              className="console-input"
              value={input}
              spellCheck={false}
              autoComplete="off"
              autoFocus
              aria-label="command"
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
