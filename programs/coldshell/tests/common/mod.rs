#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::Instruction,
        system_program, AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{associated_token, token},
    coldshell::{
        constants::{
            CLAIM_WINDOW_SECONDS, DAY_SECONDS, RECORD_LATE_SECONDS, RUN_SEED, SHELL_EPOCH_TS,
            TREASURY, USDC_MINT, WEEK_SECONDS,
        },
        state::Run,
    },
    litesvm::LiteSVM,
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const USDC: u64 = 1_000_000;

pub struct Env {
    pub svm: LiteSVM,
    /// The platform. Pays every fee and every lamport of rent, exactly as it does in production.
    pub payer: Keypair,
}

pub fn setup(now: i64) -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/coldshell.so"));
    svm.add_program(coldshell::id(), bytes).unwrap();

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 100_000_000_000).unwrap();
    // The treasury exists on chain but never signs anything here — sweeping is permissionless.
    svm.airdrop(&TREASURY, 1_000_000_000).unwrap();
    set_mint(&mut svm, &USDC_MINT, 6);
    set_token_account(&mut svm, &treasury_ata(), &USDC_MINT, &TREASURY, 0);
    set_time(&mut svm, now);
    Env { svm, payer }
}

pub fn set_time(svm: &mut LiteSVM, now: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = now;
    svm.set_sysvar(&clock);
}

pub fn set_mint(svm: &mut LiteSVM, mint: &Pubkey, decimals: u8) {
    // spl-token Mint layout (82 bytes)
    let mut data = vec![0u8; 82];
    data[44] = decimals;
    data[45] = 1; // is_initialized
    svm.set_account(
        *mint,
        Account { lamports: 1_461_600, data, owner: token::ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();
}

pub fn set_token_account(
    svm: &mut LiteSVM,
    address: &Pubkey,
    mint: &Pubkey,
    owner: &Pubkey,
    amount: u64,
) {
    // spl-token Account layout (165 bytes)
    let mut data = vec![0u8; 165];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1; // state = Initialized
    svm.set_account(
        *address,
        Account { lamports: 2_039_280, data, owner: token::ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();
}

pub fn token_amount(svm: &LiteSVM, address: &Pubkey) -> u64 {
    let acc = svm.get_account(address).unwrap();
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

pub fn ata(owner: &Pubkey) -> Pubkey {
    associated_token::get_associated_token_address(owner, &USDC_MINT)
}

pub fn treasury_ata() -> Pubkey {
    ata(&TREASURY)
}

pub fn run_pda(user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[RUN_SEED, user.as_ref()], &coldshell::id()).0
}

pub fn vault(user: &Pubkey) -> Pubkey {
    ata(&run_pda(user))
}

pub fn run_state(svm: &LiteSVM, user: &Pubkey) -> Run {
    let acc = svm.get_account(&run_pda(user)).unwrap();
    Run::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

/// First signer pays fees.
pub fn send(svm: &mut LiteSVM, ix: Instruction, signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let msg =
        Message::new_with_blockhash(&[ix], Some(&signers[0].pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

/// A participant with USDC and not one lamport. If any instruction ever starts asking the
/// participant for rent or fees, every test using this fails at once.
pub fn new_user(svm: &mut LiteSVM, usdc: u64) -> Keypair {
    let user = Keypair::new();
    set_token_account(svm, &ata(&user.pubkey()), &USDC_MINT, &user.pubkey(), usdc);
    user
}

// ── The clock, mirrored so a test reads next to the handler ──────────────────

/// Every test runs at UTC unless it is testing the offset itself, so the harness keeps one
/// number and every helper agrees with it.
pub const OFFSET: i16 = 0;

pub fn shell_start(index: u32) -> i64 {
    SHELL_EPOCH_TS + i64::from(index) * WEEK_SECONDS - i64::from(OFFSET) * 60
}

pub fn current_shell(now: i64) -> u32 {
    u32::try_from((now + i64::from(OFFSET) * 60 - SHELL_EPOCH_TS) / WEEK_SECONDS).unwrap()
}

pub fn day_start(first_shell: u32, day: u16) -> i64 {
    shell_start(first_shell) + i64::from(day) * DAY_SECONDS
}

/// When a shell's money can move: a day past the week's end, where the last day's grace runs out.
pub fn settles(first_shell: u32, offset: u8) -> i64 {
    shell_start(first_shell + u32::from(offset)) + WEEK_SECONDS + RECORD_LATE_SECONDS - DAY_SECONDS
}

pub fn deadline(first_shell: u32, offset: u8) -> i64 {
    settles(first_shell, offset) + CLAIM_WINDOW_SECONDS
}

// ── Instructions ─────────────────────────────────────────────────────────────

pub fn enter_ix(user: &Pubkey, payer: &Pubkey, shells: u8, stake: u64) -> Instruction {
    enter_ix_at(user, payer, shells, stake, OFFSET)
}

/// For the tests that are about where a run keeps its days rather than what it costs.
pub fn enter_ix_at(
    user: &Pubkey,
    payer: &Pubkey,
    shells: u8,
    stake: u64,
    utc_offset: i16,
) -> Instruction {
    Instruction::new_with_bytes(
        coldshell::id(),
        &coldshell::instruction::Enter { shells, stake, utc_offset }.data(),
        coldshell::accounts::Enter {
            user: *user,
            payer: *payer,
            run: run_pda(user),
            mint: USDC_MINT,
            user_token_account: ata(user),
            vault: vault(user),
            token_program: token::ID,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

pub fn record_day_ix(user: &Pubkey, day: u16, hash: [u8; 32]) -> Instruction {
    Instruction::new_with_bytes(
        coldshell::id(),
        &coldshell::instruction::RecordDay { day, hash }.data(),
        coldshell::accounts::RecordDay { user: *user, run: run_pda(user) }.to_account_metas(None),
    )
}

pub fn claim_ix(user: &Pubkey, shell: u8) -> Instruction {
    Instruction::new_with_bytes(
        coldshell::id(),
        &coldshell::instruction::Claim { shell }.data(),
        coldshell::accounts::Claim {
            user: *user,
            run: run_pda(user),
            mint: USDC_MINT,
            user_token_account: ata(user),
            vault: vault(user),
            token_program: token::ID,
        }
        .to_account_metas(None),
    )
}

pub fn sweep_ix(user: &Pubkey, shell: u8) -> Instruction {
    Instruction::new_with_bytes(
        coldshell::id(),
        &coldshell::instruction::Sweep { shell }.data(),
        coldshell::accounts::Sweep {
            run: run_pda(user),
            mint: USDC_MINT,
            treasury_token_account: treasury_ata(),
            vault: vault(user),
            token_program: token::ID,
        }
        .to_account_metas(None),
    )
}

pub fn close_ix(authority: &Pubkey, user: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        coldshell::id(),
        &coldshell::instruction::Close {}.data(),
        coldshell::accounts::Close {
            authority: *authority,
            rent_destination: TREASURY,
            run: run_pda(user),
            mint: USDC_MINT,
            treasury_token_account: treasury_ata(),
            vault: vault(user),
            token_program: token::ID,
        }
        .to_account_metas(None),
    )
}

// ── Shorthands ───────────────────────────────────────────────────────────────

pub fn enter(env: &mut Env, user: &Keypair, shells: u8, stake: u64) -> Result<(), String> {
    let ix = enter_ix(&user.pubkey(), &env.payer.pubkey(), shells, stake);
    let payer = env.payer.insecure_clone();
    send(&mut env.svm, ix, &[&payer, user])
}

pub fn record(env: &mut Env, user: &Keypair, day: u16) -> Result<(), String> {
    let ix = record_day_ix(&user.pubkey(), day, [7u8; 32]);
    let payer = env.payer.insecure_clone();
    send(&mut env.svm, ix, &[&payer, user])
}

pub fn claim(env: &mut Env, user: &Keypair, shell: u8) -> Result<(), String> {
    let ix = claim_ix(&user.pubkey(), shell);
    let payer = env.payer.insecure_clone();
    send(&mut env.svm, ix, &[&payer, user])
}

pub fn sweep(env: &mut Env, user: &Pubkey, shell: u8) -> Result<(), String> {
    let ix = sweep_ix(user, shell);
    let payer = env.payer.insecure_clone();
    send(&mut env.svm, ix, &[&payer])
}

/// Steps the clock into each of the given days and records it. Leaves the clock where it ended.
pub fn record_days(env: &mut Env, user: &Keypair, first_shell: u32, days: &[u16]) {
    for &day in days {
        set_time(&mut env.svm, day_start(first_shell, day) + 1);
        record(env, user, day).unwrap();
    }
}
