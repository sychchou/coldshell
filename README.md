# coldshell

**you vs you**

Stake what would hurt to lose. Record a minute of yourself every day. Nobody watches it. Finish
the week and every cent comes back, along with the film.

## How it works

You stake USDC on a run of **shells**. A shell is a calendar week — Monday to Sunday — numbered
globally, so everyone in shell #37 is in the same week whatever their run. A run is 1 to 10 of
them, and $10 to $200.

Every day, you record at least one minute of video in the browser. That is the whole obligation:
no subject, no length beyond the minute, nothing to prove.

Each week settles on its own. Record all seven days and that week's share comes back **whole** —
not a cent more, because there is no pool and nothing to win from anyone else. Miss a day and
that week is gone. The other weeks are untouched.

At the end, every minute you recorded is joined into one film.

## Nobody watches it

There is no verification. No transcription, no review, no oracle, no keyword to say out loud.

That is a consequence, not a shortcut. Because finishing returns exactly what you staked, and
nothing is redistributed, cheating costs only the cheater — so there is nothing for verification
to protect. Once that is true, the video never has to be read by anyone, which is the only
version of "we don't watch it" worth saying.

## Why a chain is involved

Our only income is the stake of somebody who did not finish. **We make money when you fail.**

That is exactly why the record of what you did is not in our database. Each recording's hash goes
on chain with the moment it arrived, in a program we cannot edit, holding money we cannot spend.
The arrangement is not there because it is fashionable; it is there because the person keeping
score has a reason to want you to lose.

Every fee and every lamport of rent is ours. A participant never needs SOL — only USDC, and only
once.

## The clock

- A shell is **your** Monday to your Sunday. The run is told where you keep your days when you
  place the stake, and counts from there — the chain has one clock and no way to learn yours.
- A day may be recorded **from an hour before it starts to 30 hours after**: the hour is for
  clocks that disagree by a little, and the six hours past the day are grace, because one bad
  evening should not cost a week.
- A week **settles on the Monday morning after it ends**, when its last day stops being
  recordable.
- A finished week can be claimed for **four weeks**. After that the platform may take it.
- You cannot join a week already under way. Pay by Sunday midnight; your run starts Monday.

[RULES.md](RULES.md) has all of it, and every number in it is a constant the program enforces.

## Layout

| | |
|---|---|
| [`programs/coldshell`](programs/coldshell) | the Anchor program: `enter`, `record_day`, `claim`, `sweep`, `close` |
| [`server`](server) | the API: transactions the platform pays for, the clips, the film |
| [`app`](app) | the site: one terminal window, and a back room at `/staff` |

The app reads every duration and bound from the program's IDL, so the screen cannot promise terms
the chain would refuse.

## Running it

```bash
anchor build && cargo test          # the program and its 42 tests
bash scripts/local-demo.sh          # a local chain on a ten-minute day, with runs to look at
npm --prefix server run dev         # the API
npm --prefix app run dev            # the site
```

`scripts/local-demo.sh` builds with the `short-clock` feature, which shrinks a day to ten minutes
and a week to seventy, so a whole run can be walked through in an hour. A deployed program is one
clock or the other; there is no switch afterwards.

## Status

Devnet. Rebuilt from an earlier project that counted camera time in a Discord room — same
escrow, a different kind of proof, and this time no proof at all beyond the fact that you
showed up.
