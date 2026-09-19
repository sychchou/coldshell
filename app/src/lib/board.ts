/**
 * The calendar the staff page is built around, and the sums that hang off it.
 *
 * A shell is a Monday-to-Sunday week, so a calendar whose weeks start on Monday has exactly one
 * shell per row. That is the whole reason the board is a calendar and not a table.
 *
 * Everything here is UTC. The site shows people their own local day on purpose; in the back room
 * two clocks would only be two chances to read the wrong one.
 */

import { DAYS_PER_SHELL, DAY_MS, RECORD_LATE_MS } from '../config'
import {
  currentShell,
  shellComplete,
  shellSettles,
  shellStart,
  shellState,
  share,
  sweepable,
  type Run,
} from './runs'

export type Cell = {
  /** When this day begins, on the chain's clock. */
  ms: number
  shell: number
  /** 0 is Monday. */
  dayOfShell: number
  /** Outside the month being shown, so it is drawn back. */
  muted: boolean
}

export type Row = { shell: number; cells: Cell[] }

const row = (shell: number, muted: (ms: number) => boolean): Row => ({
  shell,
  cells: Array.from({ length: DAYS_PER_SHELL }, (_, dayOfShell) => {
    const ms = shellStart(shell) + dayOfShell * DAY_MS
    return { ms, shell, dayOfShell, muted: muted(ms) }
  }),
})

/** Every shell that touches a month, one per row. */
export function monthRows(year: number, month: number): Row[] {
  const first = currentShell(Date.UTC(year, month, 1))
  const last = currentShell(Date.UTC(year, month + 1, 0))
  const muted = (ms: number) => new Date(ms).getUTCMonth() !== ((month % 12) + 12) % 12
  return Array.from({ length: last - first + 1 }, (_, i) => row(first + i, muted))
}

/** With the short clock a month means nothing, so the board pages by shell instead. */
export function shellRows(first: number, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => row(first + i, () => false))
}

// ── What a run has to say about one day ──────────────────────────────────────

export type DayFact = {
  run: Run
  /** Which day of the run this is, counted from its first. */
  day: number
  done: boolean
  /** Still inside its recording window, so it can still be saved. */
  open: boolean
}

export const covers = (run: Run, shell: number) =>
  shell >= run.firstShell && shell < run.firstShell + run.shells

export function dayFacts(runs: Run[], cell: Cell, now: number): DayFact[] {
  return runs
    .filter((run) => covers(run, cell.shell))
    .map((run) => {
      const day = (cell.shell - run.firstShell) * DAYS_PER_SHELL + cell.dayOfShell
      return {
        run,
        day,
        done: ((run.days >> BigInt(day)) & 1n) === 1n,
        open: now < cell.ms + RECORD_LATE_MS,
      }
    })
}

export type DayCount = { runs: number; done: number; open: number }

export function dayCount(runs: Run[], cell: Cell, now: number): DayCount {
  const facts = dayFacts(runs, cell, now)
  return {
    runs: facts.length,
    done: facts.filter((f) => f.done).length,
    open: facts.filter((f) => !f.done && f.open).length,
  }
}

// ── What a shell is worth ────────────────────────────────────────────────────

export type ShellTotals = {
  shell: number
  runs: number
  done: number
  expected: number
  /** Still in the vaults, nobody's yet. */
  locked: bigint
  /** Went back to the participants. */
  returned: bigint
  /** Went to the treasury. */
  collected: bigint
  /** Weeks the treasury could take right now. */
  sweepable: number
  settles: number
}

export function shellTotals(runs: Run[], shell: number, now: number): ShellTotals {
  const totals: ShellTotals = {
    shell,
    runs: 0,
    done: 0,
    expected: 0,
    locked: 0n,
    returned: 0n,
    collected: 0n,
    sweepable: 0,
    settles: shellSettles(shell),
  }
  for (const run of runs) {
    if (!covers(run, shell)) continue
    const offset = shell - run.firstShell
    const state = shellState(run, offset, now)
    const amount = share(run, offset)
    totals.runs++
    totals.expected += DAYS_PER_SHELL
    totals.done += [...Array(DAYS_PER_SHELL)].filter(
      (_, i) => ((run.days >> BigInt(offset * DAYS_PER_SHELL + i)) & 1n) === 1n,
    ).length
    if (state === 'returned') totals.returned += amount
    else if (state === 'swept') totals.collected += amount
    else totals.locked += amount
    if (sweepable(state)) totals.sweepable++
  }
  return totals
}

export type Standing = {
  runs: number
  open: number
  locked: bigint
  returned: bigint
  collected: bigint
  /** Shells anybody could sweep right now, and what they are worth. */
  sweepable: { run: Run; offset: number; amount: bigint }[]
  /** Runs whose every shell is resolved, so the rent is waiting to come back. */
  closable: Run[]
}

export function standing(runs: Run[], now: number): Standing {
  const out: Standing = { runs: runs.length, open: 0, locked: 0n, returned: 0n, collected: 0n, sweepable: [], closable: [] }
  for (const run of runs) {
    let resolved = 0
    for (let offset = 0; offset < run.shells; offset++) {
      const state = shellState(run, offset, now)
      const amount = share(run, offset)
      if (state === 'returned') {
        out.returned += amount
        resolved++
      } else if (state === 'swept') {
        out.collected += amount
        resolved++
      } else {
        out.locked += amount
      }
      if (sweepable(state)) out.sweepable.push({ run, offset, amount })
    }
    if (resolved === run.shells) out.closable.push(run)
    else out.open++
  }
  return out
}

/** A run's own marks for one shell, which is what the board draws when a wallet is in focus. */
export function focusMarks(run: Run, shell: number, now: number) {
  if (!covers(run, shell)) return null
  const offset = shell - run.firstShell
  return {
    offset,
    state: shellState(run, offset, now),
    complete: shellComplete(run, offset),
    amount: share(run, offset),
  }
}
