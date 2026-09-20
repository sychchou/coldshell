/**
 * A download that outlives the request that asked for it.
 *
 * The film is too big to post — seven days of it is eighty megabytes and a mailbox will take
 * twenty-five — so what goes in a message is a link. A link in a mailbox gets opened tomorrow, on
 * another device, after this server has restarted twice. So the token cannot live in memory and
 * cannot expire in half an hour, which is what the download links in the browser were doing.
 *
 * A token holds the wallet and the film's name, never a path. The path is rebuilt from those by
 * the same code that wrote the film, so a token cannot name a file outside the films directory
 * however it was tampered with.
 */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { config } from './config.ts'

type Stored = { wallet: string; name: string; until: number }

export type Link = { path: string; name: string; until: number }

const TOKEN = /^[A-Za-z0-9_-]{22,64}$/
const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

const dir = () => resolve(config.links.dir)

/** Hands back a token that stands for this film for as long as it is given. */
export async function mint(wallet: string, name: string, ttlMs: number) {
  const token = randomBytes(24).toString('base64url')
  await mkdir(dir(), { recursive: true })
  const stored: Stored = { wallet, name, until: Date.now() + ttlMs }
  await writeFile(join(dir(), `${token}.json`), JSON.stringify(stored))
  return token
}

/**
 * What a token stands for, or nothing at all.
 *
 * Unknown, expired and malformed all answer the same way on purpose: a token is a secret, and
 * telling them apart would let somebody sort real ones from guesses.
 */
export async function resolveLink(token: string): Promise<Link | null> {
  if (!TOKEN.test(token)) return null
  const file = join(dir(), `${token}.json`)

  let stored: Stored
  try {
    stored = JSON.parse(await readFile(file, 'utf8')) as Stored
  } catch {
    return null
  }

  if (!(stored.until > Date.now())) {
    await rm(file, { force: true })
    return null
  }
  if (!WALLET.test(stored.wallet) || !NAME.test(stored.name)) return null

  return {
    path: join(resolve(config.films.dir), stored.wallet, stored.name),
    name: stored.name,
    until: stored.until,
  }
}

/** Expired tokens are rubbish rather than history. Swept when the server starts. */
export async function sweepLinks() {
  let files: string[]
  try {
    files = await readdir(dir())
  } catch {
    return 0
  }
  let gone = 0
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const stored = JSON.parse(await readFile(join(dir(), file), 'utf8')) as Stored
      if (stored.until > Date.now()) continue
    } catch {
      // Unreadable is as dead as expired.
    }
    await rm(join(dir(), file), { force: true })
    gone++
  }
  return gone
}
