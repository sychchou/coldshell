import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { readRoom, sayInRoom, type Line } from '../../lib/api'
import { explain } from '../../lib/send'
import type { RunView } from '../../lib/useRun'
import { useCommands, useScrollOutput } from './chips'
import { Prompt } from './Prompt'

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
  const { publicKey } = useWallet()
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

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
    const said = (draft ?? '').trim()
    if (!said || !wallet) return
    setSending(true)
    setError(null)
    try {
      await sayInRoom(wallet, said)
      setDraft(null)
      await refresh()
    } catch (err) {
      setError(explain(err))
    } finally {
      setSending(false)
    }
  }

  useCommands(
    {
      chips:
        draft !== null
          ? []
          : [
              {
                key: 'say',
                label: sending ? 'sending…' : 'say',
                tone: 'yes' as const,
                onClick: () => setDraft(''),
                disabled: sending || !view.run,
              },
            ],
      back: draft !== null ? () => setDraft(null) : undefined,
    },
    [sending, draft === null, Boolean(view.run)],
    active,
  )

  const since = lines.filter((line) => line.at >= arrived)
  useScrollOutput([since.length, draft === null, error])

  return (
    <>
      <p className="term-prompt">community</p>
      <p className="term-line term-dim">be kind. everyone here is doing the same thing you are.</p>

      {since.map((line) => (
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
      ))}

      {error && <p className="term-line term-bad">{error}</p>}

      {draft !== null && (
        <Prompt
          label="say"
          hint="anything"
          max={200}
          value={draft}
          onChange={setDraft}
          onDone={() => void send()}
          onCancel={() => setDraft(null)}
        />
      )}

      {draft === null && !wallet && (
        <p className="term-line term-dim">connect a wallet to say something.</p>
      )}
      {draft === null && wallet && !view.run && (
        <p className="term-line term-dim">the room is for people inside a shell.</p>
      )}
    </>
  )
}
