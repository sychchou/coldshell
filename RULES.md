# Rules

coldshell in full. Nothing here is hidden behind a click-through; the program enforces every
number below, and [the program is right here](programs/coldshell/src).

## The shape of it

You stake money on a run of weeks. Each day of a run, you record a minute of video. Nobody
watches it. Finish a week and that week's stake comes back whole. Miss a day and that week's
stake is gone.

There is no prize pool. Nothing you lose is paid to another participant, and nothing you win is
taken from one. Finishing returns exactly what you staked — not a cent more.

## A shell is a calendar week

A shell runs Monday 00:00 to Sunday 23:59 — **your** Monday, where you are. Your run is told
where you keep your days when you place the stake, and it counts from there afterwards, so
travelling does not move your week.

Shells are numbered from zero, and the number is an index rather than a cohort: two people in
different places are in shell #3 a few hours apart, and nothing here minds. There is no pool and
nobody's refund depends on anybody else's week.

**You cannot join a week already under way.** Pay any time up to Sunday midnight and your run
starts the following Monday — at most seven days of waiting.

## The stake

- **$10 to $200**, in USDC, whatever would hurt you to lose.
- **1 to 10 shells** in a run.
- The stake is split evenly across the shells of the run. Division leaves a few millionths of a
  dollar over; the last shell carries them, so the shares add up to exactly what you staked.
- **One run per wallet at a time**, and a week off between runs.

  That is not a rule invented to be strict — it is what the clock does. A run's last week
  settles on the Monday morning after it ends, which is the first moment you can collect it and
  close it; by then that week is already under way and cannot be joined. So the soonest a second
  run can start is the Monday after that.

  A week between commitments is a good thing to have. If that stops being true, this is the
  first thing that will change.

## A day

A day is one recording of **at least one minute**. There is no maximum you must reach and no
subject you must cover.

A day may be recorded **from an hour before it starts until 30 hours after**. The hour is for
clocks that disagree by a little. The six hours past the day itself are grace: one bad evening
should not cost a week, and finishing at two in the morning is finishing.

A day may hold **up to five minutes-worth of recordings**. One is enough to keep the day; the
rest are for the film.

## Nothing is checked

No one reviews your recording. There is no length beyond the minute, no subject, no judging, and
no way to fail a day except by not recording it. A full refund means cheating costs only the
cheater, which is why verification can be left out entirely.

## Settling, week by week

Each shell settles on its own. A missed day in week three costs week three and nothing else.

A week settles when its last day stops being recordable — **Monday at six in the morning**,
yours. From then:

- **Every day recorded** → the week's share is yours to claim.
- **Any day missing** → the week's share can be collected by the platform.

## Claiming

You have **four weeks** from a shell settling to claim it. Unclaimed weeks stack up; you can take
several at once. After four weeks the share can be swept to the platform like a forfeited one.

Sweeping is permissionless: anyone can call it, and the money can only ever go to the platform's
own account. That is deliberate — it means no key has to be kept anywhere to make the books move.

## What it costs you

Nothing but the stake. The platform pays every transaction fee and every lamport of rent, so you
never need SOL. The only money that moves from you is the stake itself, and only when you place
it.

The platform earns from forfeited weeks and from nothing else. That is exactly why the record of
what you did lives on a public chain rather than in our database: **we make money when you fail,
so the record is kept where we cannot edit it.**

## Your recordings

- They are stored, and the hash of each one is written on the chain with the moment it arrived.
- **We do not watch them.**
- A recording already written to the chain cannot be replaced — the hash is a promise that this
  exact file is the one that was sealed.
- At the end of a run they are joined, in order, into one film that you can download. A minute
  the chain never accepted is not in the film; it has no date of its own.
- You can burn any recording that never made it onto the chain.

## What can go wrong, and what happens

| | |
|---|---|
| Your wallet is locked when you seal | The recording is kept. Unlock and sign again; nothing uploads twice. |
| The upload works but the signature fails | The clip is stored, undated. Date it while the day's window is open, or burn it. |
| A day's window closes with nothing in it | That day is lost, and with it that week's share. The other weeks are untouched. |
| You never claim | Four weeks, then the share goes to the platform. |
| You want to stop mid-run | There is no unstaking. Remaining weeks run their course; finish them or forfeit them. |

## Where the numbers live

Every figure above is a constant in the program and is read by the site from the program's own
interface, so the screen cannot promise terms the chain would refuse. They are in
[`constants.rs`](programs/coldshell/src/constants.rs).
