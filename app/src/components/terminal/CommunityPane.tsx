import { useCallback, useEffect, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { readRoom, sayInRoom, type Line } from '../../lib/api'
import { explain } from '../../lib/send'
import type { RunView } from '../../lib/useRun'
import { useCommands, useScrollOutput } from './chips'

const clock = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * One room, one week.
 *
 * You see what has been said since you arrived and nothing from before — a room you walk into,
 * not a transcript you are handed. What everyone says keeps for the shell it was said in and
 * goes when the week turns; a feed attached to wallet addresses should not outlive its reason
 * for existing.
 */
export function CommunityPane({ active, run: view }: { active: boolean; run: RunView }) {
  const { publicKey, signMessage } = useWallet()
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // The moment this wallet walked in. Anything older belongs to a conversation it was not part
  // of, and a different wallet is a different arrival.
  const wallet = publicKey?.toBase58() ?? null
  const [arrived, setArrived] = useState(() => Date.now())
  useEffect(() => setArrived(Date.now()), [wallet])

  const refresh = useCallback(async () => {
    try {
      setLines(await readRoom())
    } catch {
      // A room we cannot reach is not an empty room; leave what is on screen.
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
    const tick = window.setInterval(() => void refresh(), 10_000)
    return () => window.clearInterval(tick)
  }, [active, refresh])

  const send = async () => {
    const said = draft.trim()
    if (!said || !wallet || !signMessage) return
    setSending(true)
    setError(null)
    try {
      await sayInRoom(wallet, signMessage, said)
      setDraft('')
      await refresh()
    } catch (err) {
      setError(explain(err))
    } finally {
      setSending(false)
      input.current?.focus()
    }
  }

  useCommands(
    {
      chips: [
        {
          key: 'say',
          label: sending ? 'sending…' : 'say',
          tone: 'yes' as const,
          onClick: () => void send(),
          disabled: sending || !draft.trim() || !view.run,
        },
      ],
    },
    [sending, draft, Boolean(view.run)],
    active,
  )

  const since = lines.filter((line) => line.at >= arrived)
  useScrollOutput([since.length, error])

  return (
    <>
      <p className="term-prompt">community</p>
      <p className="term-line term-dim">
        one line each, from whoever is inside a shell. the room keeps a week and then forgets it.
      </p>

      {since.length === 0 ? (
        <p className="term-line term-dim">nothing said since you came in.</p>
      ) : (
        since.map((line) => (
          <p className="term-line" key={`${line.wallet}-${line.at}`}>
            <span className="term-dim">{clock(line.at)} </span>
            <b>{line.who}</b>{' '}
            {line.claimed !== undefined ? (
              <span className="term-state" data-state="ok">
                took shell {line.claimed} back
              </span>
            ) : (
              line.said
            )}
          </p>
        ))
      )}

      {error && <p className="term-line term-bad">{error}</p>}

      {!wallet ? (
        <p className="term-line term-dim">connect a wallet to say something.</p>
      ) : !view.run ? (
        <p className="term-line term-dim">the room is for people inside a shell. register to join it.</p>
      ) : (
        <p className="term-line term-input-label">
          say&gt;{' '}
          <input
            ref={input}
            className="term-input"
            value={draft}
            maxLength={200}
            spellCheck={false}
            autoComplete="off"
            aria-label="say something"
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
          />
          <span className="term-cursor" aria-hidden="true" />
        </p>
      )}
    </>
  )
}
