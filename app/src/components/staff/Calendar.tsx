import { DAYS_PER_SHELL, SHORT_CLOCK } from '../../config'
import { dayCount, focusMarks, shellTotals, type Cell, type Row } from '../../lib/board'
import type { Run } from '../../lib/runs'
import { stamp, usd } from './format'

// A shell's seven days are mondays to sundays on the real clock. On the short one they are
// seventy minutes with no weekday to name, so they are numbered instead.
const HEADS = SHORT_CLOCK
  ? Array.from({ length: DAYS_PER_SHELL }, (_, i) => `d${i + 1}`)
  : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** What a cell is, seen either from everyone at once or from one wallet. */
type Mark = 'empty' | 'done' | 'open' | 'missed' | 'ahead'

function markOf(cell: Cell, runs: Run[], focus: Run | null, now: number): { mark: Mark; note: string } {
  if (cell.ms > now && cell.shell > 0) {
    const covering = focus ? (focusMarks(focus, cell.shell, now) ? 1 : 0) : dayCount(runs, cell, now).runs
    return { mark: covering ? 'ahead' : 'empty', note: '' }
  }
  if (focus) {
    const marks = focusMarks(focus, cell.shell, now)
    if (!marks) return { mark: 'empty', note: '' }
    const day = marks.offset * DAYS_PER_SHELL + cell.dayOfShell
    const done = ((focus.days >> BigInt(day)) & 1n) === 1n
    if (done) return { mark: 'done', note: 'recorded' }
    const { open } = dayCount([focus], cell, now)
    return open ? { mark: 'open', note: 'still open' } : { mark: 'missed', note: 'missed' }
  }
  const count = dayCount(runs, cell, now)
  if (!count.runs) return { mark: 'empty', note: '' }
  if (count.done === count.runs) return { mark: 'done', note: `${count.done}/${count.runs}` }
  if (count.open) return { mark: 'open', note: `${count.done}/${count.runs}` }
  return { mark: 'missed', note: `${count.done}/${count.runs}` }
}

/**
 * The board. Weeks run Monday to Sunday, which means a row is exactly one shell — the reason
 * this is a calendar and not a table.
 */
export function Calendar({
  rows,
  runs,
  focus,
  now,
  selected,
  onSelect,
}: {
  rows: Row[]
  runs: Run[]
  focus: Run | null
  now: number
  selected: number | null
  onSelect: (shell: number) => void
}) {
  return (
    <div className="cal">
      <div className="cal-head">
        <span className="cal-gutter" />
        {HEADS.map((head) => (
          <span key={head} className="cal-weekday">
            {head}
          </span>
        ))}
        <span className="cal-money">back</span>
        <span className="cal-money">kept</span>
        <span className="cal-money">held</span>
      </div>

      {rows.map((row) => {
        const totals = shellTotals(runs, row.shell, now)
        const mine = focus ? focusMarks(focus, row.shell, now) : null
        // With a wallet in focus the whole row is that run's: a count of everyone's days beside
        // one person's marks would be two different weeks sharing a line.
        const done = mine
          ? [...Array(DAYS_PER_SHELL)].filter(
              (_, i) => ((focus!.days >> BigInt(mine.offset * DAYS_PER_SHELL + i)) & 1n) === 1n,
            ).length
          : totals.done
        const expected = mine ? DAYS_PER_SHELL : totals.expected
        return (
          <div className="cal-row" key={row.shell} data-picked={selected === row.shell || undefined}>
            <button
              type="button"
              className="cal-gutter cal-pick"
              aria-pressed={selected === row.shell}
              onClick={() => onSelect(row.shell)}
            >
              <b>{row.shell > 0 ? `#${row.shell}` : '—'}</b>
              <small>{(focus ? mine !== null : totals.runs > 0) ? `${done}/${expected}` : ''}</small>
            </button>

            {row.cells.map((cell) => {
              const { mark, note } = markOf(cell, runs, focus, now)
              const isToday = now >= cell.ms && now < cell.ms + (rows[0].cells[1].ms - rows[0].cells[0].ms)
              return (
                // A day is shown, not opened. What a week did is the question worth a panel;
                // what one day did is already on the block.
                <span
                  key={cell.ms}
                  className="cal-day"
                  data-mark={mark}
                  data-muted={cell.muted || undefined}
                  data-today={isToday || undefined}
                  title={note}
                >
                  <span className="cal-date">
                    {SHORT_CLOCK ? stamp(cell.ms).slice(-5) : new Date(cell.ms).getUTCDate()}
                  </span>
                  {note && <span className="cal-note">{note}</span>}
                </span>
              )
            })}

            {focus ? (
              <>
                <span className="cal-money">{mine?.state === 'returned' ? usd(mine.amount) : ''}</span>
                <span className="cal-money">{mine?.state === 'swept' ? usd(mine.amount) : ''}</span>
                <span className="cal-money" data-warn={mine?.state === 'forfeit' || mine?.state === 'expired' || undefined}>
                  {mine && mine.state !== 'returned' && mine.state !== 'swept' ? usd(mine.amount) : ''}
                </span>
              </>
            ) : (
              <>
                <span className="cal-money">{totals.returned ? usd(totals.returned) : ''}</span>
                <span className="cal-money">{totals.collected ? usd(totals.collected) : ''}</span>
                <span className="cal-money" data-warn={totals.sweepable > 0 || undefined}>
                  {totals.locked ? usd(totals.locked) : ''}
                </span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
