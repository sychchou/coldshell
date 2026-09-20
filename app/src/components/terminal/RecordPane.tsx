import { useCallback, useEffect, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { DAYS_PER_SHELL, explorerTxUrl } from '../../config'
import { claimTx, noteSignature, recordDayTx, sendPrepared } from '../../lib/api'
import type { DayMark, RunView } from '../../lib/useRun'
import { QUESTIONS, questionOfTheDay } from '../../questions'
import { ClipRecorder, CONSTRAINTS, MAX_MS, MIN_MS, clock, mb, pickMimeType, type Recording } from '../../lib/recorder'
import { seal, type Sealed } from '../../lib/seal'
import { TEST_MODE, today } from '../../lib/shell'
import { useCommands, useScrollOutput } from './chips'
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
  const done = marks.filter((m) => m === 'done').length
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
        <span>
          {' '}
          {done}/{marks.length}
          {missed > 0 && <span className="term-bad"> · {missed} missed</span>}
        </span>
      </dd>
    </>
  )
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
  const { publicKey, signTransaction } = useWallet()
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
  const { run, day, marks, open: openDays, claimable } = view
  // Anyone may open the camera and record; only sealing needs a wallet and a place in a shell.
  const missing = !publicKey ? 'wallet' : !run ? 'shell' : null
  // The shell a day belongs to — derived from the run, as the program derives it, so the clip
  // and the instruction cannot disagree about which week this is.
  const shellOf = (index: number) =>
    run ? run.firstShell + Math.floor(index / DAYS_PER_SHELL) : now.shell
  const shell = shellOf(day ?? 0)

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
      await noteSignature(wallet, prepared.shell, forDay + 1, signature).catch(() => {})
      setStage({ kind: 'sealed', clip, stored, signature, forDay })
      await view.refresh()
    } catch (err) {
      // Back to where the clip still exists, carrying whatever already reached the server.
      setStage({ kind: 'done', clip, stored, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const [claiming, setClaiming] = useState<{ shell: number; signature?: string; error?: string } | null>(null)

  const claim = async (index: number) => {
    if (!publicKey || !signTransaction) return
    setClaiming({ shell: index })
    try {
      const signature = await sendPrepared(connection, signTransaction, await claimTx(publicKey.toBase58(), index))
      setClaiming({ shell: index, signature })
      await view.refresh()
    } catch (err) {
      setClaiming({ shell: index, error: err instanceof Error ? err.message : String(err) })
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

  useCommands(
    {
      chips: [
        ...(!cameraOn || stage.kind === 'error'
          ? [{ key: 'camera', label: 'camera', onClick: openCamera, disabled: !mimeType }]
          : stage.kind === 'asking'
            ? [{ key: 'wait', label: 'waiting…', disabled: true }]
            : stage.kind === 'ready'
              ? [{ key: 'start', label: 'start', onClick: start }]
              : stage.kind === 'recording'
                ? [
                    {
                      key: 'stop',
                      label: longEnough ? 'stop' : `${Math.ceil((MIN_MS - elapsed) / 1000)}s to go`,
                      onClick: stop,
                      disabled: !longEnough,
                    },
                  ]
                : stage.kind === 'sealing'
                  ? [{ key: 'sealing', label: `sealing… ${Math.round(stage.done * 100)}%`, disabled: true }]
                  : stage.kind === 'which'
                    ? [
                        {
                          key: 'y',
                          label: 'y',
                          tone: 'yes' as const,
                          onClick: () => sealClip(stage.clip, stage.stored, openDays[0]!),
                        },
                        {
                          key: 'n',
                          label: 'n',
                          tone: 'no' as const,
                          onClick: () => sealClip(stage.clip, stage.stored, openDays[openDays.length - 1]!),
                        },
                      ]
                    : stage.kind === 'marking'
                      ? [{ key: 'marking', label: 'signing…', disabled: true }]
                        : stage.kind === 'sealed'
                          ? openDays.length > 0
                            ? [{ key: 'again', label: 'record again', onClick: start }]
                            : []
                          : stage.kind === 'done'
                            ? [
                                { key: 'again', label: 'record again', onClick: start },
                                {
                                  key: 'seal',
                                  // A clip that already reached the server only needs the signature.
                                  label: stage.stored ? 'sign again' : stage.error ? 'seal again' : 'seal',
                                  tone: 'yes' as const,
                                  // With two days open the clip has to say which one it is for;
                                  // with one there is nothing to ask.
                                  onClick: () =>
                                    openDays.length > 1
                                      ? setStage({ kind: 'which', clip: stage.clip, stored: stage.stored })
                                      : sealClip(stage.clip, stage.stored, openDays[0]!),
                                  disabled: !publicKey || openDays.length === 0,
                                },
                              ]
                            : []),
        ...(cameraOn && missing === 'shell' ? [{ key: 'register', label: 'register', onClick: onRegister }] : []),
        ...(cameraOn ? [{ key: 'example', label: 'example', onClick: askAnother }] : []),
        // A finished week is worth collecting whatever else is on screen, so claim is not tucked
        // behind the camera.
        ...claimable.map((index) => ({
          key: `claim-${index}`,
          label: claiming?.shell === index && !claiming.signature && !claiming.error
            ? 'claiming…'
            : `claim shell ${index}`,
          tone: 'yes' as const,
          onClick: () => claim(index),
          disabled: claiming?.shell === index && !claiming.error,
        })),
      ],
      back: log.length > 0 ? back : undefined,
    },
    [stage.kind, longEnough, elapsed, mimeType, log.length, cameraOn, missing, publicKey, day, openDays.join(), claimable.join(), claiming],
    active,
  )

  useScrollOutput([stage.kind, log.length, claiming])

  // The camera block that owns the stream: the last one printed.
  const liveCamera = log.reduce((id, entry) => (entry.command === 'camera' ? entry.id : id), -1)

  return (
    <>
      <p className="term-prompt">record --shell {shell}</p>
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
      {claiming?.signature && (
        <p className="term-line">
          shell {claiming.shell} came back.{' '}
          <a className="term-dim" href={explorerTxUrl(claiming.signature)} target="_blank" rel="noreferrer">
            {claiming.signature.slice(0, 16)}…
          </a>
        </p>
      )}
      {claiming?.error && <p className="term-line term-bad">{claiming.error}</p>}

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
                ? 'every day within reach is already on chain. one minute a day is all it takes.'
                : 'nothing has left this browser yet.'}
            </p>
          )}
          {stage.kind === 'which' && (
            <>
              <p className="term-line">
                day {openDays[0]! + 1} is still empty and its window has not closed. is this
                minute for day {openDays[0]! + 1}?
              </p>
              <p className="term-line term-dim">
                y — file it as day {openDays[0]! + 1} · n — file it as day{' '}
                {openDays[openDays.length - 1]! + 1}, today
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
