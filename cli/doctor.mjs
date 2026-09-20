/**
 * What this terminal can do, said plainly and shown.
 *
 * The preview is most of what somebody sees, and how good it looks is decided entirely by the
 * terminal they happened to open. Rather than guess and be quietly wrong, this asks, prints the
 * answer, and draws the two things worth looking at — because a colour strip settles in one
 * glance what an environment variable only hints at.
 */

import { spawn } from 'node:child_process'
import { detect } from './preview.mjs'

const env = process.env
const mode = detect(env)

const has = (name) => (env[name] ? `\x1b[32m${env[name]}\x1b[0m` : '\x1b[2m—\x1b[0m')

console.log('')
console.log('  \x1b[1mterminal\x1b[0m')
console.log(`    TERM             ${has('TERM')}`)
console.log(`    TERM_PROGRAM     ${has('TERM_PROGRAM')}`)
console.log(`    COLORTERM        ${has('COLORTERM')}`)
console.log(`    size             ${process.stdout.columns ?? '?'} × ${process.stdout.rows ?? '?'}`)
console.log('')

const how = {
  kitty: 'real pixels, over kitty’s graphics protocol',
  iterm: 'real pixels, inline',
  blocks: 'half blocks, two pixels to a character',
  ascii: 'letters',
}
console.log(`  \x1b[1mpreview\x1b[0m       \x1b[36m${mode}\x1b[0m — ${how[mode]}`)
if (mode === 'blocks') {
  console.log('  \x1b[2mkitty, ghostty, wezterm and iTerm2 draw an actual picture instead.\x1b[0m')
}
console.log('')

/**
 * Two strips of the same gradient: one asked for in 24-bit colour, one in the 256-colour cube.
 *
 * If they look the same, this terminal is quietly rounding 24-bit colour to the cube — which is
 * what macOS Terminal does — and there is nothing to be gained by sending it. If the top is
 * visibly smoother, it means what it says.
 */
const cube = (r, g, b) =>
  16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5)

const width = Math.min(60, (process.stdout.columns ?? 60) - 6)
let truecolour = '    '
let paletted = '    '
for (let i = 0; i < width; i++) {
  const v = Math.round((i / (width - 1)) * 255)
  truecolour += `\x1b[48;2;${v};${Math.round(v / 2)};${255 - v}m `
  paletted += `\x1b[48;5;${cube(v, Math.round(v / 2), 255 - v)}m `
}
console.log('  \x1b[1mcolour\x1b[0m')
console.log(`${truecolour}\x1b[0m  24-bit`)
console.log(`${paletted}\x1b[0m  256`)
console.log('  \x1b[2msame smoothness means this terminal has no 24-bit colour.\x1b[0m')
console.log('')

const tool = (name, args) =>
  new Promise((done) => {
    const p = spawn(name, args, { stdio: 'ignore' })
    p.on('error', () => done(false))
    p.on('close', (code) => done(code === 0))
  })

const ffmpeg = await tool('ffmpeg', ['-version'])
const ffprobe = await tool('ffprobe', ['-version'])
const mark = (ok) => (ok ? '\x1b[32myes\x1b[0m' : '\x1b[31mno\x1b[0m')

console.log('  \x1b[1mrecording\x1b[0m')
console.log(`    ffmpeg           ${mark(ffmpeg)}`)
console.log(`    ffprobe          ${mark(ffprobe)}`)
if (!ffmpeg || !ffprobe) console.log('    \x1b[2mbrew install ffmpeg\x1b[0m')
console.log('')
