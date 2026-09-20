/**
 * The title line: the name, then what it is for, set the same size in the same serif.
 *
 * Clicking the name reloads the page, because that is what clicking a name does everywhere else
 * and nobody was ever going to guess it changed the colours. The window's three dots still set
 * it alight in their own colour for a moment.
 */
export function Tagline({ tint }: { tint: string | null }) {
  return (
    <div className="tagline">
      <h1 className="wordmark">
        <a className="wordmark-name" href="/" data-tint={tint ?? undefined} title="coldshell">
          coldshell
        </a>
        <span className="wordmark-slogan"> &mdash; you vs you</span>
      </h1>
      <p className="tagline-how">
        Stake what would hurt to lose. Record a minute of yourself every day. Nobody watches it.
        Finish the week and every cent comes back, along with the film.
      </p>
    </div>
  )
}
