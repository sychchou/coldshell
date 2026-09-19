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
export const noteSignature = (wallet: string, shell: number, day: number, signature: string) =>
  post<{ signature: string }>('/api/clip/signature', { wallet, shell, day, signature })

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
