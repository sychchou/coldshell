/**
 * Proving a wallet is asking for its own things.
 *
 * A film is a person's diary. The address alone cannot be the key to it — addresses are public
 * by design and every one of them is written on the chain in plain sight. So the wallet signs a
 * sentence, and the sentence says what it is for and when it was written.
 */

import { createPublicKey, verify } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'

export class ProofError extends Error {}

/** DER wrapper for a bare ed25519 public key, so node's verifier will take one. */
const SPKI = Buffer.from('302a300506032b6570032100', 'hex')

/** A signature older than this is somebody replaying a message they found. */
const WINDOW_MS = 5 * 60_000

/**
 * What the wallet is asked to sign. It names the thing being asked for, so a signature taken for
 * one purpose cannot be spent on another, and the moment, so it cannot be spent twice.
 */
export const message = (purpose: string, wallet: string, issuedAt: string) =>
  `coldshell\n${purpose}\n${wallet}\n${issuedAt}`

export function check(purpose: string, wallet: string, issuedAt: string, signature: string) {
  const age = Date.now() - Date.parse(issuedAt)
  if (!Number.isFinite(age)) throw new ProofError('that is not a time')
  if (Math.abs(age) > WINDOW_MS) throw new ProofError('that signature has expired — try again')

  let key
  try {
    key = createPublicKey({
      key: Buffer.concat([SPKI, new PublicKey(wallet).toBuffer()]),
      format: 'der',
      type: 'spki',
    })
  } catch {
    throw new ProofError('that is not an address')
  }

  const signed = verify(
    null,
    Buffer.from(message(purpose, wallet, issuedAt), 'utf8'),
    key,
    Buffer.from(signature, 'base64'),
  )
  if (!signed) throw new ProofError('that signature is not this wallet’s')
}
