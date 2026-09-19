/**
 * Runs for a local validator to start with.
 *
 * `enter` takes its first shell from the clock, so a live validator can only ever be given runs
 * that start now — and a board with one week on it shows nothing about how a board reads. This
 * writes the accounts straight into the ledger instead, one run per state worth looking at.
 *
 *   node app/scripts/seed-fixtures.mjs        # writes .fixtures/ and prints the validator flags
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { PublicKey, Keypair } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

const idl = JSON.parse(readFileSync(new URL('../src/idl/coldshell.json', import.meta.url)))
const constant = (name) => idl.constants.find((c) => c.name === name).value

const PROGRAM = new PublicKey(idl.address)
const MINT = new PublicKey(constant('USDC_MINT'))
const TREASURY = new PublicKey(constant('TREASURY'))
const DISC = Uint8Array.from(idl.accounts.find((a) => a.name === 'Run').discriminator)
const WEEK = Number(constant('WEEK_SECONDS'))
const EPOCH = Number(constant('SHELL_EPOCH_TS'))
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')

const now = Math.floor(Date.now() / 1000)
const shellNow = Math.floor((now - EPOCH) / WEEK) + 1
const USDC = 1_000_000

/** Seven bits, one per day, from a list of the days that were recorded. */
const week = (days) => days.reduce((mask, d) => mask | (1n << BigInt(d)), 0n)

const cast = [
  // Three weeks behind us: one taken back, one lost to a missing day, one still to collect.
  { name: 'steady', first: shellNow - 3, shells: 3, stake: 30 * USDC, weeks: [[0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]], claimed: 0b001, swept: 0b000 },
  // Finished last week, halfway through this one.
  { name: 'current', first: shellNow - 1, shells: 2, stake: 50 * USDC, weeks: [[0, 1, 2, 3, 4, 5, 6], [0, 1]], claimed: 0, swept: 0 },
  // Started this week and already behind.
  { name: 'fresh', first: shellNow, shells: 1, stake: 10 * USDC, weeks: [[0]], claimed: 0, swept: 0 },
  // Paid and never came back. One week already collected, one waiting to be.
  { name: 'gone', first: shellNow - 2, shells: 2, stake: 20 * USDC, weeks: [[], []], claimed: 0, swept: 0b01 },
]

const share = (stake, shells, offset) =>
  offset + 1 < shells ? Math.floor(stake / shells) : stake - Math.floor(stake / shells) * (shells - 1)

function runAccount(user, run) {
  const data = Buffer.alloc(82)
  data.set(DISC, 0)
  data.set(user.toBuffer(), 8)
  data.writeUInt32LE(run.first, 40)
  data.writeUInt8(run.shells, 44)
  data.writeBigUInt64LE(BigInt(run.stake), 45)
  let days = 0n
  run.weeks.forEach((w, i) => (days |= week(w) << BigInt(i * 7)))
  data.set(Buffer.from(days.toString(16).padStart(32, '0').match(/../g).reverse().join(''), 'hex'), 53)
  data.writeUInt16LE(run.claimed, 69)
  data.writeUInt16LE(run.swept, 71)
  data.writeBigInt64LE(BigInt(EPOCH + (run.first - 1) * WEEK - 60), 73)
  data.writeUInt8(255, 81) // replaced below with the real bump
  return data
}

function tokenAccount(owner, amount) {
  const data = Buffer.alloc(165)
  data.set(MINT.toBuffer(), 0)
  data.set(owner.toBuffer(), 32)
  data.writeBigUInt64LE(BigInt(amount), 64)
  data.writeUInt8(1, 108)
  return data
}

const file = (pubkey, data, owner, lamports) => ({
  pubkey: pubkey.toBase58(),
  account: {
    lamports,
    data: [data.toString('base64'), 'base64'],
    owner: owner.toBase58(),
    executable: false,
    rentEpoch: 0,
  },
})

mkdirSync(new URL('../../.fixtures/', import.meta.url), { recursive: true })
const flags = []
let kept = 0

for (const run of cast) {
  // A vanity-free keypair per run; the address is all the board ever shows.
  const user = Keypair.generate().publicKey
  const [runPda, bump] = PublicKey.findProgramAddressSync([Buffer.from('run'), user.toBuffer()], PROGRAM)
  const vault = getAssociatedTokenAddressSync(MINT, runPda, true)

  const data = runAccount(user, run)
  data.writeUInt8(bump, 81)

  let held = 0
  for (let o = 0; o < run.shells; o++) {
    const resolved = (run.claimed | run.swept) & (1 << o)
    if (resolved) kept += run.swept & (1 << o) ? share(run.stake, run.shells, o) : 0
    else held += share(run.stake, run.shells, o)
  }

  const dir = new URL(`../../.fixtures/${run.name}`, import.meta.url).pathname
  writeFileSync(`${dir}-run.json`, JSON.stringify(file(runPda, data, PROGRAM, 1_914_000), null, 2))
  writeFileSync(`${dir}-vault.json`, JSON.stringify(file(vault, tokenAccount(runPda, held), TOKEN, 2_039_280), null, 2))
  flags.push(`--account ${runPda.toBase58()} .fixtures/${run.name}-run.json`)
  flags.push(`--account ${vault.toBase58()} .fixtures/${run.name}-vault.json`)
  console.error(`${run.name.padEnd(8)} ${user.toBase58()}  shells #${run.first}–#${run.first + run.shells - 1}  held ${held / USDC}`)
}

const treasuryAta = getAssociatedTokenAddressSync(MINT, TREASURY, true)
const dir = new URL('../../.fixtures/treasury', import.meta.url).pathname
writeFileSync(`${dir}.json`, JSON.stringify(file(treasuryAta, tokenAccount(TREASURY, kept), TOKEN, 2_039_280), null, 2))
flags.push(`--account ${treasuryAta.toBase58()} .fixtures/treasury.json`)

console.log(flags.join(' '))
