import type { ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import '@solana/wallet-adapter-react-ui/styles.css'
import { RPC_ENDPOINT } from '../config'
import { BurnerWalletAdapter } from './burner'

// Nightly and other Wallet Standard wallets are detected automatically, so the only adapter ever
// listed here is the development burner, and only when it is asked for.
const wallets =
  import.meta.env.DEV && import.meta.env.VITE_BURNER === '1' ? [new BurnerWalletAdapter()] : []

export function SolanaProvider({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
