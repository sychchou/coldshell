import { useEffect, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { NETWORK_LABEL } from '../../config'
import { useRun } from '../../lib/useRun'
import { ChipBar, ChipProvider, type Commands } from './chips'
import { CommunityPane } from './CommunityPane'
import { ClaimPane } from './ClaimPane'
import { RecordPane } from './RecordPane'
import { RegisterPane } from './RegisterPane'

type TabKey = 'claim' | 'record' | 'next' | 'community'

const TABS: { key: TabKey; label: string }[] = [
  // First on the bar and first to open: a week finished is the one thing worth interrupting for.
  { key: 'claim', label: 'claim' },
  { key: 'record', label: 'record' },
  { key: 'next', label: 'register' },
  { key: 'community', label: 'community' },
]

/**
 * The whole product in one window: a fixed frame, tabs for the views, output inside, and the
 * commands underneath. Nothing here ever changes the page's size.
 */
export function Terminal({ onTint }: { onTint: (colour: string) => void }) {
  const { publicKey } = useWallet()
  // One read of the chain for the whole window: registering and recording are two views of the
  // same account, and two copies of it would disagree the moment either one moved.
  const run = useRun()
  const [tab, setTab] = useState<TabKey>('record')
  const [commands, setCommands] = useState<Commands>({ chips: [] })
  // One counter per tab: resetting remounts that pane only, so you stay where you are.
  const [sessions, setSessions] = useState<Record<TabKey, number>>({ claim: 0, record: 0, next: 0, community: 0 })
  const outRef = useRef<HTMLDivElement>(null)

  const reset = () => {
    setSessions((current) => ({ ...current, [tab]: current[tab] + 1 }))
    outRef.current?.scrollTo({ top: 0 })
  }

  // A tab always opens at the top of its output, however far the last one was scrolled.
  useEffect(() => {
    outRef.current?.scrollTo({ top: 0 })
  }, [tab])

  const joined = Boolean(publicKey)
  useEffect(() => {
    if (!joined) setTab((current) => (current === 'community' ? 'next' : current))
  }, [joined])

  // A finished week opens its own tab, once, the way an update notice does. After that it is
  // just a tab: nobody should have to dismiss the same good news twice.
  const owed = run.claimable.length > 0
  const announced = useRef(false)
  useEffect(() => {
    if (owed && !announced.current) {
      announced.current = true
      setTab('claim')
    }
    if (!owed) announced.current = false
  }, [owed])

  const tabs = TABS.filter(
    (t) => (t.key !== 'community' || joined) && (t.key !== 'claim' || owed),
  )

  // The tab can vanish the moment the money is taken.
  useEffect(() => {
    if (!owed) setTab((current) => (current === 'claim' ? 'record' : current))
  }, [owed])

  return (
    <ChipProvider value={setCommands}>
      <div className="terminal-wrap">
        <div className="terminal">
          <div className="term-bar">
            <span className="term-lights">
              {(['close', 'min', 'max'] as const).map((light) => (
                <button
                  key={light}
                  type="button"
                  className="term-light"
                  data-light={light}
                  title="Set the flame alight"
                  aria-label="Set the flame alight"
                  onClick={() => onTint(light)}
                />
              ))}
            </span>
            <span className="term-name">coldshell@{NETWORK_LABEL.toLowerCase()}: ~</span>
            <span className="term-account">
              <WalletMultiButton />
            </span>
          </div>
          <div className="term-tabs" role="tablist">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                className="term-tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Every pane stays mounted: stepping into the rules mid-registration must not
              throw the conversation away. Only the visible one owns the command bar. */}
          <div className="term-out" ref={outRef}>
            {owed && (
              <div hidden={tab !== 'claim'}>
                <ClaimPane key={sessions.claim} active={tab === 'claim'} run={run} />
              </div>
            )}
            <div hidden={tab !== 'record'}>
              <RecordPane
                key={sessions.record}
                active={tab === 'record'}
                run={run}
                onRegister={() => setTab('next')}
              />
            </div>
            <div hidden={tab !== 'next'}>
              <RegisterPane key={sessions.next} active={tab === 'next'} run={run} />
            </div>
            {joined && (
              <div hidden={tab !== 'community'}>
                <CommunityPane key={sessions.community} active={tab === 'community'} run={run} />
              </div>
            )}
          </div>
          {/* The input line of the window: the output above it only ever prints. */}
          <ChipBar commands={commands} onReset={reset} />
        </div>
      </div>
    </ChipProvider>
  )
}
