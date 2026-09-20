use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode};

/// One commitment: a stake, the weeks it covers, and which of their days have been recorded.
///
/// A wallet has one of these at a time. Closing it frees the seed, so finishing a run and
/// starting another is the same thing as starting the first.
#[account]
#[derive(InitSpace)]
pub struct Run {
    pub user: Pubkey,
    /// The shell this run began in. Shell 1 starts at `SHELL_EPOCH_TS`.
    pub first_shell: u32,
    /// How many consecutive shells were committed to, 1 to `MAX_SHELLS`.
    pub shells: u8,
    /// Everything staked, in mint base units.
    pub stake: u64,
    /// One bit per day of the run; ten shells of seven days needs seventy.
    pub days: u128,
    /// One bit per shell, set when its share went back to the participant.
    pub claimed: u16,
    /// One bit per shell, set when its share went to the treasury instead. Kept apart from
    /// `claimed` because two bytes is a cheap price for being able to answer, forever, whether
    /// a week came back or was forfeited.
    pub swept: u16,
    pub started_at: i64,
    /// Where this run keeps its days, in minutes east of UTC.
    ///
    /// Said once, at the start, and never again — otherwise a day could be dodged by moving the
    /// clock after missing it. Nothing is gained by lying about it either: whatever it says, a
    /// week is seven of that run's own days.
    pub utc_offset: i16,
    pub bump: u8,
}

impl Run {
    /// Midnight, where this run lives.
    ///
    /// Every boundary below is the participant's own, not UTC's. The chain has one clock and no
    /// way to learn anybody's, so the run carries the answer and the program does the shifting.
    fn midnight(&self, weeks: i64, days: i64) -> Result<i64> {
        weeks
            .checked_mul(WEEK_SECONDS)
            .and_then(|w| w.checked_add(days.checked_mul(DAY_SECONDS)?))
            .and_then(|elapsed| elapsed.checked_add(SHELL_EPOCH_TS))
            .and_then(|utc| utc.checked_sub(i64::from(self.utc_offset) * 60))
            .ok_or(ErrorCode::MathOverflow.into())
    }

    /// When a shell of this run begins. `offset` is 0 for the first shell of the run.
    pub fn shell_start(&self, offset: u8) -> Result<i64> {
        let index = i64::from(self.first_shell)
            .checked_add(i64::from(offset))
            .ok_or(ErrorCode::MathOverflow)?;
        self.midnight(index, 0)
    }

    pub fn shell_end(&self, offset: u8) -> Result<i64> {
        self.shell_start(offset)?
            .checked_add(WEEK_SECONDS)
            .ok_or(ErrorCode::MathOverflow.into())
    }

    /// When a shell's money can move. The last day of a week stays recordable for
    /// `RECORD_LATE_SECONDS` after it begins, which is a day past the week's own end, so
    /// settling at `shell_end` would either confiscate a week still being saved or refuse one
    /// still being finished. This is the first moment neither can happen.
    pub fn shell_settles(&self, offset: u8) -> Result<i64> {
        self.shell_end(offset)?
            .checked_add(RECORD_LATE_SECONDS - DAY_SECONDS)
            .ok_or(ErrorCode::MathOverflow.into())
    }

    /// The last moment a finished shell belongs to the participant.
    pub fn claim_deadline(&self, offset: u8) -> Result<i64> {
        self.shell_settles(offset)?
            .checked_add(CLAIM_WINDOW_SECONDS)
            .ok_or(ErrorCode::MathOverflow.into())
    }

    /// When a day of the run begins. `day` counts from 0 across the whole run.
    pub fn day_start(&self, day: u16) -> Result<i64> {
        self.midnight(i64::from(self.first_shell), i64::from(day))
    }

    pub fn total_days(&self) -> u16 {
        u16::from(self.shells) * DAYS_PER_SHELL
    }

    /// Every day of one shell, recorded.
    pub fn shell_complete(&self, offset: u8) -> bool {
        let first = u32::from(offset) * u32::from(DAYS_PER_SHELL);
        let mask = ((1u128 << DAYS_PER_SHELL) - 1) << first;
        self.days & mask == mask
    }

    /// Shells whose money has left the vault, whichever way it went.
    pub fn resolved(&self) -> u16 {
        self.claimed | self.swept
    }

    pub fn is_resolved(&self, offset: u8) -> bool {
        self.resolved() & (1u16 << offset) != 0
    }

    /// What one shell is worth. Division leaves at most a few millionths of a dollar over, and
    /// the last shell carries it so that every share together is exactly the stake.
    pub fn share(&self, offset: u8) -> Result<u64> {
        let shells = u64::from(self.shells);
        let each = self.stake.checked_div(shells).ok_or(ErrorCode::MathOverflow)?;
        if u64::from(offset) + 1 < shells {
            return Ok(each);
        }
        let paid = each
            .checked_mul(shells - 1)
            .ok_or(ErrorCode::MathOverflow)?;
        self.stake.checked_sub(paid).ok_or(ErrorCode::MathOverflow.into())
    }
}

/// The shell a moment falls in for somebody `utc_offset` minutes east of UTC, counted from zero.
///
/// Shell numbers are an index, not a cohort: two people in different places are in shell #3 at
/// slightly different hours, and nothing in this program cares. There is no pool and nobody's
/// refund depends on anybody else's week.
pub fn current_shell(now: i64, utc_offset: i16) -> Result<u32> {
    let elapsed = now
        .checked_add(i64::from(utc_offset) * 60)
        .and_then(|local| local.checked_sub(SHELL_EPOCH_TS))
        .ok_or(ErrorCode::MathOverflow)?;
    require!(elapsed >= 0, ErrorCode::MathOverflow);
    u32::try_from(elapsed / WEEK_SECONDS).map_err(|_| ErrorCode::MathOverflow.into())
}

/// The shell a run paid for at `now` begins in: always the next one.
///
/// A week already under way cannot be joined at all. Letting someone in a day or two late would
/// sell them a week they had already lost part of, and the screen would then have to explain why
/// the shell it just called running is also the shell being bought. Pay any time up to Sunday
/// midnight and the run starts on Monday.
///
/// Before the first shell has begun there is no week under way, so a run paid for then starts at
/// the first one. Otherwise the program would refuse everybody until the epoch passed, for no
/// reason anybody could be told.
pub fn starting_shell(now: i64, utc_offset: i16) -> Result<u32> {
    if now.saturating_add(i64::from(utc_offset) * 60) < SHELL_EPOCH_TS {
        return Ok(0);
    }
    current_shell(now, utc_offset)?
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow.into())
}
