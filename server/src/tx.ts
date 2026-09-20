/**
 * Transactions the platform pays for.
 *
 * The participant never needs SOL, so every fee and every lamport of rent comes from one hot
 * wallet here. That is the whole reason these routes exist — and it is also the only thing that
 * can go wrong with them, because **a signature is a payment**. Each route therefore checks
 * everything the program is about to check, before signing: a transaction that lands and fails
 * costs the same fee as one that works.
 *
 * The routes take parameters, never a transaction. Signing one handed in from outside would turn
 * this wallet into a free fee payer for anyone, and in `enter` it is a writable signer, so a
 * transaction composed elsewhere could simply spend it.
 */

import { PublicKey } from '@solana/web3.js'
import {
  CLAIM_WINDOW_SECONDS,
  DAYS_PER_SHELL,
  MAX_SHELLS,
  MAX_STAKE,
  MIN_STAKE,
  RECORD_EARLY_SECONDS,
  RECORD_LATE_SECONDS,
  claimIx,
  connection,
  dayStart,
  enterIx,
  fetchRun,
  nowSeconds,
  prepare,
  recordDayIx,
  recorded,
  runPda,
  shellComplete,
  shellSettles,
  startingShell,
  totalDays,
  usdcAta,
} from './chain.ts'
import { noteWith, notesFor } from './clips.ts'
import { config } from './config.ts'

export class TxError extends Error {}

// The explicit type is what lets TypeScript treat a refusal as the end of the road, so the
// checks below read as a list rather than a ladder of else branches.
const refuse: (message: string) => never = (message) => {
  throw new TxError(message)
}

function wallet(value: unknown) {
  if (typeof value !== 'string') refuse('no wallet')
  try {
    return new PublicKey(value)
  } catch {
    return refuse('that is not an address')
  }
}

function whole(value: unknown, name: string) {
  const n = Number(value)
  if (!Number.isInteger(n)) refuse(`${name} has to be a whole number`)
  return n
}

/** How much USDC a wallet can actually stake. A missing account means none. */
async function usdcBalance(owner: PublicKey) {
  try {
    const balance = await connection.getTokenAccountBalance(usdcAta(owner))
    return BigInt(balance.value.amount)
  } catch {
    return 0n
  }
}

export async function enter(body: Record<string, unknown>) {
  const user = wallet(body.wallet)
  const shells = whole(body.shells, 'weeks')
  const stake = BigInt(whole(body.stake, 'stake'))

  if (shells < 1 || shells > MAX_SHELLS) refuse(`a run is 1 to ${MAX_SHELLS} weeks`)
  if (stake < BigInt(MIN_STAKE) || stake > BigInt(MAX_STAKE)) {
    refuse(`a stake is $${MIN_STAKE / 1e6} to $${MAX_STAKE / 1e6}`)
  }
  // One run per wallet: a second `enter` fails on chain, and we would pay for the failure.
  if (await connection.getAccountInfo(runPda(user))) refuse('that wallet already has a run open')
  if ((await usdcBalance(user)) < stake) refuse('not enough usdc in that wallet')

  return { ...(await prepare(enterIx(user, shells, stake))), firstShell: startingShell() }
}

export async function recordDay(body: Record<string, unknown>) {
  const user = wallet(body.wallet)
  const day = whole(body.day, 'day')
  const hash = String(body.sha256 ?? '')
  if (!/^[0-9a-f]{64}$/.test(hash)) refuse('that is not a hash')

  const run = await fetchRun(user)
  if (!run) refuse('that wallet has no run open')
  if (day < 0 || day >= totalDays(run)) refuse('that day is not part of the run')

  const now = nowSeconds()
  const starts = dayStart(run, day)
  if (now < starts - RECORD_EARLY_SECONDS) refuse('that day has not started yet')
  if (now > starts + RECORD_LATE_SECONDS) refuse('that day can no longer be recorded')

  // Without a clip this route is a button that spends our SOL. There is no oracle here and it
  // is not pretending to be one — the participant could sign this themselves for nothing. It is
  // our own fee we are refusing to pay twice.
  const shell = run.firstShell + Math.floor(day / DAYS_PER_SHELL)
  const note = await noteWith(user.toBase58(), shell, day + 1, hash)
  if (!note) refuse('upload the clip first')
  if (note.signature) refuse('that minute is already on chain')

  // A day holds a handful of minutes and every one of them costs us a fee to date, so the
  // ceiling lives here, where the fee is spent.
  const dated = (await notesFor(user.toBase58(), shell, day + 1)).filter((n) => n.signature).length
  if (dated >= config.clips.perDay) refuse(`a day holds ${config.clips.perDay} minutes at most`)

  return { ...(await prepare(recordDayIx(user, day, Buffer.from(hash, 'hex')))), shell }
}

export async function claim(body: Record<string, unknown>) {
  const user = wallet(body.wallet)
  const shell = whole(body.shell, 'shell')

  const run = await fetchRun(user)
  if (!run) refuse('that wallet has no run open')
  const offset = shell - run.firstShell
  if (offset < 0 || offset >= run.shells) refuse('that shell is not part of the run')

  const bit = 1 << offset
  if (run.claimed & bit) refuse('that shell has already been claimed')
  if (run.swept & bit) refuse('that shell has already been swept')

  const now = nowSeconds()
  const settles = shellSettles(shell)
  if (now < settles) refuse('that shell has not settled yet')
  if (!shellComplete(run, offset)) refuse('a day of that shell is missing')
  if (now >= settles + CLAIM_WINDOW_SECONDS) refuse('the window to claim that shell has closed')

  return prepare(claimIx(user, offset))
}
