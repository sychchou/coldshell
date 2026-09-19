import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config.ts'
import { ClipError, noteSignature, store } from './clips.ts'
import { TxError, claim, enter, recordDay } from './tx.ts'

const app = new Hono()

app.use('/api/*', cors({ origin: config.appUrl }))

app.get('/api/health', (c) => c.json({ ok: true }))

/**
 * Takes today's minute. The body is the recording itself: at this size going straight through
 * the server is simpler than handing out presigned URLs, and the storage behind this can move
 * to R2 without the browser noticing.
 */
app.post('/api/clip', async (c) => {
  const { wallet, shell, day, sha256 } = c.req.query()
  const type = c.req.header('content-type') ?? ''
  try {
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    const stored = await store({ wallet, shell: Number(shell), day: Number(day), sha256, type }, bytes)
    return c.json(stored)
  } catch (err) {
    if (err instanceof ClipError) return c.json({ error: err.message }, 400)
    console.error('[clip]', err)
    return c.json({ error: 'could not store that' }, 500)
  }
})

/**
 * The three transactions the platform pays for. Each route takes parameters and hands back a
 * transaction it assembled and signed itself; the browser adds the wallet's signature and sends
 * it. See tx.ts for why it must never be the other way round.
 */
const transactions = { enter, 'record-day': recordDay, claim } as const

for (const [name, build] of Object.entries(transactions)) {
  app.post(`/api/tx/${name}`, async (c) => {
    try {
      return c.json(await build(await c.req.json()))
    } catch (err) {
      if (err instanceof TxError) return c.json({ error: err.message }, 400)
      console.error(`[tx/${name}]`, err)
      return c.json({ error: 'could not build that transaction' }, 500)
    }
  })
}

/**
 * The signature a day was recorded with, kept beside the clip. The hash itself is permanent in
 * the instruction data, but only findable if you know which transaction to look in — and the
 * event log that would otherwise say is pruned within days.
 */
app.post('/api/clip/signature', async (c) => {
  const { wallet, shell, day, signature } = await c.req.json()
  try {
    return c.json(await noteSignature(wallet, Number(shell), Number(day), String(signature)))
  } catch (err) {
    if (err instanceof ClipError) return c.json({ error: err.message }, 400)
    console.error('[clip/signature]', err)
    return c.json({ error: 'could not note that' }, 500)
  }
})

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`coldshell on http://localhost:${port}`)
})
