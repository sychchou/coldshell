import { useEffect, useRef, useState } from 'react'
import { StaffPage } from './components/staff/StaffPage'
import { Contact } from './components/Contact'
import { Tagline } from './components/Tagline'
import { Terminal } from './components/terminal/Terminal'

const TINT_MS = 1000

export default function App() {
  // The flame borrows a dot's colour for a moment, then goes back to its own.
  const [tint, setTint] = useState<string | null>(null)
  const timer = useRef<number>(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const light = (colour: string) => {
    window.clearTimeout(timer.current)
    setTint(colour)
    timer.current = window.setTimeout(() => setTint(null), TINT_MS)
  }

  // One extra page, no router: /staff is for running the challenges.
  if (window.location.pathname.replace(/\/$/, '') === '/staff') return <StaffPage />

  return (
    <main className="page">
      <Tagline tint={tint} />
      <Terminal onTint={light} />
      <Contact />
    </main>
  )
}
