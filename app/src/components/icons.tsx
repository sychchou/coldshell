/** Small monochrome marks for the footer. They take the colour of the text around them. */

const props = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 16 16',
  'aria-hidden': true,
  focusable: false,
  className: 'ico',
} as const

/** Telegram. */
export function PlaneIcon() {
  return (
    <svg {...props} fill="currentColor">
      <path d="M1 7.4 15 1.2l-3.6 13.6-3.2-5.1L1 7.4Z" />
    </svg>
  )
}

/** Email. */
/** Talking to the team, wherever that happens to be. */
/** A repository of code. */
export function MailIcon() {
  return (
    <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" />
      <path d="M2 4.5 8 9l6-4.5" fill="none" stroke="currentColor" />
    </svg>
  )
}

export function CodeIcon() {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.6 4 1.6 8l4 4M10.4 4l4 4-4 4" />
    </svg>
  )
}

/** Undo the last command. */
export function BackIcon() {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 8H3M7 3.5 2.5 8 7 12.5" />
    </svg>
  )
}

/** Start over. */
export function ResetIcon() {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.6 6.6A6 6 0 1 0 14 8" />
      <path d="M13.9 2.4v4.3H9.6" />
    </svg>
  )
}
