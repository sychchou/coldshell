import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { config } from './config.ts'

/** Base58 is the wallet alphabet; anything else has no business in a path. */
const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SHA256 = /^[0-9a-f]{64}$/

export type ClipMeta = {
  wallet: string
  shell: number
  day: number
  sha256: string
  type: string
}

export class ClipError extends Error {}

function extensionFor(type: string) {
  if (type.startsWith('video/mp4')) return 'mp4'
  if (type.startsWith('video/webm')) return 'webm'
  throw new ClipError('unsupported recording format')
}

/**
 * What is known about a stored clip. The signature is the important part: the hash itself lives
 * in the record_day instruction data, which is permanent — but only findable if you know which
 * transaction to look in, and the event log that would otherwise say is pruned within days.
 */
export type Note = {
  key: string
  sha256: string
  bytes: number
  at: string
  signature?: string
}

/**
 * A day holds up to `config.clips.perDay` minutes, so a clip is named for its day and then for
 * itself. The short hash is enough to tell them apart and makes an upload of the same minute
 * twice land on itself rather than beside itself.
 */
function stem(wallet: string, shell: number, day: number, sha256?: string) {
  if (!WALLET.test(wallet)) throw new ClipError('bad wallet')
  if (!Number.isInteger(shell) || shell < 1) throw new ClipError('bad shell')
  if (!Number.isInteger(day) || day < 1 || day > 70) throw new ClipError('bad day')
  const of = `${wallet}/${shell}-${String(day).padStart(2, '0')}`
  if (!sha256) return of
  if (!SHA256.test(sha256)) throw new ClipError('bad hash')
  return `${of}-${sha256.slice(0, 8)}`
}

export const keyFor = (meta: ClipMeta) =>
  `${stem(meta.wallet, meta.shell, meta.day, meta.sha256)}.${extensionFor(meta.type)}`

function safePath(key: string) {
  // resolve() keeps a crafted key from climbing out of the clip directory.
  const path = resolve(join(config.clips.dir, key))
  if (!path.startsWith(resolve(config.clips.dir))) throw new ClipError('bad key')
  return path
}

export const clipPath = (note: Note) => safePath(note.key)

const notePath = (wallet: string, shell: number, day: number, sha256: string) =>
  safePath(`${stem(wallet, shell, day, sha256)}.json`)

const read = async (path: string): Promise<Note | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Note
  } catch {
    return null
  }
}

/**
 * Every minute stored for one day, oldest first — which is the order they were lived in, and so
 * the order they belong in.
 */
export async function notesFor(wallet: string, shell: number, day: number): Promise<Note[]> {
  const prefix = stem(wallet, shell, day).split('/')[1]!
  let names: string[]
  try {
    names = await readdir(resolve(join(config.clips.dir, wallet)))
  } catch {
    return []
  }
  const found = await Promise.all(
    names
      // `${prefix}.json` is a clip from before a day could hold more than one; `${prefix}-…json`
      // is one from after. Both are somebody's minute.
      .filter((name) => name.endsWith('.json') && (name === `${prefix}.json` || name.startsWith(`${prefix}-`)))
      .map((name) => read(safePath(`${wallet}/${name}`))),
  )
  return found.filter((note): note is Note => note !== null).sort((a, b) => a.at.localeCompare(b.at))
}

export const noteWith = async (wallet: string, shell: number, day: number, sha256: string) =>
  (await notesFor(wallet, shell, day)).find((note) => note.sha256 === sha256) ?? null

/** Ties a clip to the transaction that dated it, once that transaction has confirmed. */
export async function noteSignature(
  wallet: string,
  shell: number,
  day: number,
  sha256: string,
  signature: string,
) {
  const note = await noteWith(wallet, shell, day, sha256)
  if (!note) throw new ClipError('no clip like that')
  const marked = { ...note, signature }
  await writeFile(notePath(wallet, shell, day, sha256), JSON.stringify(marked, null, 2))
  return marked
}

/**
 * Destroys a recording and everything that pointed at it.
 *
 * Only ever for a clip that was never dated: once a minute is on the chain, the hash it was
 * sealed with is a promise that the recording exists, and there is nothing to burn without
 * breaking it.
 */
export async function burn(wallet: string, shell: number, day: number, sha256: string) {
  const note = await noteWith(wallet, shell, day, sha256)
  if (!note) throw new ClipError('there is nothing there')
  if (note.signature) throw new ClipError('that minute is on chain — it stays')
  await rm(clipPath(note), { force: true })
  await rm(notePath(wallet, shell, day, sha256), { force: true })
  return note
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/**
 * Stores a clip and hands back where it went. The hash is recomputed rather than trusted: it is
 * what goes on chain, and a truncated upload would otherwise be sealed as if it were whole.
 */
export async function store(meta: ClipMeta, bytes: Uint8Array) {
  if (bytes.byteLength < config.clips.minBytes) throw new ClipError('that is too small to be a minute')
  if (bytes.byteLength > config.clips.maxBytes) throw new ClipError('that is larger than a clip may be')

  const digest = sha256(bytes)
  if (digest !== meta.sha256) throw new ClipError('the upload does not match its hash')

  const already = await notesFor(meta.wallet, meta.shell, meta.day)
  const same = already.find((note) => note.sha256 === digest)
  // A minute on the chain is fixed: overwriting it would leave a recording that hashes to
  // something the ledger never saw, which is the one thing this arrangement exists to prevent.
  if (same?.signature) throw new ClipError('that minute is already on chain')
  if (!same && already.length >= config.clips.perDay) {
    throw new ClipError(`a day holds ${config.clips.perDay} minutes at most`)
  }

  const key = keyFor(meta)
  const path = safePath(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)

  const note: Note = { key, sha256: digest, bytes: bytes.byteLength, at: new Date().toISOString() }
  await writeFile(notePath(meta.wallet, meta.shell, meta.day, digest), JSON.stringify(note, null, 2))
  return note
}
