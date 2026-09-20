/**
 * Everything the server needs to speak to the program.
 *
 * The instructions are assembled by hand from the IDL rather than through an Anchor client: the
 * program has five of them and two account layouts, and a client would be a dependency, a
 * provider and a wallet adapter to save a dozen lines.
 */

import { readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { SystemProgram } from '@solana/web3.js'
import { config } from './config.ts'

type Idl = {
  address: string
  constants: { name: string; value: string }[]
  instructions: { name: string; discriminator: number[] }[]
  accounts: { name: string; discriminator: number[] }[]
}

const idl: Idl = JSON.parse(
  readFileSync(new URL('./idl/coldshell.json', import.meta.url), 'utf8'),
)

const constant = (name: string) => {
  const found = idl.constants.find((c) => c.name === name)
  if (!found) throw new Error(`IDL constant ${name} missing`)
  return found.value
}

const discriminator = (name: string) => {
  const found = idl.instructions.find((i) => i.name === name)
  if (!found) throw new Error(`IDL instruction ${name} missing`)
  return Buffer.from(found.discriminator)
}

export const PROGRAM_ID = new PublicKey(idl.address)
export const USDC_MINT = new PublicKey(constant('USDC_MINT'))
export const TREASURY = new PublicKey(constant('TREASURY'))

export const DAY_SECONDS = Number(constant('DAY_SECONDS'))
export const WEEK_SECONDS = Number(constant('WEEK_SECONDS'))
export const SHELL_EPOCH_TS = Number(constant('SHELL_EPOCH_TS'))
export const DAYS_PER_SHELL = Number(constant('DAYS_PER_SHELL'))
export const RECORD_EARLY_SECONDS = Number(constant('RECORD_EARLY_SECONDS'))
export const RECORD_LATE_SECONDS = Number(constant('RECORD_LATE_SECONDS'))
export const CLAIM_WINDOW_SECONDS = Number(constant('CLAIM_WINDOW_SECONDS'))
export const MAX_SHELLS = Number(constant('MAX_SHELLS'))
export const MIN_STAKE = Number(constant('MIN_STAKE'))
export const MAX_STAKE = Number(constant('MAX_STAKE'))

export const connection = new Connection(config.rpcUrl, 'confirmed')

/**
 * The hot wallet that pays every fee and every lamport of rent, so that taking part never
 * requires holding SOL. Deliberately not the program's upgrade authority: if this server is
 * ever taken, the damage should stop at one wallet's SOL.
 */
export const payer = loadPayer()

function loadPayer() {
  const inline = process.env.PAYER_SECRET_KEY
  const raw = inline ?? readFileSync(config.payerKeyPath, 'utf8')
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]))
}

export const runPda = (user: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('run'), user.toBuffer()], PROGRAM_ID)[0]

export const usdcAta = (owner: PublicKey) =>
  getAssociatedTokenAddressSync(USDC_MINT, owner, true)

export const vaultAta = (user: PublicKey) => usdcAta(runPda(user))

// ── The clock, as the program keeps it ──────────────────────────────────────

export const nowSeconds = () => Math.floor(Date.now() / 1000)

export const currentShell = (now = nowSeconds()) =>
  Math.floor((now - SHELL_EPOCH_TS) / WEEK_SECONDS) + 1

/** Where a run paid for at `now` would begin: always the next shell. */
export const startingShell = (now = nowSeconds()) => currentShell(now) + 1

export const shellStart = (index: number) => SHELL_EPOCH_TS + (index - 1) * WEEK_SECONDS

// ── The run account, read by hand ───────────────────────────────────────────

export type Run = {
  user: PublicKey
  firstShell: number
  shells: number
  stake: bigint
  days: bigint
  claimed: number
  swept: number
  enteredAt: number
}

export async function fetchRun(user: PublicKey): Promise<Run | null> {
  const account = await connection.getAccountInfo(runPda(user))
  if (!account) return null
  const d = account.data
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
  let days = 0n
  for (let i = 15; i >= 0; i--) days = (days << 8n) | BigInt(d[53 + i]!)
  return {
    user: new PublicKey(d.subarray(8, 40)),
    firstShell: view.getUint32(40, true),
    shells: d[44]!,
    stake: view.getBigUint64(45, true),
    days,
    claimed: view.getUint16(69, true),
    swept: view.getUint16(71, true),
    enteredAt: Number(view.getBigInt64(73, true)),
  }
}

export const dayStart = (run: Run, day: number) =>
  shellStart(run.firstShell) + day * DAY_SECONDS

export const recorded = (run: Run, day: number) => ((run.days >> BigInt(day)) & 1n) === 1n

export const totalDays = (run: Run) => run.shells * DAYS_PER_SHELL

/** When a shell's money can move: a day after the week ends, where the last day's grace runs out. */
export const shellSettles = (index: number) =>
  shellStart(index) + WEEK_SECONDS + RECORD_LATE_SECONDS - DAY_SECONDS

export function shellComplete(run: Run, offset: number) {
  const mask = ((1n << BigInt(DAYS_PER_SHELL)) - 1n) << BigInt(offset * DAYS_PER_SHELL)
  return (run.days & mask) === mask
}

/** What one week is worth; the last shell carries the remainder. */
export function share(run: Run, offset: number) {
  const each = run.stake / BigInt(run.shells)
  return offset + 1 < run.shells ? each : run.stake - each * BigInt(run.shells - 1)
}

// ── Instructions ────────────────────────────────────────────────────────────

const meta = (pubkey: PublicKey, isSigner = false, isWritable = false) => ({
  pubkey,
  isSigner,
  isWritable,
})

export function enterIx(user: PublicKey, shells: number, stake: bigint) {
  const data = Buffer.alloc(17)
  discriminator('enter').copy(data, 0)
  data.writeUInt8(shells, 8)
  data.writeBigUInt64LE(stake, 9)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(user, true),
      meta(payer.publicKey, true, true),
      meta(runPda(user), false, true),
      meta(USDC_MINT),
      meta(usdcAta(user), false, true),
      meta(vaultAta(user), false, true),
      meta(TOKEN_PROGRAM_ID),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID),
      meta(SystemProgram.programId),
    ],
    data,
  })
}

export function recordDayIx(user: PublicKey, day: number, sha256: Buffer) {
  const data = Buffer.alloc(42)
  discriminator('record_day').copy(data, 0)
  data.writeUInt16LE(day, 8)
  sha256.copy(data, 10)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [meta(user, true), meta(runPda(user), false, true)],
    data,
  })
}

export function claimIx(user: PublicKey, shell: number) {
  const data = Buffer.alloc(9)
  discriminator('claim').copy(data, 0)
  data.writeUInt8(shell, 8)
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(user, true),
      meta(runPda(user), false, true),
      meta(USDC_MINT),
      meta(usdcAta(user), false, true),
      meta(vaultAta(user), false, true),
      meta(TOKEN_PROGRAM_ID),
    ],
    data,
  })
}

/**
 * The transaction the browser gets back: ours signed, theirs missing.
 *
 * The server only ever signs instructions it built here. Signing one handed to it would make
 * this wallet a free fee payer for anyone — and worse, it appears in `enter` as a writable
 * signer, so a transaction someone else composed could spend it.
 */
export async function prepare(ix: TransactionInstruction) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight })
  tx.add(ix)
  tx.partialSign(payer)
  return {
    tx: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    lastValidBlockHeight,
  }
}
