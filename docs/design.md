# coldshell design notes

The decisions carried over from the earlier project, written down as they were settled in chat.
This is an internal memo, so unsettled questions and backlog sit next to finished things — the
public document is [RULES.md](../RULES.md).

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

Once it is delivered, nothing stays on our side. "It is not here any more" is a keepable promise in
a way "we don't look" is not, and holding thousands of people's private videos forever is a
liability that eventually, certainly, goes wrong.

```
run ends → joined → delivered → grace period (2–4 weeks) → originals and film both deleted
```

- **Never burn before delivery is confirmed.** Deleting after a bounced email erases somebody's
  month for good. State the grace period and the burn date from the start, and say it once more on
  the status screen as a line like `your shell burns in 6 days`.
- The grace period has to outlast the dispute period. Once it is deleted there is nothing left to
  check a "the check was wrong" complaint against.
- **Delivery carries the original clips alongside the joined film.** Then the participant can
  compare the original hashes against the chain, and the ability to verify after the fact remains
  **with them alone**.
- The film is deleted too. Deleting the originals while keeping the film is keeping the content.
- **Storage versioning and lifecycle backups stay off.** With them on, deletion is not deletion.
  Temporary files from ffmpeg get cleaned up with the rest.

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

### To revisit: removing the oracle

Currently an oracle signs `record_day`. The judgement is narrow — did a file over sixty seconds
arrive today — but it is still our judgement.

**If the participant signs instead**, the block time is the evidence, and we pay the fee while
testifying to nothing. The proof path has nobody left to trust. What remains is "is that file
really a minute of video", and that is a question only the participant can lose on.

## Not settled yet

- How the joined film is delivered (email? a download link?)
- The community tab — a window where participants leave a line each. Who may write (participants
  only, most likely); staff deletion needed from day one.
- A CLI. Low priority — a student studying does not install a terminal app. The web terminal
  already gives that feeling at zero installation cost.

## To check first (before building anything else)

**The upload pipeline.** It is the one unknown left.

- What a minute of 720p actually weighs, and how long an upload feels
- Recording in the browser (`MediaRecorder`) vs picking a file — which is easier
- R2 presigned URLs, direct (going through the server falls over)
- How to check the length in the browser

The speech-verification spike is gone. No whisper, no word lists, no normalisation, no matching.
