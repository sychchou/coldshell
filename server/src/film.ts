/**
 * The film: a run's minutes, end to end, in the order they were lived.
 *
 * Which minutes belong in it is decided by the chain, not by what happens to be on disk. A clip
 * whose day never reached the ledger has no claim to a date — the filename is the only thing
 * tying it to one, and the filename is ours to write. It stays where it is and the participant
 * can still fetch it; it simply is not part of the record.
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { PublicKey } from '@solana/web3.js'
import {
  DAYS_PER_SHELL,
  RECORD_LATE_SECONDS,
  dayStart,
  fetchRun,
  recorded,
  totalDays,
  type Run,
} from './chain.ts'
import { clipPath, notesFor } from './clips.ts'
import { config } from './config.ts'

export class FilmError extends Error {}

export type Part = { day: number; shell: number; path: string; sha256: string; signature: string }

/** Every minute the ledger holds for this run, in order. */
export async function parts(wallet: string, run: Run): Promise<Part[]> {
  const found: Part[] = []
  for (let day = 0; day < totalDays(run); day++) {
    if (!recorded(run, day)) continue
    const shell = run.firstShell + Math.floor(day / DAYS_PER_SHELL)
    for (const note of await notesFor(wallet, shell, day + 1)) {
      // A minute the chain never took has no claim to a date, and a date is what puts it in
      // order. It stays on disk; it is simply not part of the record.
      if (!note.signature) continue
      found.push({ day, shell, path: clipPath(note), sha256: note.sha256, signature: note.signature })
    }
  }
  return found
}

export type Kept = {
  day: number
  shell: number
  sha256: string
  bytes: number
  at: string
  /** Absent means the day never reached the chain: recorded, but not dated. */
  signature?: string
  /** Whether that can still be put right. The program refuses a day once its window shuts. */
  signable: boolean
}

/**
 * Everything this run has on disk, dated or not.
 *
 * An undated clip is the residue of a signature that failed after the upload — a real minute
 * that the ledger never accepted. While its window is open it can still be dated; after that it
 * can only be kept or burned, because the program will not take a day whose window has shut.
 */
export async function kept(wallet: string, open: Run, now = Date.now() / 1000): Promise<Kept[]> {
  const out: Kept[] = []
  for (let day = 0; day < totalDays(open); day++) {
    const shell = open.firstShell + Math.floor(day / DAYS_PER_SHELL)
    const inTime = now <= dayStart(open, day) + RECORD_LATE_SECONDS
    for (const note of await notesFor(wallet, shell, day + 1)) {
      out.push({
        day,
        shell,
        sha256: note.sha256,
        bytes: note.bytes,
        at: note.at,
        signature: note.signature,
        signable: !note.signature && inTime,
      })
    }
  }
  return out
}

const run = (args: string[]) =>
  new Promise<void>((done, fail) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', () => fail(new FilmError('ffmpeg is not installed')))
    child.on('close', (code) =>
      code === 0 ? done() : fail(new FilmError(stderr.trim().split('\n').pop() ?? `ffmpeg exited ${code}`)),
    )
  })

/**
 * Joins the parts into one file.
 *
 * Every clip comes out of the same browser pipeline, so stream copy is almost always possible and
 * the film is then the original minutes untouched — no generation loss, and seconds rather than
 * minutes of work. Only a run recorded across different devices needs re-encoding, and that is
 * the fallback rather than the rule.
 *
 * The remux first is not optional: a WebM from MediaRecorder carries no duration, which is why
 * the length is timed while recording, and concatenating those directly leaves a file whose
 * timeline players disagree about.
 */
export async function stitch(found: Part[], out: string) {
  if (!found.length) throw new FilmError('nothing has been recorded yet')
  const work = await mkdtemp(join(tmpdir(), 'coldshell-film-'))
  try {
    const cleaned: string[] = []
    for (const [i, part] of found.entries()) {
      const clean = join(work, `${String(i).padStart(3, '0')}.mkv`)
      await run(['-fflags', '+genpts', '-i', part.path, '-c', 'copy', clean])
      cleaned.push(clean)
    }

    const list = join(work, 'parts.txt')
    await writeFile(list, cleaned.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))
    await mkdir(dirname(out), { recursive: true })

    try {
      await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out])
    } catch {
      // Different cameras, different sizes: the only way to make one film of them is to make
      // one video of them.
      await run([
        '-f', 'concat', '-safe', '0', '-i', list,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1,fps=24',
        '-c:a', 'aac', '-b:a', '128k',
        out,
      ])
    }
    return (await stat(out)).size
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

export type Film = {
  path: string
  name: string
  bytes: number
  /** Seconds. What somebody actually sits through, which is the only length worth printing. */
  seconds: number
  days: number
  from: number
  to: number
}

/** How long the finished film runs. Asked of the file rather than added up from the parts. */
async function lengthOf(path: string) {
  return new Promise<number>((done) => {
    const probe = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path,
    ])
    let out = ''
    probe.stdout.on('data', (chunk) => (out += chunk))
    probe.on('error', () => done(0))
    probe.on('close', () => done(Math.round(Number(out.trim()) || 0)))
  })
}

/** Builds the film for a wallet's current run, or hands back the one already built. */
export async function film(wallet: string): Promise<Film> {
  const user = new PublicKey(wallet)
  const open = await fetchRun(user)
  if (!open) throw new FilmError('that wallet has no run')

  const found = await parts(wallet, open)
  if (!found.length) throw new FilmError('nothing has been recorded yet')

  const last = open.firstShell + open.shells - 1
  const name = `coldshell-shell-${open.firstShell}${open.shells > 1 ? `-${last}` : ''}.mp4`
  const path = resolve(join(config.films.dir, wallet, name))

  // A run that has since recorded another day is a different film, so the size is not enough to
  // decide whether the one on disk is still current.
  const stamp = resolve(join(config.films.dir, wallet, `${name}.parts`))
  const signature = found.map((p) => p.sha256).join('\n')
  const current = await readFileOr(stamp)
  if (current !== signature || !(await exists(path))) {
    await stitch(found, path)
    await mkdir(dirname(stamp), { recursive: true })
    await writeFile(stamp, signature)
  }

  return {
    path,
    name,
    bytes: (await stat(path)).size,
    seconds: await lengthOf(path),
    days: found.length,
    from: open.firstShell,
    to: last,
  }
}

const exists = (path: string) => stat(path).then(() => true, () => false)
const readFileOr = (path: string) =>
  import('node:fs/promises').then((fs) => fs.readFile(path, 'utf8')).catch(() => null)
