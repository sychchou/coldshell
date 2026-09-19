use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::{constants::*, error::ErrorCode, state::Run};

/// Puts a finished run away and gives the rent back.
///
/// Either the participant or the treasury may call it — the rent returns to the treasury that
/// paid it either way, so there is nothing to race over. Without this, every run ever started
/// would sit on chain forever holding a little SOL hostage.
#[derive(Accounts)]
pub struct Close<'info> {
    #[account(
        constraint = authority.key() == run.user || authority.key() == TREASURY
            @ ErrorCode::Unauthorized,
    )]
    pub authority: Signer<'info>,
    /// CHECK: only ever a destination for lamports, and pinned to the treasury address.
    #[account(mut, address = TREASURY)]
    pub rent_destination: UncheckedAccount<'info>,
    #[account(
        mut,
        close = rent_destination,
        seeds = [RUN_SEED, run.user.as_ref()],
        bump = run.bump,
    )]
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

pub fn handle_close(ctx: Context<Close>) -> Result<()> {
    let run = &ctx.accounts.run;
    let all = (1u16 << run.shells) - 1;
    if run.resolved() & all != all {
        // Once the last shell's four weeks are up nothing can legitimately be claimed any more,
        // so the rest goes where a sweep would have sent it. Otherwise a participant could not
        // start again until we got round to sweeping the weeks they gave up on.
        let now = Clock::get()?.unix_timestamp;
        let last = run.claim_deadline(run.shells - 1)?;
        require!(now >= last, ErrorCode::ShellsPending);
    }

    let user = run.user;
    let seeds: &[&[u8]] = &[RUN_SEED, user.as_ref(), &[run.bump]];

    // Whatever is left — weeks nobody swept, dust, anything a stranger sent to the vault.
    let residual = ctx.accounts.vault.amount;
    if residual > 0 {
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
            residual,
            ctx.accounts.mint.decimals,
        )?;
    }

    close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.rent_destination.to_account_info(),
            authority: run.to_account_info(),
        },
        &[seeds],
    ))
}
