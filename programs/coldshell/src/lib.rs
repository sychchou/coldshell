use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GLt8XkwvvViMEy5x9xXRMXMdi6Lq96bT2xknRbqottud");

/// coldshell — stake on a run of weeks, record a minute a day, get each finished week back whole.
///
/// The program never judges a recording. It holds the money, timestamps what the participant
/// says they did, and refunds week by week; the day's hash travels in the instruction data, so
/// the ledger carries a commitment nobody can backdate.
#[program]
pub mod coldshell {
    use super::*;

    pub fn enter(ctx: Context<Enter>, shells: u8, stake: u64, utc_offset: i16) -> Result<()> {
        instructions::enter::handle_enter(ctx, shells, stake, utc_offset)
    }

    pub fn record_day(ctx: Context<RecordDay>, day: u16, hash: [u8; 32]) -> Result<()> {
        instructions::record_day::handle_record_day(ctx, day, hash)
    }

    pub fn claim(ctx: Context<Claim>, shell: u8) -> Result<()> {
        instructions::claim::handle_claim(ctx, shell)
    }

    pub fn sweep(ctx: Context<Sweep>, shell: u8) -> Result<()> {
        instructions::sweep::handle_sweep(ctx, shell)
    }

    pub fn close(ctx: Context<Close>) -> Result<()> {
        instructions::close::handle_close(ctx)
    }
}
