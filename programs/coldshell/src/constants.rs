use anchor_lang::prelude::*;

/// Receives forfeited stakes, and the rent back when a run is closed.
#[constant]
pub const TREASURY: Pubkey = pubkey!("Gda3akHfzA74Dyz7qJhrj2EsFYX8AqH8s2Za41XpQMNf");

/// Circle devnet USDC.
#[constant]
pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

/// One run per wallet at a time; closing it frees the seed for the next one.
#[constant]
pub const RUN_SEED: &[u8] = b"run";

/// Shells are 1 to 10 weeks, so ten bits of `claimed` and `swept` and seventy of `days`.
#[constant]
pub const MAX_SHELLS: u8 = 10;

/// $10, in USDC base units. Below this nothing is really at stake.
#[constant]
pub const MIN_STAKE: u64 = 10_000_000;

/// $200. The ceiling protects people from themselves, not the platform from them.
#[constant]
pub const MAX_STAKE: u64 = 200_000_000;

// ── The clock ────────────────────────────────────────────────────────────────
// `short-clock` divides every duration by 144, so a day is ten minutes and a week seventy.
// A whole run can then be walked through in an hour. The app reads these out of the IDL, so
// the screen and the chain can never disagree about how long a day is.

#[cfg(not(feature = "short-clock"))]
mod clock {
    /// Shell #1 begins Monday 2026-09-14 00:00 UTC.
    pub const SHELL_EPOCH_TS: i64 = 1_789_344_000;
    pub const DAY_SECONDS: i64 = 24 * 60 * 60;
    /// A day may be recorded this long before it starts: the screen counts days in the
    /// participant's local time, and the chain only knows UTC.
    pub const RECORD_EARLY_SECONDS: i64 = 14 * 60 * 60;
    /// And this long after, which is a deliberate day of grace for catching one up.
    pub const RECORD_LATE_SECONDS: i64 = 48 * 60 * 60;
    /// A finished week can be claimed for four weeks. After that the platform may sweep it.
    pub const CLAIM_WINDOW_SECONDS: i64 = 28 * 24 * 60 * 60;
}

#[cfg(feature = "short-clock")]
mod clock {
    /// Moved to the morning of whatever day the run-through is, so that shell #1 starts within
    /// minutes of the build and the ten-minute joining grace can actually be caught. A whole run
    /// is seventy minutes; waiting most of one for a boundary is most of the test.
    /// Sunday 2026-09-20 01:00 UTC.
    pub const SHELL_EPOCH_TS: i64 = 1_789_866_000;
    pub const DAY_SECONDS: i64 = 10 * 60;
    pub const RECORD_EARLY_SECONDS: i64 = 350;
    pub const RECORD_LATE_SECONDS: i64 = 20 * 60;
    pub const CLAIM_WINDOW_SECONDS: i64 = 4 * 60 * 60 + 40 * 60;
}

#[constant]
pub const SHELL_EPOCH_TS: i64 = clock::SHELL_EPOCH_TS;

#[constant]
pub const DAY_SECONDS: i64 = clock::DAY_SECONDS;

#[constant]
pub const DAYS_PER_SHELL: u16 = 7;

#[constant]
pub const WEEK_SECONDS: i64 = DAY_SECONDS * DAYS_PER_SHELL as i64;

#[constant]
pub const RECORD_EARLY_SECONDS: i64 = clock::RECORD_EARLY_SECONDS;

#[constant]
pub const RECORD_LATE_SECONDS: i64 = clock::RECORD_LATE_SECONDS;

#[constant]
pub const CLAIM_WINDOW_SECONDS: i64 = clock::CLAIM_WINDOW_SECONDS;

