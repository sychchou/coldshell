#!/usr/bin/env node
/**
 * The coldshell agent: the app, served from this machine.
 *
 * It exists because of one browser rule. Chrome gates a request from a public page to a local
 * address behind a Local Network Access permission, and refuses it without ever prompting — so a
 * site cannot talk to a program on your computer, however much both sides would like it to.
 *
 * Turning it around costs nothing and removes the rule entirely: the agent serves the app, the
 * app is same-origin with the agent, and there is no permission, no CORS and no mixed content
 * left to argue about. `http://127.0.0.1` is a secure context, so the camera, WebCrypto and the
 * file pickers are all present. `/api` is proxied to the real server exactly as the deployed site
 * proxies it, which means the app runs here without knowing it moved.
 *
 * The same rule that made this necessary also protects it: no other page can reach this port.
 * Only what the agent serves can talk to it.
 *
 * Nothing is encrypted or kept here yet — this version establishes that the shape works.
 */

import { createReadStream } from 'node:fs'
import { readFile, rm, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'

const HOME = join(homedir(), '.coldshell')
const APP = process.env.COLDSHELL_APP ?? join(HOME, 'app')
const API = process.env.COLDSHELL_API ?? 'https://coldshell-production.up.railway.app'
const PORT = Number(process.env.COLDSHELL_PORT ?? 7531)
const VERSION = '0.1.0'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * Hands a built file over, or says the app is not here yet.
 *
 * Anything that is not a file falls through to index.html, because the app routes in the browser
 * and a reload on /staff has to land on the app rather than on a 404.
 */
async function serve(res, pathname) {
  const wanted = resolve(join(APP, normalize(pathname).replace(/^(\.\.[/\\])+/, '')))
  const root = resolve(APP)
  const file =
    wanted.startsWith(root) && (await stat(wanted).then((s) => s.isFile(), () => false))
      ? wanted
      : join(root, 'index.html')

  if (!(await stat(file).then(() => true, () => false))) {
    return json(res, 503, { error: 'the app is not installed here yet' })
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    // The bundle's filenames carry their own hashes; index.html must never be held.
    'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  createReadStream(file).pipe(res)
}

/** `/api` goes to the real server, so the app cannot tell it is being served from here. */
async function proxy(req, res, pathname, search) {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (['host', 'connection', 'origin', 'referer', 'content-length'].includes(k)) continue
    if (typeof v === 'string') headers.set(k, v)
  }
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req)

  try {
    const upstream = await fetch(`${API}${pathname}${search}`, {
      method: req.method,
      headers,
      body,
      duplex: 'half',
      redirect: 'manual',
    })
    const out = {}
    upstream.headers.forEach((v, k) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) out[k] = v
    })
    res.writeHead(upstream.status, out)
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res)
    else res.end()
  } catch (err) {
    console.error('[proxy]', err instanceof Error ? err.message : err)
    json(res, 502, { error: 'could not reach coldshell' })
  }
}

/**
 * Takes itself off the machine.
 *
 * The run is over, the film has been saved, and there is no reason for this to stay running for
 * years. It deletes what it installed and then stops — the same manners the rest of the product
 * has about not keeping things.
 */
async function uninstall(res) {
  json(res, 200, { removing: HOME })
  res.on('finish', async () => {
    try {
      // Whatever is left of a run goes with it; nothing here is meant to outlive the agent.
      await rm(HOME, { recursive: true, force: true })
      console.log('removed', HOME)
    } catch (err) {
      console.error('[uninstall]', err instanceof Error ? err.message : err)
    }
    process.exit(0)
  })
}

const server = createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url ?? '/', 'http://127.0.0.1')

  if (pathname === '/agent/health') {
    return json(res, 200, { coldshell: true, agent: VERSION, home: HOME })
  }
  if (pathname === '/agent/uninstall' && req.method === 'POST') return uninstall(res)
  if (pathname.startsWith('/api/')) return proxy(req, res, pathname, search)
  return serve(res, pathname)
})

// Loopback only, and said explicitly: binding to every interface would put somebody's recordings
// on their coffee shop's wifi.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`coldshell agent ${VERSION} on http://127.0.0.1:${PORT}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`something is already on port ${PORT} — the agent may be running already`)
    process.exit(1)
  }
  throw err
})
