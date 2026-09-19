import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Transaction } from '@solana/web3.js'
import { DAYS_PER_SHELL, DAY_MS, NETWORK_LABEL, RPC_ENDPOINT, SHORT_CLOCK, TREASURY, explorerUrl } from '../../config'
import { monthRows, shellRows, standing, type Cell } from '../../lib/board'
import { closeIx, currentShell, fetchRuns, shellStart, sweepIx, type Run } from '../../lib/runs'
import { usdcAta } from '../../lib/program'
import { Calendar } from './Calendar'
import { Detail } from './Detail'
import { RunsTable } from './RunsTable'
import { MONTHS, local, span, usd, utc } from './format'

const ROWS = 5

/** Where the board opens: the shells just behind us with the current one in view. */
const home = () => (SHORT_CLOCK ? Math.max(1, currentShell(Date.now()) - ROWS + 2) : Date.now())

/**
 * The back room, on one screen.
 *
 * Everything is UTC. The site counts the participant's own local day on purpose, but in here a
 * second clock would only be a second chance to read the wrong one — so local time appears once,
 * beside the real one, and never alone.
 */
export function StaffPage() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  const [runs, setRuns] = useState<Run[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Open on the weeks just behind us, where the money that needs deciding sits.
  const [anchor, setAnchor] = useState(() => home())
  const [selected, setSelected] = useState<Cell | null>(null)
  // The focused run is held by address, not by value: a refresh hands back new objects, and a
  // stored snapshot would quietly go stale the first time anything on chain moved.
  const [focused, setFocused] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRuns(await fetchRuns(connection))
      setError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message === 'Failed to fetch' ? `${RPC_ENDPOINT} did not answer` : message)
    } finally {
      setLoading(false)
    }
  }, [connection])

  useEffect(() => {
    void load()
  }, [load])

  // The board is all deadlines, so it has to move on its own.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(tick)
  }, [])

  const rows = useMemo(
    () =>
      SHORT_CLOCK
        ? shellRows(anchor as number, ROWS)
        : monthRows(new Date(anchor).getUTCFullYear(), new Date(anchor).getUTCMonth()),
    [anchor],
  )

  const focus = useMemo(
    () => runs.find((run) => run.address.toString() === focused) ?? null,
    [runs, focused],
  )
  const setFocus = (run: Run | null) => setFocused(run ? run.address.toString() : null)

  const book = useMemo(() => standing(runs, now), [runs, now])
  const shell = currentShell(now)
  const dayOfShell = Math.floor((now - shellStart(shell)) / DAY_MS) + 1

  const step = (by: number) =>
    setAnchor((at) =>
      SHORT_CLOCK
        ? Math.max(1, (at as number) + by * ROWS)
        : Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth() + by, 1),
    )

  const today = () => setAnchor(home())

  async function send(label: string, ix: Transaction | ReturnType<typeof sweepIx>) {
    if (!publicKey) {
      setError('connect a wallet first — somebody has to pay the fee')
      return
    }
    setBusy(label)
    setError(null)
    try {
      const tx = ix instanceof Transaction ? ix : new Transaction().add(ix)
      const signature = await sendTransaction(tx, connection)
      const latest = await connection.getLatestBlockhash()
      await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      window.open(explorerUrl('tx', signature), '_blank', 'noreferrer')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const title = SHORT_CLOCK
    ? `shell #${anchor} – #${(anchor as number) + ROWS - 1}`
    : `${MONTHS[new Date(anchor).getUTCMonth()]} ${new Date(anchor).getUTCFullYear()}`

  return (
    <main className="staff">
      <header className="staff-top">
        <h1>
          coldshell <span className="dim">staff</span>
        </h1>
        <p className="staff-clock">
          {utc(now)} utc <span className="dim">· {local(now)} here</span>
          <br />
          shell #{shell} · day {dayOfShell} of {DAYS_PER_SHELL} · {NETWORK_LABEL.toLowerCase()}
          {SHORT_CLOCK && <b className="warn"> · short clock, a day is {span(DAY_MS)}</b>}
        </p>
        <div className="staff-top-end">
          <button type="button" className="act" onClick={() => void load()} disabled={loading}>
            {loading ? 'reading…' : 'refresh'}
          </button>
          <WalletMultiButton />
        </div>
      </header>

      {error && <p className="staff-error">{error}</p>}

      <section className="tiles">
        <Tile label="runs" value={String(book.runs)} note={`${book.open} still going`} />
        <Tile label="held in vaults" value={usd(book.locked)} note="nobody's yet" />
        <Tile label="given back" value={usd(book.returned)} note="weeks finished" />
        <Tile label="kept" value={usd(book.collected)} note="weeks forfeited" />
        <Tile
          label="ready to sweep"
          value={usd(book.sweepable.reduce((sum, s) => sum + s.amount, 0n))}
          note={`${book.sweepable.length} shell${book.sweepable.length === 1 ? '' : 's'}`}
          warn={book.sweepable.length > 0}
        />
        <Tile
          label="ready to close"
          value={String(book.closable.length)}
          note="rent waiting"
          warn={book.closable.length > 0}
        />
      </section>

      <section className="board">
        <div className="board-main">
          <div className="board-head">
            <div className="pager">
              <button type="button" onClick={() => step(-1)} aria-label="earlier">
                ‹
              </button>
              <strong>{title}</strong>
              <button type="button" onClick={() => step(1)} aria-label="later">
                ›
              </button>
              <button type="button" className="act" onClick={today}>
                today
              </button>
            </div>
            {focus ? (
              <p className="focus">
                showing <b>{focus.user.toString()}</b>
                <button type="button" className="act" onClick={() => setFocus(null)}>
                  show everyone
                </button>
              </p>
            ) : (
              <p className="dim">a row is one shell, monday to sunday · pick a wallet below to follow one run</p>
            )}
          </div>
          <Calendar rows={rows} runs={runs} focus={focus} now={now} selected={selected} onSelect={setSelected} />
          <p className="legend">
            <i data-mark="done" /> every day in
            <i data-mark="open" /> still open
            <i data-mark="missed" /> missed
            <i data-mark="ahead" /> not yet
          </p>
        </div>
        <Detail cell={selected} runs={runs} now={now} onFocus={setFocus} />
      </section>

      <section className="board-runs">
        <h2>runs</h2>
        <RunsTable
          runs={runs}
          now={now}
          focus={focus}
          busy={busy}
          onFocus={setFocus}
          onSweep={(run, offset) => void send(`sweep:${run.address}`, sweepIx(run.user, offset))}
          onClose={(run) => void send(`close:${run.address}`, closeIx(publicKey!, run.user))}
        />
        <p className="dim">
          sweeping needs no permission — the money can only go to {usdcAta(TREASURY).toString().slice(0, 4)}…, the
          treasury's own account. Closing needs the participant or the treasury.
        </p>
      </section>
    </main>
  )
}

function Tile({ label, value, note, warn }: { label: string; value: string; note: string; warn?: boolean }) {
  return (
    <div className="tile" data-warn={warn || undefined}>
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      <span className="tile-note">{note}</span>
    </div>
  )
}
