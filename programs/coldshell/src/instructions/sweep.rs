use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{constants::*, error::ErrorCode, state::Run};

/// Collects a week the participant did not finish, or one they finished and never came back for.
///
/// This is the platform's only income, which is exactly why the record it reads has to live
/// somewhere the platform cannot edit.
///
/// Anyone may call it. The money can only ever go to the treasury's own token account, so there
/// is nothing to gain by calling it early and nothing to lose by letting a stranger call it late
/// — and the treasury key never has to sit on a server to keep the books moving.
#[derive(Accounts)]
pub struct Sweep<'info> {
    #[account(mut, seeds = [RUN_SEED, run.user.as_ref()], bump = run.bump)]
    pub run: Box<Account<'info, Run>>,
    #[account(address = USDC_MINT, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = TREASURY,
        associated_token::token_program = token_program,
    )]
    pub treasury_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = run,
        associated_token::token_program = token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_sweep(ctx: Context<Sweep>, shell: u8) -> Result<()> {
    let run = &mut ctx.accounts.run;
    require!(shell < run.shells, ErrorCode::InvalidShell);
    require!(run.claimed & (1u16 << shell) == 0, ErrorCode::AlreadyClaimed);
    require!(run.swept & (1u16 << shell) == 0, ErrorCode::AlreadySwept);

    let now = Clock::get()?.unix_timestamp;
    require!(now >= run.shell_settles(shell)?, ErrorCode::ShellNotOver);

    // A week that was finished belongs to the participant until their four weeks run out.
    if run.shell_complete(shell) {
        require!(now >= run.claim_deadline(shell)?, ErrorCode::ClaimsPending);
    }

    let amount = run.share(shell)?;
    run.swept |= 1u16 << shell;

    let user = run.user;
    let seeds: &[&[u8]] = &[RUN_SEED, user.as_ref(), &[run.bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: run.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}
