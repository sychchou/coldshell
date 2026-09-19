use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("A run is between 1 and 10 shells.")]
    InvalidShells,
    #[msg("A stake is between 10 and 200 USDC.")]
    InvalidStake,
    #[msg("That day is not part of this run.")]
    InvalidDay,
    #[msg("That day is already recorded.")]
    AlreadyRecorded,
    #[msg("That day has not started yet.")]
    DayNotStarted,
    #[msg("That day can no longer be recorded.")]
    RecordingClosed,
    #[msg("That shell is not part of this run.")]
    InvalidShell,
    #[msg("That shell is still running.")]
    ShellNotOver,
    #[msg("A day of that shell is missing.")]
    WeekIncomplete,
    #[msg("That shell has already been settled.")]
    AlreadyClaimed,
    #[msg("The four weeks to claim that shell have passed.")]
    ClaimWindowClosed,
    #[msg("That shell was finished and can still be claimed.")]
    ClaimsPending,
    #[msg("Every shell has to be settled before the run can be closed.")]
    ShellsPending,
    #[msg("Only the participant or the treasury can do that.")]
    Unauthorized,
    #[msg("Arithmetic overflowed.")]
    MathOverflow,
}
