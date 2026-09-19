import { PublicKey } from '@solana/web3.js'
import idl from './idl/coldshell.json'

// Discord invite link — edit here
export const DISCORD_INVITE_URL = 'https://discord.gg/QAJcGjP3Sh'
// The code, open to anyone who wants to check what the program actually does.
export const REPO_URL = 'https://github.com/rozzcho/coldshell'

// Defaults target the local validator (scripts/local-validator.sh); deployments set VITE_*.
export const RPC_ENDPOINT = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8899'
export const NETWORK = import.meta.env.VITE_SOLANA_NETWORK ?? 'localnet'
export const NETWORK_LABEL = NETWORK === 'devnet' ? 'Devnet' : NETWORK === 'mainnet' ? 'Mainnet' : 'Localnet'

function idlConstant(name: string): string {
  const constant = idl.constants.find((c) => c.name === name)
  if (!constant) throw new Error(`IDL constant ${name} missing`)
  return String(constant.value)
}

const seconds = (name: string) => Number(idlConstant(name)) * 1000

export const USDC_MINT = new PublicKey(idlConstant('USDC_MINT'))
export const USDC_DECIMALS = 6

/** Where forfeited stakes and returned rent go. */
export const TREASURY = new PublicKey(idlConstant('TREASURY'))

// Every duration comes out of the program, so the screen and the chain cannot disagree about
// how long a day is — including when the program was built with the short clock.
export const SHELL_EPOCH_MS = seconds('SHELL_EPOCH_TS')
export const DAY_MS = seconds('DAY_SECONDS')
export const WEEK_MS = seconds('WEEK_SECONDS')
export const RECORD_EARLY_MS = seconds('RECORD_EARLY_SECONDS')
export const RECORD_LATE_MS = seconds('RECORD_LATE_SECONDS')
export const CLAIM_WINDOW_MS = seconds('CLAIM_WINDOW_SECONDS')
export const START_GRACE_MS = seconds('START_GRACE_SECONDS')

export const DAYS_PER_SHELL = Number(idlConstant('DAYS_PER_SHELL'))
export const MAX_SHELLS = Number(idlConstant('MAX_SHELLS'))
export const MIN_STAKE_USDC = Number(idlConstant('MIN_STAKE')) / 10 ** USDC_DECIMALS
export const MAX_STAKE_USDC = Number(idlConstant('MAX_STAKE')) / 10 ** USDC_DECIMALS

/** A day is ten minutes rather than a day, so a whole run can be walked through in an hour. */
export const SHORT_CLOCK = DAY_MS !== 86_400_000

export function explorerUrl(kind: 'tx' | 'address', id: string) {
  const cluster =
    NETWORK === 'mainnet'
      ? ''
      : NETWORK === 'devnet'
        ? '?cluster=devnet'
        : `?cluster=custom&customUrl=${encodeURIComponent(RPC_ENDPOINT)}`
  return `https://explorer.solana.com/${kind}/${id}${cluster}`
}

export const explorerTxUrl = (signature: string) => explorerUrl('tx', signature)
