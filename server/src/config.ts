const required = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback
  if (value === undefined) throw new Error(`${name} is not set`)
  return value
}

const port = Number(process.env.PORT ?? 8787)

export const config = {
  port,
  /**
   * Where this server answers from, for links that have to work outside the browser that asked
   * for them. A relative path is enough for a download the page starts itself; a link posted to
   * somebody's mailbox has no page to be relative to.
   */
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
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
    /** One that went in a mailbox is opened tomorrow, or next week, or on the way to work. */
    mailTtlMs: Number(process.env.FILM_MAIL_TTL_MS ?? 14 * 24 * 60 * 60_000),
  },
  links: {
    /** Download tokens. On disk rather than in memory, so a restart does not void them. */
    dir: process.env.LINK_DIR ?? 'data/links',
  },
  mail: {
    /** Without a user and a password this server simply cannot post, and the route says so. */
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? '',
    /** How many films one wallet may post in an hour. A mailbox is not a broadcast tool. */
    perHour: Number(process.env.MAIL_PER_HOUR ?? 5),
  },
  memo: {
    /** One file per wallet, holding the one note it is allowed. */
    dir: process.env.MEMO_DIR ?? 'data/memo',
  },
  community: {
    /** One file per shell; the week is both the room and how long it lasts. */
    dir: process.env.COMMUNITY_DIR ?? 'data/community',
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
