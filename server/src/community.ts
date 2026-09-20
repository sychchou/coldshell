/**
 * The one room. A line each, from whoever is inside a shell.
 *
 * It keeps seven days and no more — a rolling week, not a calendar one. A feed that keeps
 * everything becomes an archive nobody asked to be in, and this one is attached to wallet
 * addresses. Shells start at different hours for different people now, so the room cannot be
 * cut along them and does not need to be.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import { fetchRun } from './chain.ts'
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const roomPath = () => resolve(join(config.community.dir, 'room.json'))

async function load(): Promise<Line[]> {
  try {
    const lines = JSON.parse(await readFile(roomPath(), 'utf8')) as Line[]
    return lines.filter((line) => line.at >= Date.now() - WEEK_MS)
  } catch {
    return []
  }
}

/** Everything said in the last seven days. Anything older is dropped as it is read past. */
export const room = load

async function append(line: Line) {
  const lines = [...(await load()), line].slice(-MAX_LINES)
  await mkdir(resolve(config.community.dir), { recursive: true })
  await writeFile(roomPath(), JSON.stringify(lines))
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

  const already = (await load()).some(
    (line) => line.wallet === wallet && line.claimed === shell,
  )
  if (already) return null
  return append({ who: nickname(wallet), wallet, said: '', at: Date.now(), claimed: shell })
}
