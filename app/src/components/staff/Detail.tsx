import { CLAIM_WINDOW_MS, DAYS_PER_SHELL, RECORD_LATE_MS } from '../../config'
import { dayFacts, shellTotals, type Cell } from '../../lib/board'
import { shellEnd, shellSettles, shellStart, shellState, type Run } from '../../lib/runs'
import { short, span, stamp, usd, utc } from './format'

/**
 * Whatever is under the cursor, in words. A day on the board answers "who did this one", which
 * is the question a count can raise but never settle.
 */
export function Detail({
  cell,
  runs,
  now,
  onFocus,
}: {
  cell: Cell | null
  runs: Run[]
  now: number
  onFocus: (run: Run) => void
}) {
  if (!cell) {
    return (
      <aside className="detail">
        <p className="detail-empty">pick a day</p>
      </aside>
    )
  }

  if (cell.shell < 1) {
    return (
      <aside className="detail">
        <h2>{utc(cell.ms, false)}</h2>
        <p className="detail-empty">before shell #1</p>
      </aside>
    )
  }

  const totals = shellTotals(runs, cell.shell, now)
  const facts = dayFacts(runs, cell, now).sort((a, b) => Number(b.done) - Number(a.done))
  const ahead = cell.ms > now

  return (
    <aside className="detail">
      <h2>{utc(cell.ms, false)}</h2>
      <p className="detail-sub">
        shell #{cell.shell} · day {cell.dayOfShell + 1} of {DAYS_PER_SHELL}
      </p>

      <dl className="detail-rows">
        <dt>the week</dt>
        <dd>
          {stamp(shellStart(cell.shell))} → {stamp(shellEnd(cell.shell) - 60_000)}
        </dd>
        <dt>settles</dt>
        <dd>
          {stamp(shellSettles(cell.shell))}
          {now < shellSettles(cell.shell) && <small> · in {span(shellSettles(cell.shell) - now)}</small>}
        </dd>
        <dt>claim until</dt>
        <dd>{stamp(shellSettles(cell.shell) + CLAIM_WINDOW_MS)}</dd>
      </dl>

      {totals.runs > 0 && (
        <dl className="detail-rows">
          <dt>in this shell</dt>
          <dd>
            {totals.runs} run{totals.runs > 1 ? 's' : ''} · {totals.done}/{totals.expected} days
          </dd>
          <dt>back / kept / held</dt>
          <dd>
            {usd(totals.returned)} · {usd(totals.collected)} · {usd(totals.locked)}
          </dd>
        </dl>
      )}

      <h3>
        {ahead ? 'who will owe this day' : 'who owes this day'} · {facts.filter((f) => f.done).length}/{facts.length}
      </h3>
      {facts.length === 0 ? (
        <p className="detail-empty">nobody is in this week</p>
      ) : (
        <ul className="detail-list">
          {facts.map(({ run, done, open }) => (
            <li key={run.address.toString()}>
              <button type="button" className="link" onClick={() => onFocus(run)}>
                {short(run.user)}
              </button>
              <span
                className="detail-state"
                data-mark={done ? 'done' : ahead ? 'ahead' : open ? 'open' : 'missed'}
              >
                {done ? 'recorded' : ahead ? 'not yet' : open ? 'still open' : 'missed'}
              </span>
              <span className="detail-dim">
                {shellState(run, cell.shell - run.firstShell, now)}
                {!done && !ahead && open && ` · closes ${stamp(cell.ms + RECORD_LATE_MS)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
