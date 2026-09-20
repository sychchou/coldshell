import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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

/** The clip and its note share a name; only the extension differs. */
function stem(wallet: string, shell: number, day: number) {
  if (!WALLET.test(wallet)) throw new ClipError('bad wallet')
  if (!Number.isInteger(shell) || shell < 1) throw new ClipError('bad shell')
  if (!Number.isInteger(day) || day < 1 || day > 70) throw new ClipError('bad day')
  return `${wallet}/${shell}-${String(day).padStart(2, '0')}`
}

/** Everything about a clip that decides where it lives, checked before anything touches disk. */
export function keyFor(meta: ClipMeta) {
  if (!SHA256.test(meta.sha256)) throw new ClipError('bad hash')
  return `${stem(meta.wallet, meta.shell, meta.day)}.${extensionFor(meta.type)}`
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

const notePath = (wallet: string, shell: number, day: number) =>
  safePath(`${stem(wallet, shell, day)}.json`)

function safePath(key: string) {
  // resolve() keeps a crafted key from climbing out of the clip directory.
  const path = resolve(join(config.clips.dir, key))
  if (!path.startsWith(resolve(config.clips.dir))) throw new ClipError('bad key')
  return path
}

export async function readNote(wallet: string, shell: number, day: number): Promise<Note | null> {
  try {
    return JSON.parse(await readFile(notePath(wallet, shell, day), 'utf8')) as Note
  } catch {
    return null
  }
}

/** Ties the clip to the transaction that timestamped it, once that transaction has confirmed. */
export async function noteSignature(
  wallet: string,
  shell: number,
  day: number,
  signature: string,
) {
  const note = await readNote(wallet, shell, day)
  if (!note) throw new ClipError('no clip for that day')
  await writeFile(notePath(wallet, shell, day), JSON.stringify({ ...note, signature }, null, 2))
  return { ...note, signature }
}

/**
 * Destroys a recording and everything that pointed at it.
 *
 * Only ever for a clip that was never dated: once a day is on the chain, the hash it was sealed
 * with is a promise that the recording exists, and there is nothing to burn without breaking it.
 */
export async function burn(wallet: string, shell: number, day: number) {
  const note = await readNote(wallet, shell, day)
  if (!note) throw new ClipError('there is nothing there')
  if (note.signature) throw new ClipError('that day is on chain — its clip stays')
  await rm(safePath(note.key), { force: true })
  await rm(notePath(wallet, shell, day), { force: true })
  return note
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/**
 * Stores a clip and hands back where it went. The hash is recomputed rather than trusted: it is
 * what goes on chain, and a truncated upload would otherwise be sealed as if it were whole.
 */
export async function store(meta: ClipMeta, bytes: Uint8Array) {
  // A day whose clip is already on chain is finished. Overwriting it would leave a recording
  // that hashes to something the ledger never saw — the one thing this whole arrangement exists
  // to prevent. Before the signature there is nothing to protect, so a retake is fine.
  const dated = await readNote(meta.wallet, meta.shell, meta.day)
  if (dated?.signature) throw new ClipError('that day is already on chain — its clip cannot be replaced')

  if (bytes.byteLength < config.clips.minBytes) throw new ClipError('that is too small to be a minute')
  if (bytes.byteLength > config.clips.maxBytes) throw new ClipError('that is larger than a clip may be')

  const digest = sha256(bytes)
  if (digest !== meta.sha256) throw new ClipError('the upload does not match its hash')

  const key = keyFor(meta)
  const path = safePath(key)

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)

  const note: Note = { key, sha256: digest, bytes: bytes.byteLength, at: new Date().toISOString() }
  await writeFile(notePath(meta.wallet, meta.shell, meta.day), JSON.stringify(note, null, 2))
  return note
}
