import assert from 'node:assert/strict'
import test from 'node:test'
import { MailError, address, body, subject } from '../src/mail.ts'
import type { Film } from '../src/film.ts'

const refused = (raw: string) =>
  assert.throws(() => address(raw), (err: unknown) => {
    assert.ok(err instanceof MailError, `expected a refusal for ${JSON.stringify(raw)}, got ${err}`)
    return true
  })

test('ordinary addresses are taken, with their whitespace trimmed', () => {
  assert.equal(address('  you@example.com '), 'you@example.com')
  assert.equal(address('first.last+coldshell@sub.example.co.kr'), 'first.last+coldshell@sub.example.co.kr')
})

/**
 * This is the only place a stranger's text reaches an SMTP conversation. A newline in a header
 * is how a single recipient becomes a bcc list, so the shapes that would allow it are refused
 * outright rather than escaped — there is nothing here worth the risk of escaping correctly.
 */
test('anything that could become a second header is refused', () => {
  refused('you@example.com\nbcc: everyone@example.com')
  refused('you@example.com\r\nsubject: hello')
  refused('you@example.com, them@example.com')
  refused('you@example.com; them@example.com')
  refused('Someone <you@example.com>')
  refused('you"@example.com')
  refused('you@example.com someone@example.com')
})

test('things that are not addresses are refused', () => {
  refused('')
  refused('   ')
  refused('you')
  refused('you@')
  refused('@example.com')
  refused('you@example')
  refused('you@.com')
  refused('you@example..com')
  refused('you@-example.com')
  refused(`${'a'.repeat(250)}@example.com`)
})

const film: Film = {
  path: '/tmp/coldshell-shell-3.mp4',
  name: 'coldshell-shell-3.mp4',
  bytes: 86_412_000,
  seconds: 432,
  days: 7,
  from: 3,
  to: 3,
}

test('the message says what it is, what it weighs and how long the link lasts', () => {
  const url = 'https://coldshell.example/api/film/abc'
  const text = body(film, url, 14)

  assert.equal(subject(film), 'your film — shell 3')
  assert.match(text, /7 days of shell 3, joined into one film of 7m 12s\./)
  assert.ok(text.includes(url), 'the link has to be in it')
  assert.match(text, /coldshell-shell-3\.mp4 · 82\.4 MB/)
  assert.match(text, /good for the next 14 days/)
})

test('a run of several weeks says so, and one day is a day', () => {
  const long: Film = { ...film, days: 1, seconds: 61, from: 3, to: 5 }
  assert.equal(subject(long), 'your film — shells 3–5')
  assert.match(body(long, 'https://x/y', 14), /1 day of shells 3–5, joined into one film of 1m 1s\./)
})
