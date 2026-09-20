use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{starting_shell, Run},
};

/// Places a stake and starts a run.
///
/// Two signers: the participant, who authorises the transfer out of their own token account,
/// and the platform, who pays the rent for the run and its vault so that taking part never
/// requires holding SOL.
#[derive(Accounts)]
pub struct Enter<'info> {
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Run::INIT_SPACE,
        seeds = [RUN_SEED, user.key().as_ref()],
        bump,
    )]
    pub run: Box<Account<'info, Run>>,
    #[account(address = USDC_MINT, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = user,
        token::token_program = token_program,
    )]
    pub user_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = run,
        associated_token::token_program = token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// `utc_offset` is where the participant keeps their days, in minutes east of UTC. The chain has
/// one clock and no way to learn anybody's, so it is told once and never again — a run that could
/// move its own midnight could dodge a day it had already missed.
pub fn handle_enter(ctx: Context<Enter>, shells: u8, stake: u64, utc_offset: i16) -> Result<()> {
    require!(shells >= 1 && shells <= MAX_SHELLS, ErrorCode::InvalidShells);
    require!(stake >= MIN_STAKE && stake <= MAX_STAKE, ErrorCode::InvalidStake);
    require!(
        (MIN_UTC_OFFSET..=MAX_UTC_OFFSET).contains(&utc_offset),
        ErrorCode::InvalidOffset
    );

    let now = Clock::get()?.unix_timestamp;

    // The chain works out which week the run starts in; the caller does not get to nominate one.
    ctx.accounts.run.set_inner(Run {
        user: ctx.accounts.user.key(),
        first_shell: starting_shell(now, utc_offset)?,
        shells,
        stake,
        days: 0,
        claimed: 0,
        swept: 0,
        started_at: now,
        utc_offset,
        bump: ctx.bumps.run,
    });

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.user_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        stake,
        ctx.accounts.mint.decimals,
    )
}
