import type { PublicKey } from '@solana/web3.js'

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const pad = (n: number) => String(n).padStart(2, '0')

export const usd = (base: bigint | number) => `$${(Number(base) / 1e6).toFixed(2)}`

export const short = (key: PublicKey | string) => {
  const s = key.toString()
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

/** Chain time. Local time appears once, next to it, and never on its own. */
export function utc(ms: number, withTime = true) {
  const d = new Date(ms)
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${WEEKDAYS[d.getUTCDay()]}`
  return withTime ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day
}

export function stamp(ms: number) {
  const d = new Date(ms)
  return `${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export function local(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function span(ms: number) {
  if (ms <= 0) return 'now'
  const units: [number, string][] = [[86_400_000, 'd'], [3_600_000, 'h'], [60_000, 'm'], [1000, 's']]
  const parts: string[] = []
  let left = ms
  for (const [size, label] of units) {
    const n = Math.floor(left / size)
    left -= n * size
    if (n) parts.push(`${n}${label}`)
  }
  return parts.slice(0, 2).join(' ') || '0s'
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
