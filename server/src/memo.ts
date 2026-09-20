/**
 * One note per wallet, and only ever one.
 *
 * Not a diary — the diary is the minutes, and nobody reads those. This is the line you leave
 * yourself about why you started, so that on the fourth evening there is something on the screen
 * that was written by somebody who meant it.
 *
 * It is kept behind a signature because, unlike the room, it was not said out loud.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { config } from './config.ts'

export class MemoError extends Error {}

const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const MAX = 280

export type Memo = { said: string; at: number }

function pathFor(wallet: string) {
  if (!WALLET.test(wallet)) throw new MemoError('bad wallet')
  const path = resolve(join(config.memo.dir, `${wallet}.json`))
  if (!path.startsWith(resolve(config.memo.dir))) throw new MemoError('bad wallet')
  return path
}

export async function readMemo(wallet: string): Promise<Memo | null> {
  try {
    return JSON.parse(await readFile(pathFor(wallet), 'utf8')) as Memo
  } catch {
    return null
  }
}

/** Writing replaces what was there. There is one note, and this is it. */
export async function writeMemo(wallet: string, said: string) {
  const text = said.trim()
  if (text.length > MAX) throw new MemoError(`${MAX} characters at most`)
  await mkdir(resolve(config.memo.dir), { recursive: true })
  const memo: Memo = { said: text, at: Date.now() }
  await writeFile(pathFor(wallet), JSON.stringify(memo))
  return memo
}
