import assert from 'node:assert/strict'
import { createPrivateKey, sign } from 'node:crypto'
import test from 'node:test'
import { Keypair } from '@solana/web3.js'
import { ProofError, check, message } from '../src/proof.ts'

/** The DER wrapper that lets node sign with a bare ed25519 seed, as a wallet would. */
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex')

const signerFor = (keypair: Keypair) => (text: string) =>
  sign(
    null,
    Buffer.from(text, 'utf8'),
    createPrivateKey({
      key: Buffer.concat([PKCS8, Buffer.from(keypair.secretKey.subarray(0, 32))]),
      format: 'der',
      type: 'pkcs8',
    }),
  ).toString('base64')

const keypair = Keypair.generate()
const wallet = keypair.publicKey.toBase58()
const signWith = signerFor(keypair)
const now = () => new Date().toISOString()

const refused = (fn: () => void, because: string) => {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ProofError, `expected a refusal, got ${err}`)
    assert.match(err.message, new RegExp(because))
    return true
  })
}

test('a wallet signing for itself', () => {
  const at = now()
  check('give me my film', wallet, at, signWith(message('give me my film', wallet, at)))
})

test('a signature taken for one purpose cannot be spent on another', () => {
  const at = now()
  refused(
    () => check('burn a clip', wallet, at, signWith(message('give me my film', wallet, at))),
    'not this wallet',
  )
})

test('somebody else signing for this wallet', () => {
  const at = now()
  refused(
    () => check('give me my film', wallet, at, signerFor(Keypair.generate())(message('give me my film', wallet, at))),
    'not this wallet',
  )
})

test('a signature from an hour ago', () => {
  const at = new Date(Date.now() - 60 * 60_000).toISOString()
  refused(() => check('give me my film', wallet, at, signWith(message('give me my film', wallet, at))), 'expired')
})

test('a wallet asking for somebody else’s things', () => {
  const at = now()
  const other = Keypair.generate().publicKey.toBase58()
  refused(() => check('give me my film', other, at, signWith(message('give me my film', other, at))), 'not this wallet')
})

test('nonsense instead of a time, and instead of an address', () => {
  refused(() => check('give me my film', wallet, 'soon', signWith('anything')), 'not a time')
  refused(() => check('give me my film', 'not-a-wallet', now(), 'AAAA'), 'not an address')
})
