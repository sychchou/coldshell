/**
 * The server's half of a transaction.
 *
 * Every fee and every lamport of rent is the platform's, so the fee payer is a key the browser
 * cannot reach. These routes hand back a transaction the server assembled and signed; the wallet
 * signs second and we send it ourselves.
 */

import type { Connection, Transaction } from '@solana/web3.js'
import { signAndConfirm } from './send'

export type Prepared = { tx: string; lastValidBlockHeight: number }

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error ?? `${path} failed (${response.status})`)
  return json as T
}

export const enterTx = (wallet: string, shells: number, stake: number) =>
  post<Prepared & { firstShell: number }>('/api/tx/enter', { wallet, shells, stake })

export const recordDayTx = (wallet: string, day: number, sha256: string) =>
  post<Prepared & { shell: number }>('/api/tx/record-day', { wallet, day, sha256 })

export const claimTx = (wallet: string, shell: number) =>
  post<Prepared>('/api/tx/claim', { wallet, shell })

/** Ties a clip to the transaction that timestamped it, so the hash can be found again later. */
export const noteSignature = (
  wallet: string,
  shell: number,
  day: number,
  sha256: string,
  signature: string,
) => post<{ signature: string }>('/api/clip/signature', { wallet, shell, day, sha256, signature })

/** The sentence a wallet signs to prove a request is its own. Must match the server, exactly. */
export const proof = (purpose: string, wallet: string, issuedAt: string) =>
  `coldshell\n${purpose}\n${wallet}\n${issuedAt}`

export type FilmLink = {
  url: string
  name: string
  bytes: number
  seconds: number
  days: number
  from: number
  to: number
}

export type Kept = {
  day: number
  shell: number
  sha256: string
  bytes: number
  at: string
  /** Absent means the day never reached the chain: recorded, but not dated. */
  signature?: string
  /** Whether that can still be put right — the program refuses a day once its window shuts. */
  signable: boolean
}

/** A signature is asked for once and spent once, so the caller passes what it is for. */
async function signed<T>(
  purpose: string,
  wallet: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  path: string,
  extra: Record<string, unknown> = {},
) {
  const issuedAt = new Date().toISOString()
  const sig = await signMessage(new TextEncoder().encode(proof(purpose, wallet, issuedAt)))
  return post<T>(path, {
    wallet,
    issuedAt,
    signature: btoa(String.fromCharCode(...sig)),
    ...extra,
  })
}

export const keptClips = (wallet: string, signMessage: (m: Uint8Array) => Promise<Uint8Array>) =>
  signed<{ clips: Kept[] }>('show me my clips', wallet, signMessage, '/api/clips')

export const burnClip = (
  wallet: string,
  signMessage: (m: Uint8Array) => Promise<Uint8Array>,
  shell: number,
  day: number,
  sha256: string,
) => signed<{ sha256: string }>('burn a clip', wallet, signMessage, '/api/clip/burn', { shell, day, sha256 })

/**
 * Asks for the run's film. The address alone cannot be the key to somebody's diary — every
 * address is written on the chain in plain sight — so the wallet signs for it.
 */
export const filmLink = (wallet: string, signMessage: (m: Uint8Array) => Promise<Uint8Array>) =>
  signed<FilmLink>('give me my film', wallet, signMessage, '/api/film')

export function sendPrepared(
  connection: Connection,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  prepared: Prepared,
) {
  return signAndConfirm(
    connection,
    signTransaction,
    Buffer.from(prepared.tx, 'base64'),
    prepared.lastValidBlockHeight,
  )
}
