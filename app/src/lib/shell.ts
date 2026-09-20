/**
 * A shell is the calendar week itself, numbered. Everyone inside one is inside the same week,
 * whether it is their first or their fifth. Shells begin on Mondays.
 *
 * Days are local. Nobody has to be anywhere at the same time as anybody else, so there is no
 * reason to make people do timezone arithmetic on their own day. The chain knows only UTC, and
 * the gap is exactly what its fourteen hours of early recording are for.
 *
 * Every number below comes out of the program's own constants, so a build with the short clock
 * moves the screen and the chain together.
 */

import { DAYS_PER_SHELL, DAY_MS, SHELL_EPOCH_MS, SHORT_CLOCK, WEEK_MS } from '../config'

const REAL_DAY = 86_400_000

/** The Monday shell #0 begins on, read off the program's epoch and rebuilt in local time. */
export const SHELL_EPOCH = (() => {
  const utc = new Date(SHELL_EPOCH_MS)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
})()

/** A day lasts minutes rather than hours. Kept under the old name for the panes that read it. */
export const TEST_MODE = SHORT_CLOCK

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Whole days between two local midnights. Rounding absorbs the hour a clock change adds or drops. */
const daysBetween = (from: number, to: number) => Math.round((to - from) / REAL_DAY)

/** The local Monday that starts the week a moment falls in. */
function mondayOf(ts: number) {
  const d = new Date(ts)
  return midnight(d) - ((d.getDay() + 6) % 7) * REAL_DAY
}

export type Today = {
  /** Counted from zero; below zero means shell #0 has not started yet. */
  shell: number
  /** 1-based day within this shell's week. */
  dayOfShell: number
  /** YYYY-MM-DD, local. */
  date: string
  weekday: string
}

export function today(now = Date.now()): Today {
  const d = new Date(now)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  if (SHORT_CLOCK) {
    // A ten-minute day has no calendar to follow, so it counts straight from the epoch — which
    // is also how the program counts, and a test is no use if the two disagree.
    const day = Math.floor((now - SHELL_EPOCH_MS) / DAY_MS)
    const dayOfShell = ((day % DAYS_PER_SHELL) + DAYS_PER_SHELL) % DAYS_PER_SHELL
    return {
      shell: Math.floor(day / DAYS_PER_SHELL),
      dayOfShell: dayOfShell + 1,
      date,
      weekday: WEEKDAYS[dayOfShell],
    }
  }

  const monday = mondayOf(now)
  const shell = Math.floor(daysBetween(midnight(SHELL_EPOCH), monday) / DAYS_PER_SHELL)
  const dayOfShell = daysBetween(monday, midnight(d)) + 1
  return { shell, dayOfShell, date, weekday: WEEKDAYS[dayOfShell - 1] }
}

/** How long until the day rolls over, so a test can see the next one coming. */
export function untilNextDay(now = Date.now()) {
  if (SHORT_CLOCK) return DAY_MS - ((now - SHELL_EPOCH_MS) % DAY_MS)
  return midnight(new Date(now)) + REAL_DAY - now
}

/**
 * The local Monday a shell begins on — and, on the short clock, simply the moment it begins,
 * since seventy-minute weeks have no monday to land on.
 */
export function mondayOfShell(index: number) {
  if (SHORT_CLOCK) return new Date(SHELL_EPOCH_MS + index * WEEK_MS)
  const d = new Date(SHELL_EPOCH)
  d.setDate(d.getDate() + index * DAYS_PER_SHELL)
  return d
}

/** The shell a moment belongs to, by the week it falls in. */
export function shellOf(ts: number) {
  if (SHORT_CLOCK) return Math.floor((ts - SHELL_EPOCH_MS) / WEEK_MS)
  return Math.floor(daysBetween(midnight(SHELL_EPOCH), mondayOf(ts)) / DAYS_PER_SHELL)
}

/**
 * The shell a run paid for now would begin in: always the next one. A week already under way
 * cannot be joined — it would be selling somebody days they had already lost. This is the rule
 * the program applies, and it is the program's answer that counts.
 */
export function startingShell(now = Date.now()) {
  // Before the first shell there is no week under way, so the first one is what you buy.
  return Math.max(0, today(now).shell + 1)
}

/**
 * How far through their own run somebody is: day 8 of 14 for a two-shell commitment. Without an
 * enrolment there is nothing to be part-way through, so it falls back to this week.
 */
export function progress(now = Date.now(), run?: { firstShell: number; shells: number }) {
  const { shell, dayOfShell } = today(now)
  if (!run) return { day: dayOfShell, days: DAYS_PER_SHELL }
  return {
    day: (shell - run.firstShell) * DAYS_PER_SHELL + dayOfShell,
    days: run.shells * DAYS_PER_SHELL,
  }
}
