import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { DAYS_PER_SHELL, DAY_MS, RECORD_LATE_MS } from '../config'
import { closable, fetchRun, shellStart, shellState, type Run, type ShellState } from './runs'
import { today } from './shell'

/**
 * What became of one day: recorded, still recordable, gone, or not yet begun.
 */
export type DayMark = 'done' | 'open' | 'missed' | 'ahead'

export type RunView = {
  run: Run | null
  /** The hook's own clock, so a pane can ask what time it is without reaching for one. */
  now: number
  loading: boolean
  refresh: () => Promise<void>
  /** Which day of the run today is, counted from zero as the program counts. Null if outside it. */
  day: number | null
  /** How many of the run's days are in. */
  done: number
  /** One mark per day of the run, in order. */
  marks: DayMark[]
  /**
   * Days whose window is open, earliest first — whether or not something is already in them. A
   * day holds more than one minute, so a day already kept can still take another.
   */
  open: number[]
  /** Of those, the ones with nothing in them yet: the days somebody is about to lose. */
  empty: number[]
  /** Shells that can be collected right now, newest last. */
  claimable: number[]
  /** Everything is settled: the run can be put away and the wallet freed for the next. */
  finished: boolean
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
  const marks: DayMark[] = []
  const open: number[] = []
  const claimable: number[] = []

  if (run) {
    const { shell, dayOfShell } = today(now)
    const index = (shell - run.firstShell) * DAYS_PER_SHELL + dayOfShell - 1
    if (index >= 0 && index < run.shells * DAYS_PER_SHELL) day = index
    for (let d = 0; d < run.shells * DAYS_PER_SHELL; d++) {
      // The chain's own clock, not the screen's: a day is missed when its window shuts, and the
      // window is the program's.
      const starts = shellStart(run.firstShell) + d * DAY_MS
      if (now >= starts && now < starts + RECORD_LATE_MS) open.push(d)
      if ((run.days >> BigInt(d)) & 1n) {
        done++
        marks.push('done')
      } else if (now < starts) marks.push('ahead')
      else if (now < starts + RECORD_LATE_MS) marks.push('open')
      else marks.push('missed')
    }
    for (let offset = 0; offset < run.shells; offset++) {
      if (shellState(run, offset, now) === 'claimable') claimable.push(run.firstShell + offset)
    }
  }

  return {
    run,
    now,
    loading,
    refresh,
    day,
    done,
    marks,
    open: open,
    empty: open.filter((i) => marks[i] !== 'done'),
    claimable,
    finished: run ? closable(run, now) : false,
    state: (offset: number) => shellState(run!, offset, now),
  }
}
