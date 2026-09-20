/**
 * Reading runs off the chain, and the two instructions the platform can send on its own.
 *
 * Every time here is derived from the program's constants rather than restated, so a build with
 * the short clock moves this with it.
 */

import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js'
import {
  CLAIM_WINDOW_MS,
  DAYS_PER_SHELL,
  DAY_MS,
  RECORD_EARLY_MS,
  RECORD_LATE_MS,
  SHELL_EPOCH_MS,
  TREASURY,
  USDC_MINT,
  WEEK_MS,
} from '../config'
import idl from '../idl/coldshell.json'
import { PROGRAM_ID, runPda, usdcAta, vaultAta } from './program'

const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')

const discriminator = (kind: 'instructions' | 'accounts', name: string) => {
  const found = (idl[kind] as { name: string; discriminator: number[] }[]).find((x) => x.name === name)
  if (!found) throw new Error(`IDL ${kind} ${name} missing`)
  return Uint8Array.from(found.discriminator)
}

export type Run = {
  address: PublicKey
  user: PublicKey
  firstShell: number
  shells: number
  stake: bigint
  /** One bit per day of the run, counted from the first day of the first shell. */
  days: bigint
  /** One bit per shell, set when that week went back to the participant. */
  claimed: number
  /** One bit per shell, set when that week went to the treasury instead. */
  swept: number
  enteredAt: number
}

/** 8 discriminator + 32 + 4 + 1 + 8 + 16 + 2 + 2 + 8 + 1 */
export const RUN_SIZE = 82

export function decodeRun(address: PublicKey, data: Uint8Array): Run {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let days = 0n
  for (let i = 15; i >= 0; i--) days = (days << 8n) | BigInt(data[53 + i])
  return {
    address,
    user: new PublicKey(data.subarray(8, 40)),
    firstShell: view.getUint32(40, true),
    shells: data[44],
    stake: view.getBigUint64(45, true),
    days,
    claimed: view.getUint16(69, true),
    swept: view.getUint16(71, true),
    enteredAt: Number(view.getBigInt64(73, true)) * 1000,
  }
}

export async function fetchRuns(connection: Connection): Promise<Run[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: RUN_SIZE },
      { memcmp: { offset: 0, bytes: base58(discriminator('accounts', 'Run')) } },
    ],
  })
  return accounts
    .map(({ pubkey, account }) => decodeRun(pubkey, account.data))
    .sort((a, b) => a.enteredAt - b.enteredAt)
}

export async function fetchRun(connection: Connection, user: PublicKey): Promise<Run | null> {
  const address = runPda(user)
  const account = await connection.getAccountInfo(address)
  return account ? decodeRun(address, account.data) : null
}

// ── The clock, as the program keeps it ──────────────────────────────────────

/** Shell numbers are global and counted from zero: shell #0 is the week the epoch starts. */
export const currentShell = (now: number) => Math.floor((now - SHELL_EPOCH_MS) / WEEK_MS)

export const shellStart = (index: number) => SHELL_EPOCH_MS + index * WEEK_MS
export const shellEnd = (index: number) => shellStart(index) + WEEK_MS

/**
 * When a shell's money can move. The last day of a week stays recordable for a day after the
 * week itself ends, so settling any earlier would either refuse a week still being finished or
 * take one still being saved.
 */
export const shellSettles = (index: number) => shellEnd(index) + RECORD_LATE_MS - DAY_MS
export const claimDeadline = (index: number) => shellSettles(index) + CLAIM_WINDOW_MS

export const dayStart = (run: Run, day: number) => shellStart(run.firstShell) + day * DAY_MS
export const dayOpens = (run: Run, day: number) => dayStart(run, day) - RECORD_EARLY_MS
export const dayCloses = (run: Run, day: number) => dayStart(run, day) + RECORD_LATE_MS

export const recorded = (run: Run, day: number) => (run.days >> BigInt(day)) & 1n ? true : false
export const totalDays = (run: Run) => run.shells * DAYS_PER_SHELL

export function shellDays(run: Run, offset: number) {
  const first = offset * DAYS_PER_SHELL
  return Array.from({ length: DAYS_PER_SHELL }, (_, i) => recorded(run, first + i))
}

export const shellComplete = (run: Run, offset: number) => shellDays(run, offset).every(Boolean)

/** What one week is worth. The last shell carries the remainder, so the shares total the stake. */
export function share(run: Run, offset: number): bigint {
  const each = run.stake / BigInt(run.shells)
  if (offset + 1 < run.shells) return each
  return run.stake - each * BigInt(run.shells - 1)
}

export type ShellState =
  | 'open' // still being recorded
  | 'claimable' // finished, waiting for the participant to collect
  | 'returned' // collected
  | 'forfeit' // a day missing, the treasury may take it
  | 'expired' // finished but never collected, the treasury may take it
  | 'swept' // the treasury took it

export function shellState(run: Run, offset: number, now: number): ShellState {
  const bit = 1 << offset
  if (run.claimed & bit) return 'returned'
  if (run.swept & bit) return 'swept'
  if (now < shellSettles(run.firstShell + offset)) return 'open'
  if (!shellComplete(run, offset)) return 'forfeit'
  return now < claimDeadline(run.firstShell + offset) ? 'claimable' : 'expired'
}

export const sweepable = (state: ShellState) => state === 'forfeit' || state === 'expired'

export const closable = (run: Run, now: number) => {
  const all = (1 << run.shells) - 1
  if ((run.claimed | run.swept) === all) return true
  return now >= claimDeadline(run.firstShell + run.shells - 1)
}

// ── The two instructions that need nobody's permission but ours ──────────────

export function sweepIx(user: PublicKey, shell: number) {
  const data = new Uint8Array(9)
  data.set(discriminator('instructions', 'sweep'), 0)
  data[8] = shell
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: runPda(user), isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: usdcAta(TREASURY), isSigner: false, isWritable: true },
      { pubkey: vaultAta(user), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  })
}

export function closeIx(authority: PublicKey, user: PublicKey) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
      { pubkey: runPda(user), isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: usdcAta(TREASURY), isSigner: false, isWritable: true },
      { pubkey: vaultAta(user), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(discriminator('instructions', 'close')),
  })
}

/** getProgramAccounts wants base58, and the discriminator is the only thing we filter on. */
function base58(bytes: Uint8Array) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let value = 0n
  for (const byte of bytes) value = value * 256n + BigInt(byte)
  let out = ''
  while (value > 0n) {
    out = alphabet[Number(value % 58n)] + out
    value /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    out = '1' + out
  }
  return out
}
