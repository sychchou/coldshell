import { CLAIM_WINDOW_MS, DAYS_PER_SHELL } from '../../config'
import { covers, shellTotals } from '../../lib/board'
import { shellEnd, shellSettles, shellStart, shellState, share, type Run } from '../../lib/runs'
import { short, span, stamp, usd, utc } from './format'

/**
 * A week, in words.
 *
 * The board already says what each day did — a block is a day and its colour is the answer. What
 * it cannot say is who is in the week, what the week is worth, and which way the money is about
 * to go. That is what a panel is for.
 */
export function Detail({
  shell,
  runs,
  now,
  onFocus,
}: {
  shell: number | null
  runs: Run[]
  now: number
  onFocus: (run: Run) => void
}) {
  if (shell === null) {
    return (
      <aside className="detail">
        <p className="detail-empty">pick a week</p>
      </aside>
    )
  }

  if (shell < 1) {
    return (
      <aside className="detail">
        <h2>shell {shell}</h2>
        <p className="detail-empty">before shell #1</p>
      </aside>
    )
  }

  const totals = shellTotals(runs, shell, now)
  const inside = runs.filter((run) => covers(run, shell))
  const settles = shellSettles(shell)

  return (
    <aside className="detail">
      <h2>shell #{shell}</h2>
      <p className="detail-sub">
        {utc(shellStart(shell), false)} → {utc(shellEnd(shell) - 60_000, false)}
      </p>

      <dl className="detail-rows">
        <dt>settles</dt>
        <dd>
          {stamp(settles)}
          <small> · {now < settles ? `in ${span(settles - now)}` : `${span(now - settles)} ago`}</small>
        </dd>
        <dt>claim until</dt>
        <dd>{stamp(settles + CLAIM_WINDOW_MS)}</dd>
        <dt>days in</dt>
        <dd>
          {totals.done}/{totals.expected}
        </dd>
        <dt>back / kept / held</dt>
        <dd>
          {usd(totals.returned)} · {usd(totals.collected)} · {usd(totals.locked)}
        </dd>
        {totals.sweepable > 0 && (
          <>
            <dt>sweepable</dt>
            <dd className="warn">
              {totals.sweepable} shell{totals.sweepable > 1 ? 's' : ''}
            </dd>
          </>
        )}
      </dl>

      <h3>
        who is in it · {inside.length} run{inside.length === 1 ? '' : 's'}
      </h3>
      {inside.length === 0 ? (
        <p className="detail-empty">nobody is in this week</p>
      ) : (
        <ul className="detail-list">
          {inside.map((run) => {
            const offset = shell - run.firstShell
            const state = shellState(run, offset, now)
            const days = [...Array(DAYS_PER_SHELL)].filter(
              (_, i) => ((run.days >> BigInt(offset * DAYS_PER_SHELL + i)) & 1n) === 1n,
            ).length
            return (
              <li key={run.address.toString()}>
                <button type="button" className="link" onClick={() => onFocus(run)}>
                  {short(run.user)}
                </button>
                <span className="detail-state" data-mark={mark(state)}>
                  {state}
                </span>
                <span className="detail-dim">
                  {days}/{DAYS_PER_SHELL} days · {usd(share(run, offset))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

const mark = (state: string) =>
  state === 'returned' || state === 'claimable' ? 'done' : state === 'open' ? 'open' : 'missed'
