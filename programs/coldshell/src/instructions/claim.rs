use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{constants::*, error::ErrorCode, state::Run};

/// Takes back one finished week, whole. There is no pool and no fee: a week you did every day of
/// returns exactly what you staked on it.
#[derive(Accounts)]
pub struct Claim<'info> {
    pub user: Signer<'info>,
    #[account(mut, has_one = user, seeds = [RUN_SEED, user.key().as_ref()], bump = run.bump)]
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
        mut,
        associated_token::mint = mint,
        associated_token::authority = run,
        associated_token::token_program = token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim(ctx: Context<Claim>, shell: u8) -> Result<()> {
    let run = &mut ctx.accounts.run;
    require!(shell < run.shells, ErrorCode::InvalidShell);
    require!(run.claimed & (1u16 << shell) == 0, ErrorCode::AlreadyClaimed);
    require!(run.swept & (1u16 << shell) == 0, ErrorCode::AlreadySwept);

    let settles = run.shell_settles(shell)?;
    let now = Clock::get()?.unix_timestamp;
    require!(now >= settles, ErrorCode::ShellNotOver);
    // Said before the deadline, because "you missed a day" is the truer answer of the two.
    require!(run.shell_complete(shell), ErrorCode::WeekIncomplete);
    require!(now < run.claim_deadline(shell)?, ErrorCode::ClaimWindowClosed);

    let amount = run.share(shell)?;
    run.claimed |= 1u16 << shell;

    let user = run.user;
    let seeds: &[&[u8]] = &[RUN_SEED, user.as_ref(), &[run.bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: run.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}
