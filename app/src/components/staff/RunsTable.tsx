import { DAYS_PER_SHELL } from '../../config'
import { closable, shellState, share, sweepable, type Run, type ShellState } from '../../lib/runs'
import { short, usd, utc } from './format'

const LABEL: Record<ShellState, string> = {
  open: 'open',
  claimable: 'claimable',
  returned: 'back',
  forfeit: 'forfeit',
  expired: 'expired',
  swept: 'kept',
}

/** Every run on chain, and the two buttons only the platform can press. */
export function RunsTable({
  runs,
  now,
  focus,
  busy,
  onFocus,
  onSweep,
  onClose,
}: {
  runs: Run[]
  now: number
  focus: Run | null
  busy: string | null
  onFocus: (run: Run | null) => void
  onSweep: (run: Run, offset: number) => void
  onClose: (run: Run) => void
}) {
  if (!runs.length) return <p className="detail-empty">no runs on chain yet</p>

  return (
    <table className="runs">
      <thead>
        <tr>
          <th>wallet</th>
          <th>shells</th>
          <th>stake</th>
          <th>days</th>
          <th>week by week</th>
          <th>entered</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => {
          const last = run.firstShell + run.shells - 1
          const days = [...Array(run.shells * DAYS_PER_SHELL)].filter(
            (_, d) => ((run.days >> BigInt(d)) & 1n) === 1n,
          ).length
          const states = [...Array(run.shells)].map((_, offset) => shellState(run, offset, now))
          const id = run.address.toString()
          return (
            <tr key={id} data-focus={focus?.address.equals(run.address) || undefined}>
              <td>
                <button type="button" className="link" onClick={() => onFocus(focus?.address.equals(run.address) ? null : run)}>
                  {short(run.user)}
                </button>
              </td>
              <td>{run.shells === 1 ? `#${run.firstShell}` : `#${run.firstShell}–#${last}`}</td>
              <td className="num">{usd(run.stake)}</td>
              <td className="num">
                {days}/{run.shells * DAYS_PER_SHELL}
              </td>
              <td>
                <span className="pips">
                  {states.map((state, offset) => (
                    <button
                      key={offset}
                      type="button"
                      className="pip"
                      data-state={state}
                      title={`shell #${run.firstShell + offset} · ${LABEL[state]} · ${usd(share(run, offset))}`}
                      disabled={!sweepable(state) || busy !== null}
                      onClick={() => onSweep(run, offset)}
                    >
                      <span className="sr">{`shell ${run.firstShell + offset} ${LABEL[state]}`}</span>
                    </button>
                  ))}
                </span>
              </td>
              <td className="dim">{utc(run.enteredAt)}</td>
              <td className="actions">
                {states.some(sweepable) && (
                  <button
                    type="button"
                    className="act"
                    disabled={busy !== null}
                    onClick={() => onSweep(run, states.findIndex(sweepable))}
                  >
                    {busy === `sweep:${id}` ? 'sweeping…' : `sweep ${usd(share(run, states.findIndex(sweepable)))}`}
                  </button>
                )}
                {closable(run, now) && (
                  <button type="button" className="act" disabled={busy !== null} onClick={() => onClose(run)}>
                    {busy === `close:${id}` ? 'closing…' : 'close'}
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
