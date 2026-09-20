import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { USDC_DECIMALS, explorerTxUrl } from '../../config'
import { claimTx, filmLink, sendPrepared, type FilmLink } from '../../lib/api'
import { claimDeadline, share, shellSettles } from '../../lib/runs'
import { explain } from '../../lib/send'
import type { RunView } from '../../lib/useRun'
import { useCommands, useScrollOutput } from './chips'
import { mb } from '../../lib/recorder'

const usd = (base: bigint) => `$${(Number(base) / 10 ** USDC_DECIMALS).toFixed(2)}`

const when = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const runtime = (seconds: number) =>
  seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`

/**
 * The week came back.
 *
 * It arrives in front of the recording screen the way an update notice does, because a week
 * finished is the one thing here worth interrupting for — and money left uncollected has a
 * deadline, which nobody discovers by going looking.
 */
export function ClaimPane({ active, run: view }: { active: boolean; run: RunView }) {
  const { connection } = useConnection()
  const { publicKey, signMessage, signTransaction } = useWallet()
  const { run, now, claimable } = view

  const [done, setDone] = useState<{ shell: number; signature: string }[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [later, setLater] = useState(false)
  const [reel, setReel] = useState<{ link?: FilmLink; error?: string; busy?: boolean } | null>(null)

  const waiting = claimable.filter((shell) => !done.some((d) => d.shell === shell))
  const owed = run
    ? waiting.reduce((sum, shell) => sum + share(run, shell - run.firstShell), 0n)
    : 0n
  // Every shell has had its week; there is nothing left to record, only to collect.
  const over = run ? now >= shellSettles(run.firstShell + run.shells - 1) : false
  const deadline = run && waiting.length ? claimDeadline(Math.min(...waiting)) : null

  const collect = async () => {
    if (!publicKey || !signTransaction || !waiting.length) return
    setError(null)
    for (const shell of waiting) {
      setBusy(shell)
      try {
        const signature = await sendPrepared(connection, signTransaction, await claimTx(publicKey.toBase58(), shell))
        setDone((all) => [...all, { shell, signature }])
      } catch (err) {
        setError(explain(err))
        break
      }
    }
    setBusy(null)
    await view.refresh()
  }

  const makeFilm = async () => {
    if (!publicKey || !signMessage) return
    setReel({ busy: true })
    try {
      setReel({ link: await filmLink(publicKey.toBase58(), signMessage) })
    } catch (err) {
      setReel({ error: explain(err) })
    }
  }

  useCommands(
    {
      chips: [
        ...(waiting.length && !later
          ? [
              {
                key: 'yes',
                label: busy !== null ? 'collecting…' : `take ${usd(owed)}`,
                tone: 'yes' as const,
                onClick: collect,
                disabled: busy !== null || !publicKey,
              },
              { key: 'no', label: 'not now', tone: 'no' as const, onClick: () => setLater(true) },
            ]
          : []),
        ...(later && waiting.length
          ? [{ key: 'again', label: `take ${usd(owed)}`, tone: 'yes' as const, onClick: () => setLater(false) }]
          : []),
        ...(run && signMessage && !reel?.link
          ? [{ key: 'film', label: reel?.busy ? 'putting it together…' : 'film', onClick: makeFilm, disabled: reel?.busy }]
          : []),
      ],
    },
    [waiting.join(), later, busy, publicKey, reel, Boolean(signMessage)],
    active,
  )

  useScrollOutput([done.length, later, reel, error])

  return (
    <>
      <p className="term-prompt">claim</p>

      {waiting.length > 0 ? (
        <>
          <p className="term-line">
            {waiting.length === 1
              ? `shell ${waiting[0]} is finished — every day of it is on the chain.`
              : `${waiting.length} weeks are finished — every day of them is on the chain.`}
          </p>
          <p className="term-line">
            <b>{usd(owed)}</b> is yours to take back. take it now?
          </p>
          {deadline && (
            <p className="term-line term-dim">
              {over ? 'the run is over. ' : ''}
              unclaimed until {when(deadline)} — after that it goes to the treasury.
            </p>
          )}
          {later && (
            <p className="term-line term-dim">
              left where it is. it keeps, and the next finished week stacks on top of it.
            </p>
          )}
        </>
      ) : (
        <p className="term-line term-dim">nothing waiting to be collected.</p>
      )}

      {done.map(({ shell, signature }) => (
        <p className="term-line" key={shell}>
          shell {shell} came back.{' '}
          <a className="term-dim" href={explorerTxUrl(signature)} target="_blank" rel="noreferrer">
            {signature.slice(0, 16)}…
          </a>
        </p>
      ))}
      {error && <p className="term-line term-bad">{error}</p>}

      {reel && (
        <div className="term-entry">
          <p className="term-prompt">film</p>
          {reel.busy && <p className="term-line term-dim">joining the minutes…</p>}
          {reel.error && <p className="term-line term-bad">{reel.error}</p>}
          {reel.link && (
            <>
              <p className="term-line">
                {reel.link.days} day{reel.link.days > 1 ? 's' : ''} of shell {reel.link.from}
                {reel.link.to > reel.link.from && ` – ${reel.link.to}`}, joined into one film of{' '}
                <b>{runtime(reel.link.seconds)}</b>.
              </p>
              <p className="term-line">
                <a href={reel.link.url} download={reel.link.name}>
                  {reel.link.name}
                </a>{' '}
                <span className="term-dim">· {mb(reel.link.bytes)}</span>
              </p>
              <p className="term-line term-dim">the link is good for half an hour.</p>
            </>
          )}
        </div>
      )}
    </>
  )
}
