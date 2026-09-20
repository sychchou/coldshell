use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::Run};

/// A day of a run, marked by the participant themselves.
///
/// Nothing here judges the recording — the program cannot see it and does not want to. What it
/// does is put the moment and the clip's hash in the ledger, where neither the participant nor
/// the platform can move them afterwards. A day may be recorded more than once; the bit is the
/// promise kept, and each hash is a minute of it.
#[event]
pub struct DayRecorded {
    pub user: Pubkey,
    pub day: u16,
    pub hash: [u8; 32],
    pub at: i64,
}

#[derive(Accounts)]
pub struct RecordDay<'info> {
    pub user: Signer<'info>,
    #[account(mut, has_one = user, seeds = [RUN_SEED, user.key().as_ref()], bump = run.bump)]
    pub run: Account<'info, Run>,
}

pub fn handle_record_day(ctx: Context<RecordDay>, day: u16, hash: [u8; 32]) -> Result<()> {
    let run = &mut ctx.accounts.run;
    require!(day < run.total_days(), ErrorCode::InvalidDay);

    let day_start = run.day_start(day)?;
    let now = Clock::get()?.unix_timestamp;
    // Early, because the screen counts days in the participant's own timezone; late, because a
    // day of grace is kinder than losing a week to one bad evening.
    let opens = day_start
        .checked_sub(RECORD_EARLY_SECONDS)
        .ok_or(ErrorCode::MathOverflow)?;
    let closes = day_start
        .checked_add(RECORD_LATE_SECONDS)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(now >= opens, ErrorCode::DayNotStarted);
    require!(now <= closes, ErrorCode::RecordingClosed);

    // A day already marked can be marked again: one minute is the promise, and a day somebody
    // had more than one minute in is a day with more than one minute in it. The bit says the
    // promise was kept; each call puts another hash and another timestamp in the ledger, so
    // every minute of the film has a date of its own. How many a day may hold is not the
    // chain's business — it is a question about our storage and our fees, and it is settled
    // where those are spent.
    run.days |= 1u128 << day;

    emit!(DayRecorded { user: run.user, day, hash, at: now });
    Ok(())
}
