import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const work = await mkdtemp(join(tmpdir(), 'coldshell-links-'))
process.env.LINK_DIR = join(work, 'links')
process.env.FILM_DIR = join(work, 'films')
process.env.CLIP_DIR = join(work, 'clips')

const { mint, resolveLink, sweepLinks } = await import('../src/links.ts')

const WALLET = '8KRsndNsQ2YYXD2BXkh8f4kAtwkGHB4V5KukreCf61sW'

test.after(() => rm(work, { recursive: true, force: true }))

test('a token stands for one wallet’s film, and points inside the films directory', async () => {
  const token = await mint(WALLET, 'coldshell-shell-3.mp4', 60_000)
  const link = await resolveLink(token)
  assert.ok(link, 'the token it just minted should resolve')
  assert.equal(link.name, 'coldshell-shell-3.mp4')
  assert.equal(link.path, join(process.env.FILM_DIR!, WALLET, 'coldshell-shell-3.mp4'))
})

test('tokens survive a restart, which is the whole reason they are on disk', async () => {
  const token = await mint(WALLET, 'coldshell-shell-4.mp4', 60_000)
  // A fresh import is as close as this gets to a new process: nothing was held in memory.
  const again = await import(`../src/links.ts?restart=${Date.now()}`)
  assert.ok(await again.resolveLink(token))
})

test('an expired token is gone, and taken off the disk when it is asked for', async () => {
  const token = await mint(WALLET, 'coldshell-shell-3.mp4', -1)
  assert.equal(await resolveLink(token), null)
  // Asking again reads nothing at all: the first ask deleted it.
  assert.equal(await resolveLink(token), null)
})

/**
 * The token names a wallet and a filename, never a path, and both are checked on the way out as
 * well as on the way in. Even with write access to the token directory there is no spelling of
 * either that reaches a file outside the films directory.
 */
test('a tampered token cannot name a file outside the films directory', async () => {
  for (const token of ['../../etc/passwd', 'a'.repeat(21), 'not a token', '']) {
    assert.equal(await resolveLink(token), null, `${JSON.stringify(token)} should resolve to nothing`)
  }

  const token = await mint(WALLET, 'coldshell.mp4', 60_000)
  for (const bad of [
    { wallet: '../..', name: 'passwd' },
    { wallet: WALLET, name: '../../../etc/passwd' },
    { wallet: WALLET, name: '.ssh' },
  ]) {
    await writeFile(join(process.env.LINK_DIR!, `${token}.json`), JSON.stringify({ ...bad, until: Date.now() + 60_000 }))
    assert.equal(await resolveLink(token), null, `${bad.wallet}/${bad.name} should resolve to nothing`)
  }
})

test('sweeping clears what has expired and leaves what has not', async () => {
  const live = await mint(WALLET, 'coldshell-shell-9.mp4', 60_000)
  await mint(WALLET, 'coldshell-shell-8.mp4', -1)
  await mint(WALLET, 'coldshell-shell-7.mp4', -1)
  assert.equal(await sweepLinks(), 2)
  assert.ok(await resolveLink(live))
})
