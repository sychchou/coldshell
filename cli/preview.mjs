/**
 * The camera, drawn in the terminal.
 *
 * Two pixels to a character: the upper half block takes the foreground colour and the lower half
 * takes the background, which doubles the vertical resolution for free. Reads raw rgb24 frames on
 * stdin, so ffmpeg does the capture and this only draws.
 *
 * Deliberately small and rough. Nobody watches these recordings, including the person making one,
 * and a preview good enough to study your own face is a preview good enough to start editing it.
 * This is for "am I in frame and is the light on", and nothing beyond that.
 */
const W = Number(process.env.W ?? 80)
const H = Number(process.env.H ?? 48) // pixels; half that in rows
const MODE = process.argv[2] ?? 'colour'
const RAMP = ' .:-=+*#%@'

const FRAME = W * H * 3
let buf = Buffer.alloc(0)
let frames = 0

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

function draw(f) {
  const out = ['\x1b[H']
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x++) {
      const top = (y * W + x) * 3
      const bot = ((y + 1) * W + x) * 3
      if (MODE === 'ascii') {
        const v = (lum(f[top], f[top + 1], f[top + 2]) + lum(f[bot], f[bot + 1], f[bot + 2])) / 2
        out.push(RAMP[Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1)))])
      } else {
        out.push(
          `\x1b[38;2;${f[top]};${f[top + 1]};${f[top + 2]}m` +
          `\x1b[48;2;${f[bot]};${f[bot + 1]};${f[bot + 2]}m▀`,
        )
      }
    }
    out.push('\x1b[0m\n')
  }
  process.stdout.write(out.join(''))
}

process.stdin.on('data', (chunk) => {
  buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
  while (buf.length >= FRAME) {
    draw(buf.subarray(0, FRAME))
    buf = buf.subarray(FRAME)
    frames++
  }
})
process.stdin.on('end', () => process.stderr.write(`\n${frames} frames\n`))
