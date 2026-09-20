/**
 * A minute of yourself, recorded in a terminal.
 *
 * One ffmpeg, two outputs: the file that gets kept, and a stream of small raw frames that get
 * drawn here. So the preview is the recording — not a separate camera session that happens to
 * look similar — and what you see is what went in.
 *
 * The preview stays deliberately coarse. Nobody watches these, including the person making one,
 * and a preview good enough to study your own face is a preview good enough to start editing it.
 * It answers "am I in frame, is the light on", and stops there.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { platform } from 'node:os'
import { dirname } from 'node:path'

const MIN_MS = 60_000
const MAX_MS = 10 * 60_000

const out = process.argv[2] ?? `minute-${new Date().toISOString().slice(0, 10)}.mp4`
const cols = Math.min(72, Math.max(32, (process.stdout.columns ?? 80) - 8))
const W = cols
const H = Math.round((W * 9) / 16) * 2 // two pixels to a row, so the aspect survives

/** Where the camera is, per platform. The rest of the command is the same everywhere. */
function input() {
  // A moving picture that is not a camera, for checking the plumbing where there is no camera
  // to point at — or no permission to open the one there is.
  if (process.env.COLDSHELL_CAMERA === 'test') {
    // `-re` or it generates as fast as the machine allows, and a six second test writes half a
    // minute of video.
    return ['-re', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-re', '-f', 'lavfi', '-i', 'sine=frequency=440']
  }
  switch (platform()) {
    case 'darwin':
      return ['-f', 'avfoundation', '-pixel_format', 'uyvy422', '-framerate', '30', '-video_size', '1280x720', '-i', '0:0']
    case 'linux':
      return ['-f', 'v4l2', '-framerate', '30', '-video_size', '1280x720', '-i', '/dev/video0']
    default:
      return ['-f', 'dshow', '-i', 'video=default:audio=default']
  }
}

const clock = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

await mkdir(dirname(out), { recursive: true }).catch(() => {})

const ff = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error',
  ...input(),
  // What is kept.
  '-map', '0', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '1200k',
  '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '64k',
  '-movflags', '+faststart', '-y', out,
  // What is drawn. Small and slow on purpose: this is a viewfinder, not a monitor.
  '-map', '0:v', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '12', 'pipe:1',
], { stdio: ['pipe', 'pipe', 'inherit'] })

const started = Date.now()
const LIMIT = Number(process.env.COLDSHELL_SECONDS ?? 0)
if (LIMIT) setTimeout(() => stop(), LIMIT * 1000)
let buf = Buffer.alloc(0)
let stopping = false
const FRAME = W * H * 3

// Drawing over the whole screen is only polite when there is a screen. Piped into something
// else — a test, a log — it prints lines instead of painting frames.
const live = process.stdout.isTTY === true
if (live) process.stdout.write('\x1b[?1049h\x1b[?25l') // its own screen, no cursor

const restore = () => live && process.stdout.write('\x1b[?25h\x1b[?1049l')

let painted = 0

function paint(f) {
  const ms = Date.now() - started
  const enough = ms >= MIN_MS
  painted++
  if (!live) {
    if (painted % 12 === 0) console.log(`  frame ${painted}  ${clock(ms)}  ${enough ? 'long enough' : `${Math.ceil((MIN_MS - ms) / 1000)}s to go`}`)
    if (ms >= MAX_MS) stop()
    return
  }
  const rows = ['\x1b[H']
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x++) {
      const t = (y * W + x) * 3
      const b = ((y + 1) * W + x) * 3
      rows.push(`\x1b[38;2;${f[t]};${f[t + 1]};${f[t + 2]}m\x1b[48;2;${f[b]};${f[b + 1]};${f[b + 2]}m▀`)
    }
    rows.push('\x1b[0m\n')
  }
  rows.push('\n')
  rows.push(
    enough
      ? `  \x1b[31m●\x1b[0m ${clock(ms)}   \x1b[32mlong enough\x1b[0m\n`
      : `  \x1b[31m●\x1b[0m ${clock(ms)}   ${Math.ceil((MIN_MS - ms) / 1000)}s to go\n`,
  )
  rows.push(
    enough
      ? '  \x1b[2menter\x1b[0m keep it    \x1b[2mctrl-c\x1b[0m throw it away\n'
      : '  \x1b[2mctrl-c\x1b[0m throw it away\n',
  )
  process.stdout.write(rows.join(''))
  if (ms >= MAX_MS) stop()
}

ff.stdout.on('data', (chunk) => {
  buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
  while (buf.length >= FRAME) {
    paint(buf.subarray(0, FRAME))
    buf = buf.subarray(FRAME)
  }
})

/** `q` rather than a signal: ffmpeg finishes the file, and a half-written mp4 plays nowhere. */
function stop() {
  if (stopping) return
  stopping = true
  ff.stdin.write('q')
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.resume()
}
process.stdin.on('data', (key) => {
  if (key[0] === 3) { // ctrl-c
    stopping = true
    ff.kill('SIGKILL')
    restore()
    void rm(out, { force: true }).then(() => {
      console.log('\n  thrown away. nothing was kept.\n')
      process.exit(0)
    })
    return
  }
  if (key[0] === 13 && Date.now() - started >= MIN_MS) stop()
})

/**
 * How long the file runs, according to the file.
 *
 * The stopwatch is for the screen — you cannot ask a file being written how long it is. What
 * counts afterwards is what the file says, and an mp4 written by ffmpeg says. This is the one
 * thing the browser could never do: MediaRecorder writes no duration at all, so the length had
 * to be timed and then trusted.
 */
const lengthOf = (path) =>
  new Promise((done) => {
    const probe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path])
    let text = ''
    probe.stdout.on('data', (c) => (text += c))
    probe.on('error', () => done(0))
    probe.on('close', () => done(Number(text.trim()) || 0))
  })

ff.on('close', async () => {
  restore()
  if (stopping === false) return process.exit(1)
  try {
    const { size } = await stat(out)
    const seconds = await lengthOf(out)
    const hash = createHash('sha256')
    await new Promise((done) => createReadStream(out).on('data', (c) => hash.update(c)).on('end', done))

    if (seconds * 1000 < MIN_MS) {
      console.log(`\n  ${clock(seconds * 1000)} — the file is short of a minute, so it cannot keep the day.`)
      console.log(`  it is still here: ${out}\n`)
      process.exit(2)
    }
    console.log(`\n  ${clock(seconds * 1000)} of you, kept.\n`)
    console.log(`  ${out}`)
    console.log(`  ${(size / 1024 / 1024).toFixed(1)} MB   sha256 ${hash.digest('hex').slice(0, 16)}…\n`)
  } catch {
    console.log('\n  nothing was written — is the camera in use?\n')
    process.exit(1)
  }
  process.exit(0)
})

ff.on('error', () => {
  restore()
  console.error('\n  ffmpeg is not installed\n')
  process.exit(1)
})
