import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import idl from '../idl/coldshell.json'
import { USDC_MINT } from '../config'

export const PROGRAM_ID = new PublicKey(idl.address)

/** One run per wallet. Closing it frees the address for the next one. */
export function runPda(user: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('run'), user.toBuffer()], PROGRAM_ID)[0]
}

/** The stake sits in the run's own associated token account. */
export const vaultAta = (user: PublicKey) => usdcAta(runPda(user))

export function usdcAta(owner: PublicKey) {
  return getAssociatedTokenAddressSync(USDC_MINT, owner, true)
}
