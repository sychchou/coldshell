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
**check the length, hash it, store it**. Today it stores it in the clear, and the length check is
already the browser's job — a **guardrail for yourself** rather than a door holding anyone out,
so the client is the right place for it.

> "we don't watch it" → **"we cannot watch it"**

That sentence is the whole target, and the distance to it is not encryption. It is that a server
which can join video can watch video, whatever it promises. Automating the joining does not help;
somebody can always read what is on the disk. So the promise is only keepable if the bytes are
not here.

### The capsule

Two things have to be true at once, and they look contradictory:

1. **We cannot watch it.** Ever, including if we tried.
2. **You cannot watch it either** — not until the run is finished. The minutes go in and the film
   comes out; nothing in between is for looking at. This was the intention from the beginning,
   which is why there has never been a route that plays a single clip back, and there should not
   be one added by accident later.

Encrypting under a key the participant holds gives the first and loses the second: they can open
it whenever they like. Holding the key ourselves gives the second and loses the first. Either
half alone is not the product.

**The answer is to separate the bytes from the key.** Whoever holds one must not hold the other,
and the chain says when they meet:

```
the minutes    stay on the participant's machine, encrypted. we never receive one
the key        is ours, derived rather than stored, and released when the run is over
the hash       is on chain, which is the only part anybody needs to trust
```

We cannot watch because we have nothing to watch. They cannot watch because they cannot open what
they have. Neither side is being asked to behave; both are simply unable, and the condition for
opening it is in a program that neither of us can edit.

This also settles storage, which stopped being a design question the moment the bytes stayed put:
**we keep 32 bytes per run.** No volume to outgrow, no object storage to rent, and the burn on our
side becomes deleting a key.

### What it costs

- **It needs something installed.** A web page cannot keep a file on somebody's disk reliably, and
  the whole arrangement rests on the file being there and not here.
- **One machine per run.** Record on a laptop on Monday and a desktop on Tuesday and the minutes
  are in two places, and only one of them can be joined. The chain does not care — the day counts
  and the money is safe wherever it was recorded — but that Tuesday is not in the film. Say this
  before anybody starts, not after.
- **Losing the machine loses the film**, exactly as losing the wallet does. The same property that
  makes it unreadable to us makes it unrecoverable by us, and that is not a bug to be fixed later.
- **Support becomes guesswork.** Nothing can be reproduced, nothing can be looked at. The agent
  has to keep a log the participant can send, because it is the only thing we will ever see.

### It cannot be a CLI, and it does not have to be one

The obvious shape for "runs locally, holds files" is a command-line tool. It is the wrong one, for
a reason that has nothing to do with how hard terminals are: **you cannot see your own face in a
terminal.** Recording a minute of yourself with no preview is recording blind, and the camera is
the one thing the browser does genuinely well.

So the browser keeps the camera and the whole interface, and what gets installed is a **local
agent**. The clips go to it instead of to us; at the end it joins them with a real ffmpeg, which
is also what makes a film of a ten-week run possible at all, since a browser cannot hold one.
Nothing about the screen changes and the participant never types a command.

**The agent serves the app rather than the site calling the agent**, which is the opposite of the
obvious arrangement and is not a preference. Chrome now gates requests from a public page to a
local address behind a **Local Network Access** permission, and it does not degrade politely:
tested against the deployed site in Chrome 153, `fetch('http://127.0.0.1:…')` fails with no
network activity at all — no preflight reaches the agent, and no permission prompt appears, with
a real click or without one. `targetAddressSpace`, `Access-Control-Allow-Private-Network` and an
image load were all refused the same way. The site cannot talk to the agent, and waiting for that
to change is not a plan.

Serving from the agent removes the problem instead of fighting it. `http://127.0.0.1` is a
**secure context**, so the camera, WebCrypto and the file pickers are all there — that was
checked, not assumed — and the app is same-origin with the agent, so there is no permission, no
CORS and no mixed content anywhere in it. The agent proxies `/api` to the real server exactly as
Vercel's rewrite does today, which means the app runs unmodified.

It has a pleasant side effect: the same rule that stopped us reaching the agent stops every other
page reaching it too. The agent is only addressable by what it serves itself.

The public site keeps everything that is not recording — what this is, the rules, the community,
registering — and offers a link to `http://localhost`, which is a top-level navigation and not
subject to any of the above. Somebody without the agent simply finds nothing there, so "is it
installed" answers itself.

Installing it can be one pasted line — `curl … | sh`, the way rustup and bun and Homebrew itself
are installed. That is worth knowing for a second reason: **a binary installed from a terminal is
not quarantined, and does not need notarising.** The signing fees are the price of a double-click
installer, not of the software, and they can be deferred until there is a reason to pay them.

**The community, the calendar, the memo, the register and the claim all stay on the web**, exactly
as they are. The agent only ever handles bytes, and is meant to be invisible.

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
waiting              the film, and only the film
delivered            two weeks left, and the mailed link runs out with them
burned               nothing anywhere — six weeks after the run ended at the latest
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
- **The clock starts at delivery, not at the end of the run and not at a claim.** A film burns
  two weeks after it is first downloaded or posted, and in any case six weeks after the run
  ended. Four weeks of grace from the run's end would have expired on the same day as the
  four-week claim window — so the person who leaves their money until the last day arrives to
  collect it and finds the film burned that morning, and arriving to collect is exactly when
  most people would think to ask for it.

  A claim cannot be the clock either, however tempting. Claiming is per week and a film is per
  run, so there is no single claim to hang it on; a week that was missed has nothing to claim at
  all, and somebody who missed every week has no claim anywhere and still recorded minutes and
  still wants them. Money and film are separate questions, and only the film's own delivery
  answers the film's.

  The six weeks is the backstop for whoever never comes back — without one, their film is kept
  forever and the ceiling this section exists to create is gone again.

  It also collapses two numbers into one: a mailed link already lasts fourteen days, so the day
  the link dies is the day the film burns. One constant, and nothing extra to explain.
- **Storage versioning and lifecycle backups stay off.** With them on, deletion is not deletion.
  Temporary files from ffmpeg get cleaned up with the rest.

Under [the capsule](#the-capsule) this section shrinks to almost nothing: the minutes are never
here, so the only thing we burn is a key, and the joining and the burning of the clips both
happen on the participant's own machine. Everything below is what the burn means while the bytes
are still ours — which is the arrangement the trial runs on.

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
  the screen before it happens, and the check that the film is real before the minutes go. The
  burn clock hangs off delivery — two weeks from it, six from the run's end at the latest — so
  `FILM_MAIL_TTL_MS` and the grace are the same fourteen days and should be the same constant.
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
- **The local agent**, which is where all of this is going — see [the capsule](#the-capsule). It
  replaces three things that were separately on this list: object storage (nothing to store),
  encrypting in the browser (the wrong half of the capsule), and a CLI (you cannot see your face
  in a terminal).

  **It exists and it runs**, in [`agent/`](../agent): one pasted line installs it, it serves the
  app at `http://127.0.0.1:7531`, proxies `/api` to the real server, and takes itself off the
  machine when asked. What it does not do yet is the only part that matters — the clips still go
  to us. Next: store them there instead, encrypted under a key derived from the wallet, and join
  the film with the ffmpeg already on that machine.

  Still to answer:
  - **Does a signature come back identical every time?** **Half answered.** WebCrypto Ed25519
    signs the same sentence identically across five runs and across a re-imported key, and the
    HKDF key derived from it is stable — which covers the burner, since that is the same code
    path. Phantom and Backpack still need a human to click, because nothing else can make them
    sign. If it does not hold there, the key cannot be derived this way and the design fails
    quietly, losing films rather than erroring.
  - ~~Can an `https` page `fetch` from `http://localhost`?~~ **Answered: no.** Chrome's Local
    Network Access permission refuses it outright and never prompts. The agent serves the app
    instead — see [the capsule](#the-capsule). Checked in Chrome 153 against the deployed site.
- **Lower the bitrate.** 1.2 Mbps at 720p is generous for a face talking; 600 kbps at 480p takes
  a minute from about 12 MB to about 4.5 MB. One line, and two thirds of the storage question
  goes away while the storage question still exists.
- **Storage until then.** Clips go through the server to a mounted volume, which is right for ten
  people and wrong for fifty. If the agent is further off than it looks, this needs object
  storage in between.

### Settled, kept here so it is not re-litigated

- The upload pipeline was the last unknown and is answered: the browser records with
  `MediaRecorder` at 1.2 Mbps, times the length itself because the file does not say, and posts
  the bytes straight to the server. It records H.264 so the film is a two-second stream copy
  instead of a six-minute re-encode. A minute is about 9 MB; a week is about 80.
- The speech-verification spike is gone. No whisper, no word lists, no normalisation, no
  matching.
- The film is delivered as a link and never as an attachment: a week of minutes is 80 MB and a
  mailbox takes 25.
- **Posting films by mail was built and then removed.** Sending one means holding one, holding one
  means being able to watch it, and automating the send changes nothing about who could look. It
  is not compatible with [the capsule](#the-capsule) and was taken out before anybody was offered
  it.
- **Decentralised storage is the wrong answer here, however well it rhymes.** Arweave, IPFS and
  the rest exist to make deletion impossible, which is the one thing this product promises to do.
  A private diary on permanent public storage is unerasable forever, and encrypting it only moves
  the problem to whenever the key leaks. The part that needs to be trustless — the hash and the
  time — is already on chain; what is left is a hard drive, and hard drives do not improve by
  being on a blockchain.
- **The film is one film, at the end of the run**, not one per shell. Per-shell would have fitted
  a browser's memory, which is an argument about our constraints and not about what somebody
  wants at the end of ten weeks.
- **One machine per run**, once the agent exists, announced before anybody starts rather than
  discovered afterwards.
