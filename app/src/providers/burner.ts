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
  BaseMessageSignerWalletAdapter,
  WalletNotConnectedError,
  WalletReadyState,
  type WalletName,
} from '@solana/wallet-adapter-base'
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js'

const STORAGE_KEY = 'coldshell.burner'

/** The DER wrapper that turns a bare ed25519 seed into something WebCrypto will import. */
const PKCS8_ED25519 = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
])

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

export class BurnerWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = 'Burner (dev)' as WalletName<'Burner (dev)'>
  url = 'https://github.com/sychchou/coldshell'
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

  /**
   * WebCrypto can do ed25519, and a solana secret key is its seed followed by its public half —
   * so the seed goes in as PKCS8 and no signing library is needed for a wallet that only exists
   * to save a developer from clicking.
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const keypair = this.#keypair
    if (!keypair) throw new WalletNotConnectedError()
    const pkcs8 = new Uint8Array(48)
    pkcs8.set(PKCS8_ED25519, 0)
    pkcs8.set(keypair.secretKey.subarray(0, 32), PKCS8_ED25519.length)
    const key = await crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', false, ['sign'])
    return new Uint8Array(await crypto.subtle.sign('Ed25519', key, message as BufferSource))
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const keypair = this.#keypair
    if (!keypair) throw new WalletNotConnectedError()
    if (transaction instanceof VersionedTransaction) transaction.sign([keypair])
    else transaction.partialSign(keypair)
    return transaction
  }
}
