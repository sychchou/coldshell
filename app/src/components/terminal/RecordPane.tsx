import { useCallback, useEffect, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { DAYS_PER_SHELL, DAY_MS, RECORD_LATE_MS, explorerTxUrl } from '../../config'
import {
  filmLink,
  keepMemo,
  myMemo,
  noteSignature,
  recordDayTx,
  sendPrepared,
  type FilmLink,
  type Memo,
} from '../../lib/api'
import type { DayMark, RunView } from '../../lib/useRun'
import { QUESTIONS, questionOfTheDay } from '../../questions'
import { ClipRecorder, CONSTRAINTS, MAX_MS, MIN_MS, clock, mb, pickMimeType, type Recording } from '../../lib/recorder'
import { seal, type Sealed } from '../../lib/seal'
import { explain } from '../../lib/send'
import { shellStart } from '../../lib/runs'
import { TEST_MODE, today } from '../../lib/shell'
import { useCommands, useScrollOutput } from './chips'
import { Prompt } from './Prompt'
import { bar } from './format'

type Stage =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'ready' }
  | { kind: 'recording' }
  // `stored` survives a failed signature so a retry does not upload the minute twice, and
  // `error` rides along with the clip rather than replacing it — losing a recording because a
  // wallet was locked would be the cruellest possible way to lose a day.
  | { kind: 'done'; clip: Recording; stored?: Sealed; error?: string }
  /** Two days are open at once and the clip has to say which one it is for. */
  | { kind: 'which'; clip: Recording; stored?: Sealed }
  | { kind: 'sealing'; clip: Recording; done: number }
  | { kind: 'marking'; clip: Recording; stored: Sealed }
  | { kind: 'sealed'; clip: Recording; stored: Sealed; signature: string; forDay: number }
  /** The camera itself would not open. Nothing was recorded, so there is nothing to keep. */
  | { kind: 'error'; message: string }

/** Each command's output, kept in the order it was run. */
type Entry = { id: number; command: 'camera' } | { id: number; command: 'example'; question: number }

function reason(err: unknown) {
  const name = err instanceof Error ? err.name : ''
  if (name === 'NotAllowedError') return 'camera access was refused. allow it and run camera again.'
  if (name === 'NotFoundError') return 'no camera found.'
  if (name === 'NotReadableError') return 'the camera is in use by something else.'
  return err instanceof Error ? err.message : String(err)
}

/**
 * One block per day of the run, in order. The bar fills with time — every day that has begun is
 * a block, whether or not anything was recorded in it — and the colour says how that day went.
 * A day gone and a day not yet arrived look nothing alike, which is the only thing anybody wants
 * to know the moment they slip.
 */
function Days({ marks }: { marks: DayMark[] }) {
  const missed = marks.filter((m) => m === 'missed').length
  return (
    <>
      <dt>days</dt>
      <dd>
        <span className="term-meter">
          {marks.map((mark, i) => (
            <span key={i} data-mark={mark}>
              {mark === 'ahead' ? '░' : '█'}
            </span>
          ))}
        </span>
        {/* The bar already says how many. Only a day lost is worth spelling out. */}
        {missed > 0 && <span className="term-bad"> {missed} missed</span>}
      </dd>
    </>
  )
}

/** A time near enough to be a time; anything further needs its date. */
function deadline(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return d.toDateString() === new Date().toDateString()
    ? clock
    : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock}`
}

/**
 * Today's minute. The clip never leaves the browser until it is sealed, and the length is timed
 * while recording rather than read back from the file — a WebM from MediaRecorder does not carry
 * its own.
 */
export function RecordPane({
  active,
  run: view,
  onRegister,
}: {
  active: boolean
  run: RunView
  onRegister: () => void
}) {
  const { connection } = useConnection()
  const { publicKey, signMessage, signTransaction } = useWallet()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const [log, setLog] = useState<Entry[]>([])
  // Whether the light is actually on, as opposed to whether the command has ever been run.
  const [cameraOn, setCameraOn] = useState(false)
  const nextId = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<ClipRecorder | null>(null)

  const mimeType = pickMimeType()
  // A shortened day moves while you are looking at it, so the clock has to keep up.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!TEST_MODE) return
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const now = today()
  void tick
  const { run, day, marks, open: openDays, empty } = view
  // Anyone may open the camera and record; only sealing needs a wallet and a place in a shell.
  const missing = !publicKey ? 'wallet' : !run ? 'shell' : null
  // The shell a day belongs to — derived from the run, as the program derives it, so the clip
  // and the instruction cannot disagree about which week this is.
  const shellOf = (index: number) =>
    run ? run.firstShell + Math.floor(index / DAYS_PER_SHELL) : now.shell

  /**
   * Two steps, in this order. The clip goes up first because the chain records its hash: marking
   * a day whose recording never arrived would put a promise on the ledger with nothing behind it.
   */
  /**
   * `forDay` is the day of the run this minute belongs to — not always today. A day stays open
   * for two, so somebody catching up on yesterday is recording a real thing about yesterday, and
   * filing it under today would be a small lie in the one place that cannot hold one.
   */
  const sealClip = async (clip: Recording, already: Sealed | undefined, forDay: number) => {
    if (!publicKey || !signTransaction) return
    const wallet = publicKey.toBase58()
    let stored = already
    try {
      if (!stored) {
        setStage({ kind: 'sealing', clip, done: 0 })
        stored = await seal(
          clip.blob,
          { wallet, shell: shellOf(forDay), day: forDay + 1, sha256: clip.sha256 },
          (fraction) => setStage({ kind: 'sealing', clip, done: fraction }),
        )
        release()
      }
      setStage({ kind: 'marking', clip, stored })
      const prepared = await recordDayTx(wallet, forDay, stored.sha256)
      const signature = await sendPrepared(connection, signTransaction, prepared)
      // The hash is permanent in the instruction data, but only findable through its signature.
      await noteSignature(wallet, prepared.shell, forDay + 1, stored.sha256, signature).catch(() => {})
      setStage({ kind: 'sealed', clip, stored, signature, forDay })
      await view.refresh()
    } catch (err) {
      // Back to where the clip still exists, carrying whatever already reached the server.
      setStage({ kind: 'done', clip, stored, error: explain(err) })
    }
  }

  const [reel, setReel] = useState<{ link?: FilmLink; error?: string; busy?: boolean } | null>(null)
  const [note, setNote] = useState<{ memo?: Memo | null; draft?: string; error?: string; busy?: boolean } | null>(null)

  /**
   * The one note this wallet keeps. Not a diary — the diary is the minutes, and nobody reads
   * those. This is the line you leave yourself about why you started, so that on the fourth
   * evening there is something on the screen written by somebody who meant it.
   */
  const openMemo = async () => {
    if (!publicKey) return
    setNote({ busy: true })
    try {
      setNote({ memo: (await myMemo(publicKey.toBase58())).memo })
    } catch (err) {
      setNote({ error: explain(err) })
    }
  }

  const saveMemo = async (said: string) => {
    if (!publicKey) return
    setNote((at) => ({ ...at, busy: true }))
    try {
      setNote({ memo: (await keepMemo(publicKey.toBase58(), said)).memo })
    } catch (err) {
      setNote((at) => ({ ...at, busy: false, draft: said, error: explain(err) }))
    }
  }

  /** An earlier day with nothing in it and time left on it: the one worth asking about. */
  const behind = empty.find((d) => d !== day)

  /**
   * The film so far: every minute the ledger holds for this run, end to end. A day whose clip
   * never reached the chain is not in it — nothing but our own filename ties that recording to a
   * date, and a date is the one thing here that is not ours to assert.
   */
  const makeFilm = async () => {
    if (!publicKey || !signMessage) return
    setReel({ busy: true })
    try {
      setReel({ link: await filmLink(publicKey.toBase58(), signMessage) })
    } catch (err) {
      setReel({ error: explain(err) })
    }
  }

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  useEffect(() => release, [release])

  // The preview element only exists once the camera command has printed its output.
  useEffect(() => {
    if (videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  })

  const openCamera = async () => {
    setLog((entries) => [...entries, { id: nextId.current++, command: 'camera' }])
    setStage({ kind: 'asking' })
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      setCameraOn(true)
      setStage({ kind: 'ready' })
    } catch (err) {
      setStage({ kind: 'error', message: reason(err) })
    }
  }

  const askAnother = () =>
    setLog((entries) => [
      ...entries,
      {
        id: nextId.current++,
        command: 'example',
        question:
          (questionOfTheDay() + entries.filter((e) => e.command === 'example').length) % QUESTIONS.length,
      },
    ])

  const start = () => {
    if (!streamRef.current || !mimeType) return
    const recorder = new ClipRecorder(streamRef.current, mimeType)
    recorderRef.current = recorder
    recorder.start()
    setElapsed(0)
    setStage({ kind: 'recording' })
  }

  const stop = async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    try {
      setStage({ kind: 'done', clip: await recorder.stop() })
    } catch (err) {
      setStage({ kind: 'error', message: reason(err) })
    }
  }

  // The clock the minimum is measured against.
  useEffect(() => {
    if (stage.kind !== 'recording') return
    const timer = setInterval(() => {
      const ms = recorderRef.current?.elapsed ?? 0
      setElapsed(ms)
      if (ms >= MAX_MS) stop()
    }, 200)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.kind])

  const longEnough = elapsed >= MIN_MS

  // Back takes one command off the scrollback; dropping the camera closes it.
  const back = () => {
    const last = log[log.length - 1]
    if (!last) return
    if (last.command === 'camera') {
      release()
      setStage({ kind: 'idle' })
    }
    setLog((entries) => entries.slice(0, -1))
  }

  /**
   * What the bar offers. A clip in hand comes first: sealing releases the camera, so branching on
   * whether the camera is open used to hide `seal` at exactly the moment it was needed — a failed
   * signature left the recording in memory with no way to send it.
   */
  const chips = () => {
    switch (stage.kind) {
      case 'which':
        return [
          { key: 'y', label: 'y', tone: 'yes' as const, onClick: () => sealClip(stage.clip, stage.stored, behind!) },
          {
            key: 'n',
            label: 'n',
            tone: 'no' as const,
            onClick: () => sealClip(stage.clip, stage.stored, day ?? openDays[openDays.length - 1]!),
          },
        ]
      case 'sealing':
        return [{ key: 'sealing', label: `sealing… ${Math.round(stage.done * 100)}%`, disabled: true }]
      case 'marking':
        return [{ key: 'marking', label: 'signing…', disabled: true }]
      case 'sealed':
        return openDays.length > 0 ? [{ key: 'again', label: 'record again', onClick: start }] : []
      case 'done':
        return [
          { key: 'again', label: 'record again', onClick: start },
          {
            key: 'seal',
            // A clip that already reached the server only needs the signature.
            label: stage.stored ? 'sign again' : stage.error ? 'seal again' : 'seal',
            tone: 'yes' as const,
            // With two days open the clip has to say which one it is for; with one there is
            // nothing to ask.
            // Only an earlier day with nothing in it raises the question. A day already kept
            // can take another minute, but nobody reaches for the camera to say so.
            onClick: () =>
              behind !== undefined
                ? setStage({ kind: 'which', clip: stage.clip, stored: stage.stored })
                : sealClip(stage.clip, stage.stored, day ?? openDays[0]!),
            disabled: !publicKey || openDays.length === 0,
          },
        ]
      case 'asking':
        return [{ key: 'wait', label: 'waiting…', disabled: true }]
      case 'ready':
        return [{ key: 'start', label: 'start', onClick: start }]
      case 'recording':
        return [
          {
            key: 'stop',
            label: longEnough ? 'stop' : `${Math.ceil((MIN_MS - elapsed) / 1000)}s to go`,
            onClick: stop,
            disabled: !longEnough,
          },
        ]
      default:
        return [
          {
            key: 'camera',
            label: 'camera',
            // Green when there is a day with nothing in it and time left on it.
            tone: empty.length > 0 ? ('yes' as const) : undefined,
            onClick: openCamera,
            disabled: !mimeType,
          },
        ]
    }
  }

  useCommands(
    {
      chips: [
        ...(publicKey && note?.draft === undefined
          ? [{ key: 'memo', label: note?.busy ? 'reading…' : 'memo', onClick: openMemo, disabled: note?.busy }]
          : []),
        ...(note?.draft !== undefined
          ? [
              {
                key: 'keep',
                label: note.busy ? 'keeping…' : 'keep',
                tone: 'yes' as const,
                onClick: () => void saveMemo(note.draft!),
                disabled: note.busy,
              },
            ]
          : []),
        ...(note?.memo !== undefined && note.draft === undefined
          ? [{ key: 'edit', label: note.memo ? 'edit memo' : 'write one', onClick: () => setNote({ ...note, draft: note.memo?.said ?? '' }) }]
          : []),
        ...chips(),
        ...(cameraOn && missing === 'shell' ? [{ key: 'register', label: 'register', onClick: onRegister }] : []),
        ...(cameraOn ? [{ key: 'example', label: 'example', onClick: askAnother }] : []),
        // Worth having whenever there is anything to watch, not only at the end.
        ...(run && marks.some((m) => m === 'done') && signMessage
          ? [{ key: 'film', label: reel?.busy ? 'putting it together…' : 'film', onClick: makeFilm, disabled: reel?.busy }]
          : []),
      ],
      back: log.length > 0 ? back : undefined,
    },
    [stage.kind, longEnough, elapsed, mimeType, log.length, cameraOn, missing, publicKey, day, openDays.join(), empty.join(), reel, note, Boolean(signMessage), marks.join()],
    active,
  )

  useScrollOutput([stage.kind, log.length, reel, note])

  // The camera block that owns the stream: the last one printed.
  const liveCamera = log.reduce((id, entry) => (entry.command === 'camera' ? entry.id : id), -1)

  return (
    <>
      <p className="term-prompt">my page</p>
      <dl className="term-rows">
        <dt>date</dt>
        <dd>
          {now.date} {now.weekday}
        </dd>
        {run && (
          <>
            <dt>run</dt>
            <dd>
              shell {run.firstShell}
              {run.shells > 1 && ` – ${run.firstShell + run.shells - 1}`} ·{' '}
              {day === null
                ? run.firstShell > now.shell
                  ? 'not started yet'
                  : 'over'
                : `day ${day + 1} of ${marks.length}`}
            </dd>
          </>
        )}
        {run && <Days marks={marks} />}
      </dl>
      {/* Today being open is the ordinary state and needs no announcement. A day before today
          still being open is the thing somebody would want to be told, while there is time. */}
      {run &&
        empty
          .filter((d) => d !== day)
          .map((d) => (
            <p className="term-line" key={d}>
              day {d + 1} is still empty — you can record it until{' '}
              {deadline(shellStart(shellOf(d)) + (d % DAYS_PER_SHELL) * DAY_MS + RECORD_LATE_MS)}
            </p>
          ))}

      {reel && (
        <div className="term-entry">
          <p className="term-prompt">film</p>
          {reel.busy && <p className="term-line term-dim">joining the minutes…</p>}
          {reel.error && <p className="term-line term-bad">{reel.error}</p>}
          {reel.link && (
            <>
              <p className="term-line">
                {reel.link.days} day{reel.link.days > 1 ? 's' : ''} · {mb(reel.link.bytes)}
              </p>
              <p className="term-line">
                <a href={reel.link.url} download={reel.link.name}>
                  {reel.link.name}
                </a>
              </p>
              <p className="term-line term-dim">the link is good for half an hour.</p>
            </>
          )}
        </div>
      )}

      {note && (
        <div className="term-entry">
          <p className="term-prompt">memo</p>
          {note.busy && note.draft === undefined && <p className="term-line term-dim">reading…</p>}
          {note.error && <p className="term-line term-bad">{note.error}</p>}
          {note.draft === undefined && note.memo && <p className="term-line">{note.memo.said}</p>}
          {note.draft === undefined && note.memo === null && (
            <p className="term-line term-dim">
              nothing here yet. one line to yourself, for the evening you would rather not.
            </p>
          )}
          {note.draft !== undefined && (
            <Prompt
              label="memo"
              hint="why you started"
              max={280}
              value={note.draft}
              onChange={(draft) => setNote({ ...note, draft })}
              onDone={() => void saveMemo(note.draft!)}
              onCancel={() => setNote({ ...note, draft: undefined })}
            />
          )}
        </div>
      )}

      {log.map((entry) =>
        entry.command === 'example' ? (
          <div className="term-entry" key={entry.id}>
            <p className="term-prompt">example</p>
            <p className="term-line">{QUESTIONS[entry.question]}</p>
          </div>
        ) : (
          // Output accumulates, but a camera does not: only the newest block owns the stream.
          // Every one of them rendering a preview is two cameras on one screen.
          <div className="term-entry" key={entry.id} data-live={entry.id === liveCamera || undefined}>
            <p className="term-prompt">camera</p>
            {!mimeType ? (
              <p className="term-line term-bad">this browser cannot record. use chrome.</p>
            ) : (
              <>
                <dl className="term-rows">
                  <dt>format</dt>
                  <dd>{mimeType}</dd>
                  <dt>status</dt>
                  <dd>
                    {entry.id !== liveCamera ? (
                      <span className="term-dim">closed</span>
                    ) : stage.kind === 'asking' ? (
                      'asking…'
                    ) : stage.kind === 'error' ? (
                      <span className="term-bad">{stage.message}</span>
                    ) : cameraOn ? (
                      <span className="term-state" data-state="ok">
                        ok
                      </span>
                    ) : (
                      <span className="term-dim">closed</span>
                    )}
                  </dd>
                </dl>
                {missing && cameraOn && entry.id === liveCamera && (
                  <p className="term-line term-bad">
                    {missing === 'wallet'
                      ? 'connect a wallet first — a recording cannot be sealed without one.'
                      : `you are not in shell ${now.shell}. register to start one.`}
                  </p>
                )}
                {cameraOn && entry.id === liveCamera && (
                  <div className="record-stage">
                    <video ref={videoRef} muted playsInline className="record-preview" />
                    {stage.kind === 'recording' && (
                      <p className="record-clock">
                        <span className="record-dot" aria-hidden="true" />
                        {clock(elapsed)}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ),
      )}

      {(stage.kind === 'done' ||
        stage.kind === 'which' ||
        stage.kind === 'sealing' ||
        stage.kind === 'marking' ||
        stage.kind === 'sealed') && (
        <div className="term-block">
          <p className="term-head">clip</p>
          <dl className="term-rows">
            <dt>length</dt>
            <dd>{clock(stage.clip.ms)}</dd>
            <dt>size</dt>
            <dd>{mb(stage.clip.blob.size)}</dd>
            <dt>sha256</dt>
            <dd>{stage.clip.sha256.slice(0, 16)}…</dd>
          </dl>
          {stage.kind === 'done' && !stage.error && !stage.stored && (
            <p className="term-line term-dim">
              {openDays.length === 0
                ? 'no day is open to record. one minute a day is all it takes.'
                : 'nothing has left this browser yet.'}
            </p>
          )}
          {stage.kind === 'which' && (
            <>
              <p className="term-line">
                day {(behind ?? 0) + 1} is still empty and its window has not closed. is this
                minute for day {(behind ?? 0) + 1}?
              </p>
              <p className="term-line term-dim">
                y — file it as day {(behind ?? 0) + 1} · n — file it as day {(day ?? 0) + 1}, today
              </p>
            </>
          )}
          {stage.kind === 'done' && stage.error && (
            <>
              <p className="term-line term-bad">{stage.error}</p>
              <p className="term-line term-dim">
                {stage.stored
                  ? 'the clip is stored — only the signature is missing. sign again when the wallet is ready.'
                  : 'the recording is still here. try again when the wallet is ready.'}
              </p>
            </>
          )}
          {stage.kind === 'sealing' && (
            <p className="term-line">
              <span className="term-meter">{bar(stage.done)}</span> {Math.round(stage.done * 100)}%
            </p>
          )}
          {stage.kind === 'marking' && (
            <p className="term-line term-dim">stored. approve the signature to date it…</p>
          )}
          {stage.kind === 'sealed' && (
            <>
              <p className="term-line">
                sealed. day {stage.forDay + 1} of shell {shellOf(stage.forDay)}.
              </p>
              <p className="term-line term-dim">
                <a href={explorerTxUrl(stage.signature)} target="_blank" rel="noreferrer">
                  {stage.signature.slice(0, 16)}…
                </a>
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
