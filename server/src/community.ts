/**
 * The one room. A line each, from whoever is inside a shell.
 *
 * It keeps a week and no more. A feed that keeps everything becomes an archive nobody asked to
 * be in, and this one is attached to wallet addresses — so the shell it belongs to is also how
 * long it lives. When the week turns, last week's room is gone.
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { currentShell, fetchRun } from './chain.ts'
import { config } from './config.ts'

export class RoomError extends Error {}

export type Line = {
  /** Who said it, as the four characters anybody would read anyway. */
  who: string
  wallet: string
  said: string
  at: number
  /** A claim the chain confirmed, rather than something somebody typed. */
  claimed?: number
}

const MAX_SAID = 200
const MAX_LINES = 500

export const nickname = (wallet: string) => wallet.slice(0, 4)

const roomPath = (shell: number) => resolve(join(config.community.dir, `${shell}.json`))

async function load(shell: number): Promise<Line[]> {
  try {
    return JSON.parse(await readFile(roomPath(shell), 'utf8')) as Line[]
  } catch {
    return []
  }
}

/**
 * Everything said in the shell running now. Older rooms are swept as they are noticed: there is
 * no scheduler here, and the only moment anybody cares whether last week is gone is a moment
 * somebody is already asking for this week.
 */
export async function room(): Promise<Line[]> {
  const shell = currentShell()
  void sweepOldRooms(shell).catch(() => {})
  return load(shell)
}

async function sweepOldRooms(keep: number) {
  let names: string[]
  try {
    names = await readdir(resolve(config.community.dir))
  } catch {
    return
  }
  await Promise.all(
    names
      .filter((name) => name.endsWith('.json') && Number(name.slice(0, -5)) !== keep)
      .map((name) => rm(resolve(join(config.community.dir, name)), { force: true })),
  )
}

async function append(line: Line) {
  const shell = currentShell()
  const lines = [...(await load(shell)), line].slice(-MAX_LINES)
  await mkdir(resolve(config.community.dir), { recursive: true })
  await writeFile(roomPath(shell), JSON.stringify(lines))
  return line
}

/** Anyone with a run can say something. Being inside is the whole membership test. */
export async function say(wallet: string, said: string) {
  const text = said.trim().replace(/\s+/g, ' ')
  if (!text) throw new RoomError('nothing to say')
  if (text.length > MAX_SAID) throw new RoomError(`${MAX_SAID} characters at most`)
  if (!(await fetchRun(new PublicKey(wallet)))) throw new RoomError('only people inside a shell can write here')
  return append({ who: nickname(wallet), wallet, said: text, at: Date.now() })
}

/**
 * A week coming back, announced by the room rather than by the person.
 *
 * The chain is asked whether it really happened. Otherwise this is a line anybody could type,
 * and the one thing in here that reads as a fact would be the one thing that was not.
 */
export async function announceClaim(wallet: string, shell: number) {
  const run = await fetchRun(new PublicKey(wallet))
  if (!run) throw new RoomError('that wallet has no run')
  const offset = shell - run.firstShell
  if (offset < 0 || offset >= run.shells) throw new RoomError('that shell is not part of the run')
  if (!(run.claimed & (1 << offset))) throw new RoomError('the chain does not show that shell claimed')

  const already = (await load(currentShell())).some(
    (line) => line.wallet === wallet && line.claimed === shell,
  )
  if (already) return null
  return append({ who: nickname(wallet), wallet, said: '', at: Date.now(), claimed: shell })
}
