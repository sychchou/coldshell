const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`${name} is not set`)
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  /** Where the site runs, for CORS in development. */
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  /** The cluster the program is deployed to. */
  rpcUrl: process.env.RPC_URL ?? 'http://127.0.0.1:8899',
  /**
   * The wallet that pays every fee and all rent. A hot key by necessity — keep it away from the
   * program's upgrade authority and keep only enough SOL in it to run for a while.
   */
  payerKeyPath: process.env.PAYER_KEY_PATH ?? '.keys/payer.json',
  films: {
    /** Built films, rebuilt whenever a run gains a day. */
    dir: process.env.FILM_DIR ?? 'data/films',
    /** A download link is good for this long, which is long enough to click it. */
    ttlMs: Number(process.env.FILM_TTL_MS ?? 30 * 60_000),
  },
  clips: {
    /** Local storage until R2 is wired in; the directory is a volume in deployment. */
    dir: required('CLIP_DIR', 'data/clips'),
    /** Ten minutes at 1.2 Mbps is about 90 MB; leave room above that and refuse the rest. */
    maxBytes: Number(process.env.MAX_CLIP_BYTES ?? 128 * 1024 * 1024),
    /** A minute is the floor, but the browser already enforces it — this only catches nonsense. */
    minBytes: Number(process.env.MIN_CLIP_BYTES ?? 100_000),
    /**
     * How many minutes one day may hold. A day is kept by one of them; the rest are for the
     * film. The ceiling is here rather than on chain because what it protects is this server's
     * disk and the fees it pays, and both are spent here.
     */
    perDay: Number(process.env.CLIPS_PER_DAY ?? 5),
  },
}
