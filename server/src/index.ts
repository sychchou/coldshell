import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config.ts'
import { ClipError, burn, noteSignature, store } from './clips.ts'
import { TxError, claim, enter, recordDay } from './tx.ts'
import { fetchRun } from './chain.ts'
import { PublicKey } from '@solana/web3.js'
import { FilmError, film, kept } from './film.ts'
import { ProofError, check } from './proof.ts'
import { RoomError, announceClaim, room, say } from './community.ts'
import { MemoError, readMemo, writeMemo } from './memo.ts'
import { mint, resolveLink, sweepLinks } from './links.ts'

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
  const { wallet, shell, day, sha256, signature } = await c.req.json()
  try {
    return c.json(await noteSignature(wallet, Number(shell), Number(day), String(sha256), String(signature)))
  } catch (err) {
    if (err instanceof ClipError) return c.json({ error: err.message }, 400)
    console.error('[clip/signature]', err)
    return c.json({ error: 'could not note that' }, 500)
  }
})

/**
 * The one note a wallet keeps. `said` being absent is a read rather than an erasure.
 *
 * Unsigned, like the room: a popup to look at your own note is more friction than the note is
 * worth. The cost is that a memo is as public as the address it hangs on, which is to say
 * public — so this is a line to yourself, not a secret.
 */
app.post('/api/memo', async (c) => {
  const { wallet, said } = await c.req.json()
  try {
    const memo =
      said === undefined || said === null
        ? await readMemo(String(wallet))
        : await writeMemo(String(wallet), String(said))
    return c.json({ memo })
  } catch (err) {
    if (err instanceof MemoError) return c.json({ error: err.message }, 400)
    console.error('[memo]', err)
    return c.json({ error: 'could not keep that' }, 500)
  }
})

/** The week's room. Open to read: there is nothing in it that is not said out loud. */
app.get('/api/community', async (c) => {
  try {
    return c.json({ lines: await room() })
  } catch (err) {
    console.error('[community]', err)
    return c.json({ error: 'could not read the room' }, 500)
  }
})

/**
 * Saying something, or announcing a week that came back.
 *
 * Deliberately unsigned. A wallet popup for every line would make the room unusable, and what a
 * signature would buy here is small: the name is four characters of a public address, and only
 * an address with a run can appear at all. The one line that reads as a fact — a week coming
 * back — is checked against the chain instead, which no signature could improve on.
 */
app.post('/api/community', async (c) => {
  const { wallet, said, claimed } = await c.req.json()
  try {
    const line =
      claimed === undefined || claimed === null
        ? await say(String(wallet), String(said ?? ''))
        : await announceClaim(String(wallet), Number(claimed))
    return c.json({ line })
  } catch (err) {
    if (err instanceof RoomError) return c.json({ error: err.message }, 400)
    console.error('[community]', err)
    return c.json({ error: 'could not post that' }, 500)
  }
})

/**
 * What this wallet's run has on disk, dated or not. Behind a signature because the list says
 * which days somebody recorded, which is theirs to know.
 */
app.post('/api/clips', async (c) => {
  const { wallet, issuedAt, signature } = await c.req.json()
  try {
    check('show me my clips', String(wallet), String(issuedAt), String(signature))
    const open = await fetchRun(new PublicKey(String(wallet)))
    if (!open) return c.json({ clips: [] })
    return c.json({ clips: await kept(String(wallet), open) })
  } catch (err) {
    if (err instanceof ProofError) return c.json({ error: err.message }, 400)
    console.error('[clips]', err)
    return c.json({ error: 'could not read those' }, 500)
  }
})

/** Burns an undated clip. Only its owner can ask, and only for a day the chain never took. */
app.post('/api/clip/burn', async (c) => {
  const { wallet, issuedAt, signature, shell, day, sha256 } = await c.req.json()
  try {
    check('burn a clip', String(wallet), String(issuedAt), String(signature))
    return c.json(await burn(String(wallet), Number(shell), Number(day), String(sha256)))
  } catch (err) {
    if (err instanceof ProofError || err instanceof ClipError) return c.json({ error: err.message }, 400)
    console.error('[burn]', err)
    return c.json({ error: 'could not burn that' }, 500)
  }
})

/**
 * The film, once the wallet has shown it is the wallet.
 *
 * Building it can take a moment and the file is large, so the answer is a link rather than the
 * bytes: one link, good for half an hour, which the browser can then download the ordinary way
 * and give the right name to.
 */
app.post('/api/film', async (c) => {
  const { wallet, issuedAt, signature } = await c.req.json()
  try {
    check('give me my film', String(wallet), String(issuedAt), String(signature))
    const made = await film(String(wallet))
    const token = await mint(String(wallet), made.name, config.films.ttlMs)
    return c.json({
      url: `/api/film/${token}`,
      name: made.name,
      bytes: made.bytes,
      seconds: made.seconds,
      days: made.days,
      from: made.from,
      to: made.to,
    })
  } catch (err) {
    if (err instanceof ProofError || err instanceof FilmError) return c.json({ error: err.message }, 400)
    console.error('[film]', err)
    return c.json({ error: 'could not put that together' }, 500)
  }
})

app.get('/api/film/:token', async (c) => {
  const link = await resolveLink(c.req.param('token'))
  if (!link) return c.json({ error: 'that link has expired' }, 404)
  c.header('content-type', link.name.endsWith('.webm') ? 'video/webm' : 'video/mp4')
  c.header('content-disposition', `attachment; filename="${link.name}"`)
  return c.body(Readable.toWeb(createReadStream(link.path)) as ReadableStream)
})

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`coldshell on http://localhost:${port}`)
  void sweepLinks()
})
