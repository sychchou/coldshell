import { DAYS_PER_SHELL, DAY_MS, MAX_SHELLS, SHORT_CLOCK } from '../../config'
import { mondayOfShell, shellOf, today } from '../../lib/shell'

const HEADS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/** Enough months to hold the longest run anyone can commit to. */
const SPAN = 3

/** Only two things need telling apart: the weeks being bought, and everything else. */
const rowOf = (shell: number, now: number, mine: boolean) =>
  mine ? 'mine' : shell < now ? 'past' : 'open'

const gutter = (shell: number, now: number) =>
  shell < now ? '' : shell === now ? 'ing' : `#${shell}`

const pad = (n: number) => String(n).padStart(2, '0')
const date = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
/** A seventy-minute week has no date worth printing, only a time. */
const moment = (d: Date) => (SHORT_CLOCK ? clock(d) : date(d))

const addDays = (d: Date, days: number) => {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

/**
 * A calendar, the way `cal -3` draws one — except that here a row is not just a week, it is a
 * shell. That is the whole point of showing it: the thing being bought is a row.
 */
export function ShellCalendar({ first, shells }: { first: number; shells: number | null }) {
  const now = today()
  const last = first + (shells ?? 1) - 1
  const start = mondayOfShell(first)
  // One minute before the next shell begins, which is the sunday night on a real calendar.
  const end = new Date(mondayOfShell(last + 1).getTime() - 60_000)

  return (
    <div className="term-entry">
      <p className="term-prompt">calendar</p>
      <p className="term-line">
        {SHORT_CLOCK
          ? `a shell is seven days and a day is ${Math.round(DAY_MS / 60_000)} minutes here.`
          : 'a shell is one week, monday to sunday.'}{' '}
        the one already running cannot be joined.
      </p>
      <p className="term-line">
        {shells === null
          ? `pay now and your first shell is #${first}, starting ${SHORT_CLOCK ? '' : 'monday '}${moment(start)}.`
          : `shell #${first}${shells > 1 ? ` – #${last}` : ''} · ${moment(start)} → ${moment(end)}`}
      </p>
      {SHORT_CLOCK ? <ShellList first={first} shells={shells} /> : <Months first={first} shells={shells} now={now.shell} />}
    </div>
  )
}

function Months({ first, shells, now }: { first: number; shells: number | null; now: number }) {
  const from = new Date()
  const months = Array.from({ length: SPAN }, (_, i) => new Date(from.getFullYear(), from.getMonth() + i, 1))
  const mine = (shell: number) => shell >= first && shell < first + (shells ?? 1)

  return (
    <div className="cal3">
      {months.map((month) => {
        const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0)
        const rows: { shell: number; days: Date[] }[] = []
        let monday = addDays(month, -((month.getDay() + 6) % 7))
        while (monday <= lastDay) {
          rows.push({
            shell: shellOf(monday.getTime()),
            days: Array.from({ length: DAYS_PER_SHELL }, (_, i) => addDays(monday, i)),
          })
          monday = addDays(monday, DAYS_PER_SHELL)
        }

        return (
          <div className="cal3-month" key={month.getTime()}>
            <p className="cal3-title">
              {MONTHS[month.getMonth()]} {month.getFullYear()}
            </p>
            <div className="cal3-grid">
              <span className="cal3-gutter" />
              {HEADS.map((head) => (
                <span className="cal3-head" key={head}>
                  {head}
                </span>
              ))}

              {rows.map(({ shell, days }) => (
                  <div className="cal3-week" key={shell} data-row={rowOf(shell, now, mine(shell))}>
                    {/* A week that has been and gone needs no name; it is only there to count from.
                        The one running says so instead of its number, which nobody can use. */}
                    <span className="cal3-gutter">{gutter(shell, now)}</span>
                    {days.map((day) => (
                      <span
                        className="cal3-day"
                        key={day.getTime()}
                        data-out={day.getMonth() !== month.getMonth() || undefined}
                        data-today={date(day) === date(new Date()) || undefined}
                      >
                        {day.getDate()}
                      </span>
                    ))}
                  </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Seventy-minute weeks have no month to sit in, so they are simply listed. */
function ShellList({ first, shells }: { first: number; shells: number | null }) {
  const now = today().shell
  return (
    <div className="cal3-list">
      {Array.from({ length: MAX_SHELLS + 1 }, (_, i) => {
        const shell = now + i
        const mine = shell >= first && shell < first + (shells ?? 1)
        return (
          <p className="term-line cal3-row" key={shell} data-row={rowOf(shell, now, mine)}>
            <span className="cal3-gutter">{gutter(shell, now)}</span> {clock(mondayOfShell(shell))} →{' '}
            {clock(new Date(mondayOfShell(shell + 1).getTime() - 60_000))}
          </p>
        )
      })}
    </div>
  )
}
