/**
 * A wallet that lives in this tab. Development only.
 *
 * Driving the whole loop — pay, seal, claim — otherwise needs a browser extension and a human to
 * click through it, which is exactly the thing you cannot do while checking the wiring. The key
 * is kept in localStorage so the address survives a reload and can be funded once.
 *
 * It is never registered outside `vite dev`, and only then with VITE_BURNER=1.
 */

import {
  BaseSignerWalletAdapter,
  WalletNotConnectedError,
  WalletReadyState,
  type WalletName,
} from '@solana/wallet-adapter-base'
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js'

const STORAGE_KEY = 'coldshell.burner'

const ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0e1013"/><text x="12" y="17" font-family="Georgia,serif" font-size="14" fill="#7a9cff" text-anchor="middle">c</text></svg>',
  )

function load() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved) as number[]))
  const fresh = Keypair.generate()
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...fresh.secretKey]))
  return fresh
}

export class BurnerWalletAdapter extends BaseSignerWalletAdapter {
  name = 'Burner (dev)' as WalletName<'Burner (dev)'>
  url = 'https://github.com/suaacho/coldshell'
  icon = ICON
  supportedTransactionVersions = null
  readonly readyState = WalletReadyState.Loadable

  #keypair: Keypair | null = null
  #connecting = false

  get connecting() {
    return this.#connecting
  }

  get publicKey() {
    return this.#keypair?.publicKey ?? null
  }

  async connect() {
    this.#connecting = true
    try {
      this.#keypair = load()
      this.emit('connect', this.#keypair.publicKey)
    } finally {
      this.#connecting = false
    }
  }

  async disconnect() {
    this.#keypair = null
    this.emit('disconnect')
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const keypair = this.#keypair
    if (!keypair) throw new WalletNotConnectedError()
    if (transaction instanceof VersionedTransaction) transaction.sign([keypair])
    else transaction.partialSign(keypair)
    return transaction
  }
}
