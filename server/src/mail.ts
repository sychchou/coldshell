/**
 * Posting a film.
 *
 * What goes in the message is a link, not the film. A week of minutes is around eighty megabytes
 * and a mailbox will take twenty-five, so an attachment would fail for exactly the runs that
 * finished — which is the wrong half of the audience to fail for.
 *
 * The address is typed when the film is sent and is never written down. That is the whole of the
 * storage design: there is no table of participants' email addresses to lose, and none of this
 * can quietly become a mailing list later, because there is nothing to mail.
 */

import { createTransport, type Transporter } from 'nodemailer'
import { config } from './config.ts'
import type { Film } from './film.ts'

export class MailError extends Error {}

/**
 * Deliberately narrower than the addresses RFC 5321 permits. This is the only place a stranger's
 * text reaches an SMTP conversation, so the shapes that make header injection possible — spaces,
 * newlines, commas, angle brackets — are not admitted at all, rather than escaped.
 */
const ADDRESS = /^[^\s@,;:<>"'\\]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/

export function address(raw: string) {
  const to = String(raw).trim()
  if (!to) throw new MailError('where should it go?')
  if (to.length > 254) throw new MailError('that address is too long')
  if (!ADDRESS.test(to)) throw new MailError('that does not look like an email address')
  return to
}

/** Whether this server can post anything at all. Without a mailbox the route simply says so. */
export const ready = () => Boolean(config.mail.user && config.mail.pass)

let transport: Transporter | null = null

function mailer() {
  if (!ready()) throw new MailError('this server cannot send mail')
  transport ??= createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: { user: config.mail.user, pass: config.mail.pass },
  })
  return transport
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

const runtime = (seconds: number) =>
  seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`

const shells = (film: Film) =>
  film.to > film.from ? `shells ${film.from}–${film.to}` : `shell ${film.from}`

export const subject = (film: Film) => `your film — ${shells(film)}`

/**
 * Plain text, and plain text only. An HTML mail from an address nobody recognises, carrying a
 * link to a large download, is the shape of every phishing message ever sent; this one should
 * look like what it is, and be readable in a terminal if that is where it is opened.
 */
export function body(film: Film, url: string, days: number) {
  return [
    'coldshell',
    '',
    `${film.days} ${film.days === 1 ? 'day' : 'days'} of ${shells(film)}, joined into one film of ${runtime(film.seconds)}.`,
    '',
    `  ${url}`,
    `  ${film.name} · ${mb(film.bytes)}`,
    '',
    `The link is good for the next ${days} days. The site will make you another one whenever you ask.`,
    '',
    'Nobody has watched it.',
    '',
  ].join('\n')
}

export async function sendFilm(to: string, film: Film, url: string, days: number) {
  try {
    await mailer().sendMail({
      from: config.mail.from || config.mail.user,
      to,
      subject: subject(film),
      text: body(film, url, days),
    })
  } catch (err) {
    // The address is not stored, and a log is storage. Only the failure's own name goes in —
    // enough to tell a bad password from a refused recipient, without keeping the recipient.
    console.error('[mail]', (err as { code?: string })?.code ?? 'send failed')
    throw new MailError('that would not send — try again in a moment')
  }
}
