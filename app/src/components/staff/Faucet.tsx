import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token'
import { PublicKey, Transaction } from '@solana/web3.js'
import { USDC_DECIMALS, USDC_MINT, explorerTxUrl } from '../../config'
import { usdcAta } from '../../lib/program'
import { usd } from './format'

/**
 * Handing test money to a tester.
 *
 * Nobody can take part without USDC, and on devnet there is nowhere for them to get it. So it
 * comes from whichever wallet is connected here — its address is on screen so it can be topped
 * up, and its balance is on screen so the running out is seen before it happens rather than
 * after somebody has been told to go and register.
 *
 * It opens the recipient's token account when they have none, which every wallet made this
 * morning does not. Refusing instead — which this did — left a new participant with no way
 * forward at all: the program will not open one either, and the only account that could pay for
 * it is this one. Opening an account is permissionless and idempotent, so doing it here costs
 * the two thousandths of a SOL it is worth and cannot go wrong twice.
 */
export function Faucet({
  balance,
  onSent,
}: {
  balance: bigint | null
  onSent: () => void
}) {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('10')
  const [state, setState] = useState<{
    busy?: boolean
    signature?: string
    /** Whether this also opened their token account, which is worth saying once. */
    opened?: boolean
    error?: string
  }>({})

  const send = async () => {
    if (!publicKey) return setState({ error: 'connect the wallet holding the usdc' })
    setState({ busy: true })
    try {
      const recipient = new PublicKey(to.trim())
      const units = BigInt(Math.round(Number(amount) * 10 ** USDC_DECIMALS))
      if (units <= 0n) throw new Error('nothing to send')

      const theirs = usdcAta(recipient)
      const opening = !(await connection.getAccountInfo(theirs))

      const tx = new Transaction()
      if (opening) {
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(publicKey, theirs, recipient, USDC_MINT),
        )
      }
      tx.add(
        createTransferCheckedInstruction(usdcAta(publicKey), USDC_MINT, theirs, publicKey, units, USDC_DECIMALS),
      )
      const signature = await sendTransaction(tx, connection)
      const latest = await connection.getLatestBlockhash()
      await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      setState({ signature, opened: opening })
      setTo('')
      onSent()
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <section className="faucet">
      <h2>send usdc</h2>
      <p className="dim">
        from {publicKey ? <code>{publicKey.toBase58()}</code> : 'the wallet you connect above'}
        {balance !== null && <> · holding <b>{usd(balance)}</b></>}
      </p>
      <div className="faucet-row">
        <input
          className="faucet-to"
          placeholder="participant wallet"
          spellCheck={false}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <input
          className="faucet-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="usdc"
        />
        <button type="button" className="act" disabled={!to.trim() || state.busy} onClick={() => void send()}>
          {state.busy ? 'sending…' : 'send'}
        </button>
      </div>
      {state.error && <p className="staff-error">{state.error}</p>}
      {state.signature && (
        <p className="dim">
          sent{state.opened && ', and their usdc account opened'} ·{' '}
          <a href={explorerTxUrl(state.signature)} target="_blank" rel="noreferrer">
            {state.signature.slice(0, 16)}…
          </a>
        </p>
      )}
    </section>
  )
}
