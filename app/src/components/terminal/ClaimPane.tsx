import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { USDC_DECIMALS, explorerTxUrl } from '../../config'
import { announceClaim, claimTx, filmLink, mailFilm, sendPrepared, type FilmLink } from '../../lib/api'
import { claimDeadline, closeIx, share, shellSettles } from '../../lib/runs'
import { explain } from '../../lib/send'
import type { RunView } from '../../lib/useRun'
import { useCommands, useScrollOutput } from './chips'
import { Prompt } from './Prompt'
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
  const { publicKey, sendTransaction, signMessage, signTransaction } = useWallet()
  const { run, now, claimable, finished: settled } = view

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
        // The room says so on its own; it asks the chain whether it really happened.
        await announceClaim(publicKey.toBase58(), shell).catch(() => {})
      } catch (err) {
        setError(explain(err))
        break
      }
    }
    setBusy(null)
    await view.refresh()
  }

  const [closed, setClosed] = useState<string | null>(null)

  /**
   * Puts the run away. A wallet holds one run at a time, so this is also how the next one starts
   * — and the rent that was put up to open it comes back at the same moment.
   */
  const putAway = async () => {
    if (!publicKey || !signTransaction || !run) return
    setBusy(-1)
    setError(null)
    try {
      const tx = new Transaction().add(closeIx(publicKey, publicKey))
      const signature = await sendTransaction(tx, connection)
      const latest = await connection.getLatestBlockhash()
      await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      setClosed(signature)
      await view.refresh()
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(null)
    }
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

  /**
   * Posting it somewhere.
   *
   * The address is typed here and kept nowhere: the server sends the message and forgets, which
   * is why this asks every time instead of remembering. What travels is a link rather than the
   * film — eighty megabytes does not fit in a mailbox — and that link outlives the one on screen
   * by a fortnight, because mail is read later by definition.
   */
  const [to, setTo] = useState('')
  const [typing, setTyping] = useState(false)
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState<{ to: string; days: number } | null>(null)
  const [postError, setPostError] = useState<string | null>(null)

  const post = async () => {
    if (!publicKey || !signMessage || !to.trim() || posting) return
    setPosting(true)
    setPostError(null)
    try {
      setPosted(await mailFilm(publicKey.toBase58(), signMessage, to.trim()))
      setTyping(false)
    } catch (err) {
      setPostError(explain(err))
    } finally {
      setPosting(false)
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
        ...(settled && !waiting.length && run && !closed
          ? [
              {
                key: 'close',
                label: busy === -1 ? 'closing…' : 'close the run',
                tone: 'yes' as const,
                onClick: putAway,
                disabled: busy !== null,
              },
            ]
          : []),
        ...(run && signMessage && !reel?.link
          ? [{ key: 'film', label: reel?.busy ? 'putting it together…' : 'film', onClick: makeFilm, disabled: reel?.busy }]
          : []),
        // The film is here: save it, or send it somewhere. Typing an address takes the bar over,
        // so that Enter never means two things at once.
        ...(reel?.link && !typing
          ? [
              {
                key: 'download',
                label: 'download',
                tone: 'yes' as const,
                href: reel.link.url,
                download: reel.link.name,
              },
            ]
          : []),
        ...(reel?.link?.mail && !typing
          ? [{ key: 'mail', label: posted ? 'send it again' : 'mail it', onClick: () => { setPostError(null); setTyping(true) } }]
          : []),
        ...(typing
          ? [
              {
                key: 'send',
                label: posting ? 'sending…' : 'send',
                tone: 'yes' as const,
                onClick: post,
                disabled: posting || !to.trim(),
              },
              { key: 'nevermind', label: 'never mind', tone: 'no' as const, onClick: () => setTyping(false) },
            ]
          : []),
      ],
    },
    [
      waiting.join(),
      later,
      busy,
      publicKey,
      reel,
      closed,
      settled,
      Boolean(signMessage),
      typing,
      posting,
      to,
      posted,
    ],
    active,
  )

  useScrollOutput([done.length, later, reel, error, closed, typing, posted, postError])

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
      {settled && !waiting.length && !closed && (
        <p className="term-line">
          every week of this run is settled. closing it hands the rent back and frees the wallet
          for the next run.
        </p>
      )}
      {closed && (
        <p className="term-line">
          closed.{' '}
          <a className="term-dim" href={explorerTxUrl(closed)} target="_blank" rel="noreferrer">
            {closed.slice(0, 16)}…
          </a>
        </p>
      )}
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

              {typing && (
                <Prompt
                  label="mail to"
                  hint="you@example.com"
                  max={254}
                  value={to}
                  onChange={setTo}
                  onDone={post}
                  onCancel={() => setTyping(false)}
                />
              )}
              {postError && <p className="term-line term-bad">{postError}</p>}
              {posted && !typing && (
                <>
                  <p className="term-line">
                    sent to <b>{posted.to}</b>.
                  </p>
                  <p className="term-line term-dim">
                    the link in it lasts {posted.days} days. the address is not kept — sending it
                    again asks for one again.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
