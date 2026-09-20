# coldshell

**you vs you**

Put money on a period of your own life, and prove you showed up for it.

You stake USDC and enter a **shell** — seven days, or a month. Every day inside it you record
at least one minute of yourself and say that day's code out loud. Nobody watches it. Finish
every day and you get your stake back in full, along with every clip you made, stitched into
one film.

Quit, and your stake stays behind.

## Why a chain is involved

Two jobs, both real:

- **Escrow.** Your stake sits in a program, not in our bank account. We cannot spend it.
- **Timestamps.** Each day's video hash is written on chain the day it is made. That makes the
  final film impossible to backdate — anyone can check that the clip you claim to have recorded
  on the third day really did exist on the third day.

Both matter more than they look. Our only income is the stakes of people who did not finish —
which means we have a financial reason to want you to fail. Putting the record somewhere we
cannot edit is what makes that harmless.

## The daily code

Two English words, derived from the blockhash at the start of the day:

```
seed  = sha256(challenge ‖ day ‖ blockhash at 00:00 UTC)
word1 = WORDLIST[u16(seed[0..2]) % len]
word2 = WORDLIST[u16(seed[2..4]) % len]
```

Nobody picks it, including us, and anyone can recompute it. Because the code only exists on
the day it belongs to, a week of clips cannot be filmed in advance.

Say it in the first 15 seconds. A machine transcribes the audio and looks for the two words;
no person watches the video. Failed to be heard? Upload again, as many times as you like,
until the day is over.

## The money

- Finish every day → **100% of your stake back**. No fee.
- Network fees are ours. You never need SOL.
- Stakes left behind by people who did not finish pay for keeping and stitching everyone
  else's footage.

There is no prize pool and nothing to win from anyone else. You are not competing.

## Layout

- `programs/coldshell` — the Anchor program: stake, daily record, refund
- `server` — the API: today's code, upload, transcription check, oracle signing
- `app` — the site: one terminal window

## Status

Rebuilt from [proof-of-grind](https://github.com/sychchou/proof-of-grind), which measured camera
time in a Discord room. Same escrow, a different kind of proof. Nothing here has shipped yet.
