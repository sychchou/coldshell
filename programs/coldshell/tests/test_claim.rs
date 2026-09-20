mod common;

use {coldshell::constants::DAY_SECONDS, common::*, solana_keypair::Keypair, solana_signer::Signer};

const FIRST: u32 = 7;

fn a_run(shells: u8, stake: u64) -> (Env, Keypair) {
    // A run always starts in the next shell, so the stake is placed in the one before.
    let mut env = setup(shell_start(FIRST - 1) + 60);
    let user = new_user(&mut env.svm, 500 * USDC);
    enter(&mut env, &user, shells, stake).unwrap();
    (env, user)
}

fn week(offset: u8) -> Vec<u16> {
    let first = u16::from(offset) * 7;
    (first..first + 7).collect()
}

/// The week as a participant lives it: pay midweek, start the Monday after, record Monday
/// through Sunday, seal Sunday's minute on the following Monday, and get the money on Tuesday.
#[test]
fn a_stake_runs_the_following_week() {
    let mut env = setup(shell_start(FIRST) + 5 * DAY_SECONDS);
    let user = new_user(&mut env.svm, 500 * USDC);
    enter(&mut env, &user, 1, 10 * USDC).unwrap();

    let first = run_state(&env.svm, &user.pubkey()).first_shell;
    assert_eq!(first, FIRST + 1);

    // Monday through Saturday, each on its own day.
    record_days(&mut env, &user, first, &week(0)[..6]);

    // Sunday's minute still goes in on the Monday after the week has ended.
    set_time(&mut env.svm, shell_start(first + 1) + 60);
    record(&mut env, &user, 6).unwrap();
    let err = claim(&mut env, &user, 0).unwrap_err();
    assert!(err.contains("Custom(6006)"), "{err}");

    // And the money moves at midnight on the Tuesday, four weeks to come and collect it.
    let tuesday = shell_start(first + 1) + DAY_SECONDS;
    assert_eq!(tuesday, settles(first, 0));
    set_time(&mut env.svm, tuesday);
    claim(&mut env, &user, 0).unwrap();
    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())), 500 * USDC);
}

#[test]
fn a_finished_shell_comes_back_whole() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));

    set_time(&mut env.svm, settles(FIRST, 0));
    claim(&mut env, &user, 0).unwrap();

    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())), 500 * USDC);
    assert_eq!(token_amount(&env.svm, &vault(&user.pubkey())), 0);
    let run = run_state(&env.svm, &user.pubkey());
    assert_eq!((run.claimed, run.swept), (0b1, 0));
}

#[test]
fn a_shell_cannot_be_claimed_until_its_last_day_closes() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));

    // The week itself is over, but day 6 still has a day of grace left.
    set_time(&mut env.svm, shell_start(FIRST + 1));
    let err = claim(&mut env, &user, 0).unwrap_err();
    assert!(err.contains("Custom(6006)"), "{err}");

    set_time(&mut env.svm, settles(FIRST, 0) - 1);
    assert!(claim(&mut env, &user, 0).is_err());

    set_time(&mut env.svm, settles(FIRST, 0));
    claim(&mut env, &user, 0).unwrap();
}

#[test]
fn a_shell_with_a_day_missing_cannot_be_claimed() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &[0, 1, 2, 3, 4, 6]);

    set_time(&mut env.svm, settles(FIRST, 0));
    let err = claim(&mut env, &user, 0).unwrap_err();
    assert!(err.contains("Custom(6007)"), "{err}");
}

#[test]
fn claiming_twice_is_refused() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));
    set_time(&mut env.svm, settles(FIRST, 0));
    claim(&mut env, &user, 0).unwrap();

    let err = claim(&mut env, &user, 0).unwrap_err();
    assert!(err.contains("Custom(6008)"), "{err}");
}

#[test]
fn the_claim_window_closes_after_four_weeks() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));

    set_time(&mut env.svm, deadline(FIRST, 0));
    let err = claim(&mut env, &user, 0).unwrap_err();
    assert!(err.contains("Custom(6010)"), "{err}");

    set_time(&mut env.svm, deadline(FIRST, 0) - 1);
    claim(&mut env, &user, 0).unwrap();
}

#[test]
fn a_shell_outside_the_run_is_refused() {
    let (mut env, user) = a_run(2, 20 * USDC);
    set_time(&mut env.svm, settles(FIRST, 1));
    let err = claim(&mut env, &user, 2).unwrap_err();
    assert!(err.contains("Custom(6005)"), "{err}");
}

#[test]
fn every_shell_settles_on_its_own() {
    let (mut env, user) = a_run(3, 30 * USDC);
    let mut days = week(0);
    days.extend(week(2));
    days.extend([7, 8, 9, 10, 11, 12]); // shell 1 is one day short
    days.sort_unstable();
    record_days(&mut env, &user, FIRST, &days);

    set_time(&mut env.svm, settles(FIRST, 0));
    claim(&mut env, &user, 0).unwrap();

    set_time(&mut env.svm, settles(FIRST, 1));
    assert!(claim(&mut env, &user, 1).unwrap_err().contains("Custom(6007)"));
    sweep(&mut env, &user.pubkey(), 1).unwrap();

    set_time(&mut env.svm, settles(FIRST, 2));
    claim(&mut env, &user, 2).unwrap();

    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())), 490 * USDC);
    assert_eq!(token_amount(&env.svm, &treasury_ata()), 10 * USDC);
    assert_eq!(token_amount(&env.svm, &vault(&user.pubkey())), 0);
    // Two weeks back to the participant, the one with a day missing to the treasury.
    let run = run_state(&env.svm, &user.pubkey());
    assert_eq!((run.claimed, run.swept), (0b101, 0b010));
}

#[test]
fn the_shares_of_every_shell_add_up_to_the_stake() {
    let stake = 10_000_001;
    let (mut env, user) = a_run(3, stake);
    let mut days = week(0);
    days.extend(week(1));
    days.extend(week(2));
    record_days(&mut env, &user, FIRST, &days);

    let before = token_amount(&env.svm, &ata(&user.pubkey()));
    for offset in 0..3u8 {
        set_time(&mut env.svm, settles(FIRST, offset));
        claim(&mut env, &user, offset).unwrap();
    }

    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())) - before, stake);
    assert_eq!(token_amount(&env.svm, &vault(&user.pubkey())), 0);
}

#[test]
fn claiming_needs_the_participant() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));
    set_time(&mut env.svm, settles(FIRST, 0));

    // A stranger signing as `user` against the real run and vault.
    let stranger = new_user(&mut env.svm, 0);
    let ix = anchor_lang::solana_program::instruction::Instruction::new_with_bytes(
        coldshell::id(),
        &anchor_lang::InstructionData::data(&coldshell::instruction::Claim { shell: 0 }),
        anchor_lang::ToAccountMetas::to_account_metas(
            &coldshell::accounts::Claim {
                user: stranger.pubkey(),
                run: run_pda(&user.pubkey()),
                mint: coldshell::constants::USDC_MINT,
                user_token_account: ata(&stranger.pubkey()),
                vault: vault(&user.pubkey()),
                token_program: anchor_spl::token::ID,
            },
            None,
        ),
    );
    let payer = env.payer.insecure_clone();
    assert!(send(&mut env.svm, ix, &[&payer, &stranger]).is_err());
    assert_eq!(token_amount(&env.svm, &vault(&user.pubkey())), 10 * USDC);
}
