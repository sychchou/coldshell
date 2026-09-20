# coldshell design notes

The decisions carried over from the earlier project, written down as they were settled in chat.
This is an internal memo rather than a public document — that one is [RULES.md](../RULES.md).

Everything above [the list](#the-list) is decided and changes only when the decision does.
**[The list](#the-list) is the moving part**, and it is where anything still to do belongs: put
it there when it comes up, take it out when it ships, and do not let it drift from what the code
actually does.

## What changed

Against the earlier project, which counted camera time in a Discord voice room:

| | before | coldshell |
|---|---|---|
| proof | three hours on camera in a voice room | a minute of video a day, inside its window |
| verification | a bot measured it, participants judged it | none — length and arrival time only |
| unit | weekly / biweekly tracks | one shell = one calendar week, 1 to 10 |
| reward | winners split the pot | every finished week refunded in full |
| stake | entry fee × multiplier | $10–200, free choice |
| login | wallet + Discord | wallet only |
| outcome | prize money | not money — one film, joined |

## A shell is the week itself

```
shell #3 = your Monday 00:00 – your Sunday 23:59
```

Not a cohort: calendar weeks, numbered from zero. Shell #0 is the week beginning Monday
2026-09-21. Somebody who buys five weeks holds shells #3 through #7.

**The week belongs to whoever is living it.** At registration the browser says which timezone it
is in, and the run carries that answer around. The chain has exactly one clock and no way to read
anyone else's, so the run has to hold the answer itself. The offset is said **once** and can never
be changed — being able to move your own midnight is being able to step around a day you already
missed. Lying gains nothing. Whatever you claim, it is still seven of your own days.

So Seoul and New York are a few hours apart inside shell #3. **Nothing depends on that.** There is
no pool and nobody else's week touches your refund, so the shell number is an **index** rather than
a cohort, and "they started before me" is all it ever has to mean.

- A run is **1 to 10 shells**. **You cannot join a week already under way.** Pay any time up to
  Sunday 23:59 and you start the following Monday, waiting at most seven days. Slotting somebody
  into a running week would be selling them a week with days already lost, and the screen would
  have to point at "the week now running" and "the week you bought" with the same cell.
- No weekly/monthly tracks. The week is the only unit.

### The timetable of one shell

A day can be recorded from **one hour before it starts until thirty hours after**. The hour is for
clocks that disagree a little; the six hours past the day are **grace**. Finishing at two in the
morning is still finishing.

```
Mon Tue Wed Thu Fri Sat Sun | Mon 06:00 — Sunday's minute closes, and the week settles.
                            |             Four weeks to claim, counted from here.
```

**The point of this design is that the window became grace, all of it.** It used to be 48 hours, of
which 36 went on paying for timezones — the screen counted everybody's own day while the chain
counted UTC, and the slack between them was what held the two together. Widening the grace meant
buying more timezone. Once the run carries its own offset that cost is zero, and the length of the
window is now **purely a thing we choose**.

The moment the last day stops being recordable and the moment the money can move are **the same
moment**. The old "settles on Tuesday" slack disappeared here.

## Settling by the week

**Each shell is a separate promise.**

- Buying 10 shells is placing ten stakes, one per shell.
- Missing a day in week 3 loses **week 3's share only**. The other nine are untouched.
- No all-or-nothing over ten weeks. Losing 67 days because of a fever on day 68 is not an engine
  that helps a person; it is a machine that breaks one.

## The stake

- **$10 to $200, freely chosen.** Nothing is split between participants, so there is no reason to
  make the units match, and "how much would hurt" is completely different from person to person.
  This is the strongest lever there is for making the commitment real.
- The ceiling is there to **protect people**, not revenue. Without one, somebody stakes money they
  cannot afford to lose.
- Divided evenly across the shells bought; the remainder goes to the last settlement. USDC has six
  decimals, so the remainder is a millionth of a dollar — **no design time goes here**.

## Verification — there is none

GitHub does not check whether a commit is real work. `git commit --date` will backdate one. The
graph moves millions of people anyway, because the machine is not a judge but a **mirror**.

**Two rules survive.**

1. The video is **at least a minute**
2. **Uploaded inside that day's window** (one hour before, thirty hours after, in the run's own
   timezone)

Today's code, speech recognition, word lists, duplicate detection — all gone. Because this is a
refund and not a pot, **nobody else loses anything when somebody cheats their way through**. With
no adversarial structure there is no need for adversarial checking.

Recording a week in one sitting is blocked by the **upload window**: enforced on time rather than
content, so it costs zero verification. Filming ahead and uploading daily is still possible, but
that is not deceiving anyone — it is **throwing away the thing you bought for yourself**.

## Which is why the server never touches the content

Nothing is transcribed, so there is no audio to pull and no text to produce. All the server does is
**check the length, hash it, store it**.

Which means **the browser can encrypt before it uploads**. The key derives from a wallet signature
and stays with the participant; the server keeps a blob it cannot open.

> "we don't watch it" → **"we cannot watch it"**

The policy becomes structure. With the burn, the privacy design closes.

- The length check happens in the browser too. That check is a **guardrail for yourself**, not a
  door holding anyone out, so the client is the right place for it.
- v1 can store in the clear and add encryption later. What matters is that **the structure leaves
  room for it**. (Whether a wallet-signature-derived key is deterministic per wallet still needs
  checking.)

## The program

```
enter(shells, stake)      deposit. the starting shell is computed on chain from the clock
record_day(day, hash)     signed by the participant. no oracle — nobody reads the content
claim(shell)              a week done in full comes back in full
sweep(shell)              collect a forfeit. anyone may call it; the money only goes to treasury
close                     reclaim rent
```

`sweep` needs no signature because the destination is pinned to the treasury: a stranger calling it
gains nothing. That is what **removes any reason for the treasury key to live on the server**.
`close` empties leftover tokens to the treasury first, so sending money to a vault cannot inflate a
refund and the account always closes.

`tally`, `rollover`, `winner_shares`, multiplier weights, rounding to 0.01, warnings, juries — none
of it exists.
- **Closing the participant's account on claim reclaims the rent.** Otherwise accounts pile up
  forever: a thousand people is 2–4 SOL locked away.
- **Security**: the server is the fee payer, so it must **only sign transactions it assembled
  itself**. Signing one handed to it turns the wallet into a free fee payer for anybody.

## The burn

**None of this is built.** It is on [the list](#the-list); until it ships, every clip and every
film is kept indefinitely and this section describes an intention rather than the code.

Once it is delivered, nothing stays on our side. "It is not here any more" is a keepable promise in
a way "we don't look" is not, and holding thousands of people's private videos forever is a
liability that eventually, certainly, goes wrong.

```
during the run       the minutes, and only the minutes
the run ends         the film is joined — and the minutes are burned
grace (4 weeks)      the film, and only the film
grace ends           the film is burned
```

**The minutes are never downloadable.** Not during the run, not at the end, not ever. The one
thing anybody gets is the film, which is why the film cannot be treated as a cache of the
minutes: after the run ends there is nothing left to rebuild it from, by design.

That settles a question worth writing down so it stops being reopened. The hash on chain is a
**commitment made at the time** — this file, this long, this day — and not a receipt the
participant redeems later against a copy they hold. They do not hold one. Nobody does.

- **Build the film before burning anything, and check it.** The one ordering that loses a
  person's month is burning the minutes on a film that turned out to be zero bytes. The minutes
  stay until the film exists, plays, and is the length it should be.
- **Never burn before delivery is confirmed.** Deleting after a bounced email erases somebody's
  month for good. State the grace period and the burn date from the start, and say it once more
  on the status screen as a line like `your shell burns in 6 days`.
- The grace period has to outlast the dispute period. Once it is deleted there is nothing left to
  check a "the check was wrong" complaint against.
- **Four weeks of grace collides with the four-week claim window**, which is `CLAIM_WINDOW_SECONDS
  = 28 days` and starts at the same moment. Somebody who leaves their money until the last day
  would arrive to collect it and find the film burned that morning — and arriving to collect is
  exactly when most people would think to ask for it. The grace has to start later than the run
  ends, or run longer than the claim window does.
- **Storage versioning and lifecycle backups stay off.** With them on, deletion is not deletion.
  Temporary files from ffmpeg get cleaned up with the rest.

This is also the storage plan, which is not obvious until the numbers are written down. Nothing
is deleted today, so the disk grows as `everybody who ever took part × everything they recorded`
and has no ceiling at any volume size. With the burn it becomes `whoever is in flight × one run,
plus four weeks of finished films` — a number that stops growing. The ceiling on one run is
`days × 5 clips × 10 minutes`, since a recording stops itself at ten minutes and the server
refuses anything over 128 MB; ten people for a week is 1.7 GB if they each record a minute a day
and 31 GB if they all fill every day. Both stages hold roughly the same bytes, so the total does
not double — except while a film is being joined, which is the one moment both exist.

What stays on chain is the hash — proof of the existence of something that is no longer anywhere.

## Name and manner

- No logo, only the wordmark. The favicon and avatar slot is a blinking cursor block (`▮`) — the
  logo that is not one.
- The slogan is **`you vs you`**. (`beat yourself` reads as `beat yourself up` first, which means
  the opposite of the intent.)
- The screen says `N inside` — you do not know who, but you know how many are in here with you
  right now. The feeling of an anonymous group from a single number rather than a list of people.

**This is an engine for one person.** So these will not be built: leaderboards, rankings, other
people's progress, a feed. The community sits beside the product and is not let inside it.

## What the chain is for

Exactly two things. Neither is possible with a database.

1. **Money we cannot touch.** As long as "everything comes back" is the promise, what makes it a
   promise is that the program can only pay the participant.
2. **A record we cannot edit.** All income comes from forfeits, so **we have a financial motive to
   see participants fail**. In a database, a record could be quietly deleted and the stake
   swallowed. On chain it cannot.

> We make money when you fail. So we put the record somewhere we cannot reach it.

### The oracle is gone — done

`record_day` is signed by the participant. The block time is the evidence, we pay the fee and
testify to nothing, and the proof path has nobody left to trust. What remains is "is that file
really a minute of video", which is a question only the participant can lose on.

## The list

What is left, in the order it has to happen. Everything above this line is decided; everything
below is not built or not settled. Keep it current — this is the memo's only moving part.

### Before the trial starts (Monday 2026-09-28)

- **Seal on devnet, end to end.** Record, upload, sign, see the day go green. It has been done
  locally and never once against the deployed program, which makes it the largest unknown in the
  whole trial. Everything else on this list is smaller than this.
- **Download a real film through the site.** The link on screen is relative, so it goes through
  Vercel's rewrite to Railway, and eighty megabytes has never travelled that path. If it will
  not, point the download at `PUBLIC_URL` the way the mailed link already does.
- **Mail one film to a real address.** The message was checked against a local SMTP sink, so the
  only untested part is whether Gmail accepts the App Password. `SMTP_USER`, `SMTP_PASS` and
  `PUBLIC_URL` on Railway; without them the screen offers the download alone, which is correct
  but not what the trial was told.
- **Check the volume is mounted at `/data`.** Clips, films, memos, the room and download tokens
  all live there now. Until this deploy the memos and the room were not on it at all, and every
  deploy was quietly taking them.
- **Railway auto-deploy.** Eject from the upstream template first — the switch is not offered
  while the service is template-linked — then authorise Railway's GitHub App on the repository
  under the current account. Reconnecting the source alone changes nothing.
- **A missed day has to read as missed.** Skip one on purpose and look at the calendar.
- **Check the volume is big enough for ten.** A minute is about 12 MB, a day may hold five of
  them, and a finished film is about 80 MB. Ten people for a week is around 1.7 GB if everybody
  records once a day and 5.4 GB if everybody fills the day — against a 5 GB volume by default.
  A full disk fails the clip upload, which is to say it takes somebody's day away, so this is
  checked before the trial rather than during it.
- **Open ten wallets' token accounts and fund them.** The faucet does the opening now; it used
  to refuse, which would have stopped all ten on the first morning — the program does not open
  one either, so there was no way through at all. Keep an eye on the staff wallet's balance
  while doing it, because it is on screen for exactly that.

### Frozen until the trial ends (2026-10-05)

**The `Run` layout cannot change.** Two wallets are already bricked by layout changes made under
a live run: the program reads 84 bytes and those accounts hold 82, so they cannot be claimed,
swept or even closed, and the devnet USDC in them is gone for good. Any change to `state.rs`
waits, or it takes the trial's five runs with it.

### After the trial

- **The burn.** None of it exists: the clips, the films and the download tokens are all kept
  forever, which is the opposite of what this document promises and the one place where the
  promise is louder than the code. The shape is in [The burn](#the-burn) — minutes burned when
  the film is joined, film burned when the grace runs out — and what it needs is a delivery
  recorded as confirmed, a grace that outlasts the claim window, `your shell burns in 6 days` on
  the screen before it happens, and the check that the film is real before the minutes go.
- **Automatic posting at settlement.** Today the film is posted because somebody pressed send,
  which makes the mail worth about as much as the download beside it. Posting it the moment the
  week settles is the version worth having, and it needs an address the server keeps — which is
  exactly what was just decided against. So the decision has to be reopened, not worked around:
  the honest shape is an address kept until the film is delivered and deleted with it, in the
  same sweep as the burn above.
- **Refunds.** Somebody will want their stake back before their run is over, and there is no
  answer at all today — not a policy, not an instruction, not a screen. Decide what the answer
  is before somebody asks, because the first person to ask will be owed one.
- **More than one run at a time.** A wallet holds exactly one, so a second means closing the
  first. Fine for a trial, wrong for anybody who wants to start a new run before collecting the
  last one.
- **Staff deletion in the room.** The room has none. One line from one person is all it takes,
  and right now the only remedy is a deploy.
- **Clips to R2.** They go through the server to a mounted volume. That is the right shape for
  five people and the wrong one for fifty; the browser does not have to notice the change.
- **Encrypting in the browser.** The key derives from a wallet signature and stays with the
  participant, and "we cannot watch it" replaces "we do not". Check first that the derivation is
  deterministic per wallet — if it is not, the whole idea fails quietly and loses films.
- **A CLI.** Low priority. A student studying does not install a terminal app, and the web
  terminal already gives that feeling at no installation cost.

### Settled, kept here so it is not re-litigated

- The upload pipeline was the last unknown and is answered: the browser records with
  `MediaRecorder` at 1.2 Mbps, times the length itself because the file does not say, and posts
  the bytes straight to the server. It records H.264 so the film is a two-second stream copy
  instead of a six-minute re-encode. A minute is about 9 MB; a week is about 80.
- The speech-verification spike is gone. No whisper, no word lists, no normalisation, no
  matching.
- The film is delivered as a link and never as an attachment: a week of minutes is 80 MB and a
  mailbox takes 25.
