/**
 * Drawing the camera in a terminal, as well as the terminal allows.
 *
 * Three ways, best first. Two of them put a real picture on the screen — kitty's graphics
 * protocol and iTerm2's inline images both take a PNG and draw it, pixels and all — and the third
 * packs two pixels into every character cell with a half block, which works in anything.
 *
 * The fallback is not a consolation prize. Nobody watches these recordings, including the person
 * making one, and a preview good enough to study your own face is a preview good enough to start
 * editing it. Any of these answers "am I in frame, is the light on", which is the whole job.
 */

/** What this terminal can do, asked once. */
export function detect(env = process.env) {
  if (env.COLDSHELL_PREVIEW) return env.COLDSHELL_PREVIEW
  if (env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty') return 'kitty'
  if (env.TERM_PROGRAM === 'ghostty' || env.GHOSTTY_RESOURCES_DIR) return 'kitty'
  if (env.TERM_PROGRAM === 'WezTerm') return 'kitty'
  if (env.TERM_PROGRAM === 'iTerm.app') return 'iterm'
  return 'blocks'
}

/** Whether a renderer wants PNG frames rather than raw pixels. */
export const wantsPng = (mode) => mode === 'kitty' || mode === 'iterm'

const HOME = '\x1b[H'

/**
 * kitty and ghostty. `a=T` transmits and shows in one go; every frame clears the last placement
 * first, or they stack up and the terminal slows to a stop. `q=2` stops it answering, which would
 * otherwise arrive on stdin and be read as somebody pressing a key.
 */
function kitty(png, { rows }) {
  const b64 = png.toString('base64')
  const out = ['\x1b_Ga=d,d=A,q=2\x1b\\', HOME]
  const CHUNK = 4096
  for (let i = 0; i < b64.length; i += CHUNK) {
    const piece = b64.slice(i, i + CHUNK)
    const more = i + CHUNK < b64.length ? 1 : 0
    const head = i === 0 ? `a=T,f=100,r=${rows},q=2,m=${more}` : `m=${more}`
    out.push(`\x1b_G${head};${piece}\x1b\\`)
  }
  // The image does not move the cursor, so the status line has to be put below it by hand.
  out.push(`\x1b[${rows + 1};1H`)
  return out.join('')
}

/** iTerm2. One escape carries the whole file; printing it leaves the cursor after the image. */
function iterm(png, { rows }) {
  return (
    HOME +
    `\x1b]1337;File=inline=1;height=${rows};preserveAspectRatio=1;doNotMoveCursor=1:` +
    png.toString('base64') +
    '\x07' +
    `\x1b[${rows + 1};1H`
  )
}

/** Anything at all: two pixels to a cell, the top in the foreground and the bottom behind it. */
function blocks(raw, { width, height }) {
  const out = [HOME]
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x++) {
      const t = (y * width + x) * 3
      const b = ((y + 1) * width + x) * 3
      out.push(`\x1b[38;2;${raw[t]};${raw[t + 1]};${raw[t + 2]}m\x1b[48;2;${raw[b]};${raw[b + 1]};${raw[b + 2]}m▀`)
    }
    out.push('\x1b[0m\n')
  }
  return out.join('')
}

const RAMP = ' .:-=+*#%@'
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/** For terminals without truecolour, and for looking at in a log. */
function ascii(raw, { width, height }) {
  const out = [HOME]
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x++) {
      const t = (y * width + x) * 3
      const b = ((y + 1) * width + x) * 3
      const v = (lum(raw[t], raw[t + 1], raw[t + 2]) + lum(raw[b], raw[b + 1], raw[b + 2])) / 2
      out.push(RAMP[Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1)))])
    }
    out.push('\n')
  }
  return out.join('')
}

export function renderer(mode) {
  if (mode === 'kitty') return kitty
  if (mode === 'iterm') return iterm
  if (mode === 'ascii') return ascii
  return blocks
}

/** Takes what `ffmpeg -f image2pipe -vcodec png` writes and hands back one PNG at a time. */
export function pngFramer(onFrame) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const END = Buffer.from('IEND')
  let buf = Buffer.alloc(0)
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    for (;;) {
      if (!buf.subarray(0, 8).equals(SIG)) {
        const start = buf.indexOf(SIG)
        if (start < 0) return
        buf = buf.subarray(start)
      }
      const end = buf.indexOf(END, 8)
      if (end < 0) return
      const stop = end + 8 // IEND + its crc
      if (buf.length < stop) return
      onFrame(buf.subarray(0, stop))
      buf = buf.subarray(stop)
    }
  }
}

/** Takes concatenated rgb24 frames of a known size and hands back one at a time. */
export function rawFramer(bytes, onFrame) {
  let buf = Buffer.alloc(0)
  return (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
    while (buf.length >= bytes) {
      onFrame(buf.subarray(0, bytes))
      buf = buf.subarray(bytes)
    }
  }
}
