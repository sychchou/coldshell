/**
 * A minute of yourself, recorded in a terminal.
 *
 * One ffmpeg, two outputs: the file that gets kept, and a stream of frames that get drawn here.
 * So the preview is the recording — not a separate camera session that happens to look similar —
 * and what you watch is what went in.
 *
 * How well it is drawn depends on the terminal, and the good case is genuinely good: kitty,
 * ghostty, WezTerm and iTerm2 all put real pixels on the screen. Everything else gets half
 * blocks, which is enough for the job — this answers "am I in frame, is the light on", and a
 * preview good enough to study your own face is a preview good enough to start editing it.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { platform } from 'node:os'
import { dirname } from 'node:path'
import { detect, pngFramer, rawFramer, renderer, wantsPng } from './preview.mjs'

const MIN_MS = 60_000
const MAX_MS = 10 * 60_000

const out = process.argv[2] ?? `minute-${new Date().toISOString().slice(0, 10)}.mp4`
const live = process.stdout.isTTY === true
const mode = live ? detect() : 'ascii'
const draw = renderer(mode)

// Take the whole window. The old cap at 72 columns was throwing away most of the picture on any
// terminal somebody had actually made big.
const cols = Math.max(24, (process.stdout.columns ?? 80))
const termRows = Math.max(10, (process.stdout.rows ?? 24) - 4) // room for the status lines

// A picture gets the rows; blocks get pixels, two to a row, keeping 16:9.
const rows = Math.min(termRows, 40)
const W = wantsPng(mode) ? Math.round((rows * 2 * 16) / 9) : cols
const H = wantsPng(mode) ? rows * 2 : Math.min(termRows * 2, Math.round((cols * 9) / 16) * 2)

/** Where the camera is, per platform. The rest of the command is the same everywhere. */
function input() {
  // A moving picture that is not a camera, for checking the plumbing where there is no camera to
  // point at — or no permission to open the one there is. `-re` or it generates as fast as the
  // machine allows, and a six second test writes half a minute of video.
  if (process.env.COLDSHELL_CAMERA === 'test') {
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

/** The second output: pixels for a picture, or a small raw frame for blocks. */
const previewOut = wantsPng(mode)
  ? ['-map', '0:v', '-f', 'image2pipe', '-vcodec', 'png', '-s', `${W}x${H}`, '-r', '12', 'pipe:1']
  : ['-map', '0:v', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '12', 'pipe:1']

const clock = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

await mkdir(dirname(out), { recursive: true }).catch(() => {})

const ff = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error',
  ...input(),
  '-map', '0', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '1200k',
  '-pix_fmt', 'yuv420p', '-r', '24', '-c:a', 'aac', '-b:a', '64k',
  '-movflags', '+faststart', '-y', out,
  ...previewOut,
], { stdio: ['pipe', 'pipe', 'inherit'] })

const started = Date.now()
let stopping = false
let frames = 0

const LIMIT = Number(process.env.COLDSHELL_SECONDS ?? 0)
if (LIMIT) setTimeout(() => stop(), LIMIT * 1000)

if (live) process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J')
const restore = () => {
  if (!live) return
  if (mode === 'kitty') process.stdout.write('\x1b_Ga=d,d=A,q=2\x1b\\')
  process.stdout.write('\x1b[?25h\x1b[?1049l')
}

function status() {
  const ms = Date.now() - started
  const enough = ms >= MIN_MS
  return (
    '\n' +
    (enough
      ? `  \x1b[31m●\x1b[0m ${clock(ms)}   \x1b[32mlong enough\x1b[0m\x1b[K\n`
      : `  \x1b[31m●\x1b[0m ${clock(ms)}   ${Math.ceil((MIN_MS - ms) / 1000)}s to go\x1b[K\n`) +
    (enough
      ? '  \x1b[2menter\x1b[0m keep it    \x1b[2mctrl-c\x1b[0m throw it away\x1b[K\n'
      : '  \x1b[2mctrl-c\x1b[0m throw it away\x1b[K\n')
  )
}

function frame(data) {
  const ms = Date.now() - started
  frames++
  if (!live) {
    if (frames % 12 === 0) {
      console.log(`  frame ${frames}  ${clock(ms)}  ${ms >= MIN_MS ? 'long enough' : `${Math.ceil((MIN_MS - ms) / 1000)}s to go`}`)
    }
  } else {
    process.stdout.write(draw(data, { width: W, height: H, rows }) + status())
  }
  if (ms >= MAX_MS) stop()
}

ff.stdout.on('data', wantsPng(mode) ? pngFramer(frame) : rawFramer(W * H * 3, frame))

/** `q` rather than a signal: ffmpeg finishes the file, and a half-written mp4 plays nowhere. */
function stop() {
  if (stopping) return
  stopping = true
  ff.stdin.write('q')
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', (key) => {
    if (key[0] === 3) {
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
}

/**
 * How long the file runs, according to the file.
 *
 * The stopwatch is for the screen — you cannot ask a file being written how long it is. What
 * counts afterwards is what the file says, and an mp4 written by ffmpeg says. This is the one
 * thing the browser could never do: MediaRecorder writes no duration at all, so the length had to
 * be timed and then trusted.
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
  if (!stopping) process.exit(1)
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
