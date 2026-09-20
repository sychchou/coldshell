/** Browser recording: the one part of coldshell that had to be proven before anything else. */

/** A minute, in milliseconds. Nothing shorter can be uploaded. */
export const MIN_MS = 60_000
/** Nobody needs to upload half an hour of themselves. */
export const MAX_MS = 10 * 60_000

/**
 * What to record in, best first.
 *
 * H.264 leads, though VP9 compresses better, and the reason is what happens at the end of a run.
 * The minutes are joined into one film, and clips that already share a codec are joined by
 * copying the streams — seconds, and not a frame re-encoded. Anything else has to be encoded
 * again on a server, which took over a minute per clip in testing and would take an hour for a
 * ten-week run.
 *
 * The encoding is not saved by choosing H.264; it happens either way, in hardware, while you
 * record. It is only a question of which side of the upload it happens on. And a VP9 film plays
 * in a browser and almost nowhere else: not QuickTime, not Safari, not most editors — which
 * matters for a file people are given to keep and cut up.
 */
export function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  if (typeof MediaRecorder === 'undefined') return null
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

/** 1.2 Mbps of video comes to roughly 9 MB a minute: small enough to upload, good enough to keep. */
const VIDEO_BITS = 1_200_000
const AUDIO_BITS = 64_000

export const CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
  audio: true,
}

export type Recording = {
  blob: Blob
  /** Measured while recording: what MediaRecorder writes carries no usable duration of its own. */
  ms: number
  sha256: string
  type: string
}

export async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Wraps MediaRecorder in something with one job: hand back a finished clip and how long it ran.
 * The length is timed here rather than read back from the file, because the file does not say.
 */
export class ClipRecorder {
  #recorder: MediaRecorder
  #chunks: Blob[] = []
  #startedAt = 0
  #stoppedAt = 0

  readonly mimeType: string

  constructor(stream: MediaStream, mimeType: string) {
    this.mimeType = mimeType
    this.#recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITS,
      audioBitsPerSecond: AUDIO_BITS,
    })
    this.#recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.#chunks.push(e.data)
    }
  }

  start() {
    this.#chunks = []
    this.#startedAt = Date.now()
    // A chunk a second, so a crash costs at most a second of footage.
    this.#recorder.start(1000)
  }

  get elapsed() {
    if (!this.#startedAt) return 0
    return (this.#stoppedAt || Date.now()) - this.#startedAt
  }

  stop(): Promise<Recording> {
    return new Promise((resolve, reject) => {
      this.#recorder.onerror = () => reject(new Error('the recorder stopped unexpectedly'))
      this.#recorder.onstop = async () => {
        this.#stoppedAt = Date.now()
        const blob = new Blob(this.#chunks, { type: this.mimeType })
        resolve({ blob, ms: this.elapsed, sha256: await sha256(blob), type: this.mimeType })
      }
      this.#recorder.stop()
    })
  }
}

export const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

/** 1m04s */
export function clock(ms: number) {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}
