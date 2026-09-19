import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { DAYS_PER_SHELL } from '../config'
import { fetchRun, shellState, type Run, type ShellState } from './runs'
import { today } from './shell'

export type RunView = {
  run: Run | null
  loading: boolean
  refresh: () => Promise<void>
  /** Which day of the run today is, counted from zero as the program counts. Null if outside it. */
  day: number | null
  /** How many of the run's days are in. */
  done: number
  /** Shells that can be collected right now, newest last. */
  claimable: number[]
  state: (offset: number) => ShellState
}

/**
 * The connected wallet's run, read from the chain.
 *
 * One read shared by both panes: registering and recording are two views of the same account,
 * and two copies of it would disagree the moment either one moved.
 */
export function useRun(): RunView {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [run, setRun] = useState<Run | null>(null)
  const [loading, setLoading] = useState(false)
  // Which day it is and which weeks can be collected are both answers about now, so the hook
  // keeps its own clock rather than reading one during render and going stale there.
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    if (!publicKey) return setRun(null)
    setLoading(true)
    try {
      setRun(await fetchRun(connection, publicKey))
    } catch (err) {
      // A chain we cannot reach is not an empty chain: leave what we had rather than claiming
      // the run is gone. The console is the right place for it — the screen has nothing useful
      // to say about an RPC that did not answer.
      console.error('[run]', err)
    } finally {
      setLoading(false)
    }
  }, [connection, publicKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(tick)
  }, [])

  let day: number | null = null
  let done = 0
  const claimable: number[] = []

  if (run) {
    const { shell, dayOfShell } = today(now)
    const index = (shell - run.firstShell) * DAYS_PER_SHELL + dayOfShell - 1
    if (index >= 0 && index < run.shells * DAYS_PER_SHELL) day = index
    for (let d = 0; d < run.shells * DAYS_PER_SHELL; d++) {
      if ((run.days >> BigInt(d)) & 1n) done++
    }
    for (let offset = 0; offset < run.shells; offset++) {
      if (shellState(run, offset, now) === 'claimable') claimable.push(run.firstShell + offset)
    }
  }

  return {
    run,
    loading,
    refresh,
    day,
    done,
    claimable,
    state: (offset: number) => shellState(run!, offset, now),
  }
}
