import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { detect, pngFramer, rawFramer, renderer, wantsPng } from '../preview.mjs'

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Three real PNG frames, the way ffmpeg hands them over: one after another down a pipe. */
const pngStream = () =>
  new Promise((done, fail) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=1', '-frames:v', '3',
      '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1',
    ])
    const chunks = []
    ff.stdout.on('data', (c) => chunks.push(c))
    ff.on('error', fail)
    ff.on('close', (code) => (code === 0 ? done(Buffer.concat(chunks)) : fail(new Error(`ffmpeg exited ${code}`))))
  })

test('a terminal is asked what it can do, and told when it cannot', () => {
  assert.equal(detect({ TERM: 'xterm-kitty' }), 'kitty')
  assert.equal(detect({ TERM_PROGRAM: 'ghostty' }), 'kitty')
  assert.equal(detect({ TERM_PROGRAM: 'WezTerm' }), 'kitty')
  assert.equal(detect({ TERM_PROGRAM: 'iTerm.app' }), 'iterm')
  assert.equal(detect({ TERM_PROGRAM: 'Apple_Terminal' }), 'blocks')
  assert.equal(detect({}), 'blocks')
  // Being able to say so by hand matters more than the guessing: a terminal that draws pictures
  // and is not on the list should not be stuck with blocks forever.
  assert.equal(detect({ TERM: 'xterm-kitty', COLDSHELL_PREVIEW: 'blocks' }), 'blocks')
  assert.equal(wantsPng('kitty') && wantsPng('iterm') && !wantsPng('blocks'), true)
})

test('png frames are cut apart exactly where they end', async () => {
  const stream = await pngStream()
  const found = []
  const feed = pngFramer((f) => found.push(f))

  // Arriving in awkward pieces, because that is how a pipe delivers them.
  for (let i = 0; i < stream.length; i += 997) feed(stream.subarray(i, i + 997))

  assert.equal(found.length, 3)
  for (const f of found) {
    assert.ok(f.subarray(0, 8).equals(SIG), 'each frame starts with the png signature')
    assert.equal(f.subarray(f.length - 8, f.length - 4).toString(), 'IEND')
  }
  assert.equal(Buffer.concat(found).length, stream.length, 'nothing is dropped and nothing is added')
})

test('raw frames are cut apart on their fixed size', () => {
  const bytes = 4 * 2 * 3
  const found = []
  const feed = rawFramer(bytes, (f) => found.push(Buffer.from(f)))
  const stream = Buffer.alloc(bytes * 3).map((_, i) => i % 251)
  for (let i = 0; i < stream.length; i += 7) feed(stream.subarray(i, i + 7))
  assert.equal(found.length, 3)
  assert.ok(found[0].equals(stream.subarray(0, bytes)))
})

test('the kitty escape carries the whole png, in pieces it will accept', async () => {
  const [png] = [...(await (async () => {
    const found = []
    const feed = pngFramer((f) => found.push(f))
    feed(await pngStream())
    return found
  })())]

  const drawn = renderer('kitty')(png, { rows: 20 })
  assert.match(drawn, /^\x1b_Ga=d,d=A,q=2\x1b\\/, 'the last frame is cleared first, or they stack up')
  assert.match(drawn, /\x1b_Ga=T,f=100,r=20,q=2,m=[01];/, 'transmit and show, as a png, that many rows tall')
  assert.ok(drawn.includes('q=2'), 'no reply, or it arrives on stdin and reads as a keypress')

  const pieces = [...drawn.matchAll(/\x1b_G[^;]*;([^\x1b]*)\x1b\\/g)].map((m) => m[1])
  assert.ok(pieces.every((p) => p.length <= 4096), 'nothing over the chunk size')
  assert.equal(Buffer.from(pieces.join(''), 'base64').length, png.length, 'the png survives the journey')
})

test('the iterm escape carries the whole png in one go', async () => {
  const found = []
  pngFramer((f) => found.push(f))(await pngStream())
  const drawn = renderer('iterm')(found[0], { rows: 20 })
  assert.match(drawn, /\x1b]1337;File=inline=1;height=20;preserveAspectRatio=1;doNotMoveCursor=1:/)
  const b64 = drawn.slice(drawn.indexOf(':') + 1, drawn.indexOf('\x07'))
  assert.equal(Buffer.from(b64, 'base64').length, found[0].length)
})

test('blocks draw two pixels a cell, and one row of cells per two rows of pixels', () => {
  const width = 3
  const height = 4
  const raw = Buffer.alloc(width * height * 3, 128)
  const drawn = renderer('blocks')(raw, { width, height })
  assert.equal((drawn.match(/▀/g) ?? []).length, width * (height / 2))
  assert.equal((drawn.match(/\n/g) ?? []).length, height / 2)
  assert.ok(drawn.includes('\x1b[38;2;128;128;128m'), 'the top pixel is the foreground')
  assert.ok(drawn.includes('\x1b[48;2;128;128;128m'), 'the bottom pixel is behind it')
})
