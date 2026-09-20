mod common;

use {
    coldshell::constants::TREASURY, common::*, solana_keypair::Keypair, solana_signer::Signer,
};

const FIRST: u32 = 3;

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

fn close(env: &mut Env, authority: &Keypair, user: &Keypair) -> Result<(), String> {
    let ix = close_ix(&authority.pubkey(), &user.pubkey());
    let payer = env.payer.insecure_clone();
    send(&mut env.svm, ix, &[&payer, authority])
}

#[test]
fn a_forfeited_shell_goes_to_the_treasury() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &[0, 1]);

    set_time(&mut env.svm, settles(FIRST, 0));
    sweep(&mut env, &user.pubkey(), 0).unwrap();

    assert_eq!(token_amount(&env.svm, &treasury_ata()), 10 * USDC);
    assert_eq!(token_amount(&env.svm, &vault(&user.pubkey())), 0);
    let run = run_state(&env.svm, &user.pubkey());
    assert_eq!((run.claimed, run.swept), (0, 0b1));
}

#[test]
fn a_shell_cannot_be_swept_while_its_last_day_is_still_open() {
    let (mut env, user) = a_run(1, 10 * USDC);

    // The week has ended, but day 6 can still be recorded for another day.
    set_time(&mut env.svm, settles(FIRST, 0) - 1);
    let err = sweep(&mut env, &user.pubkey(), 0).unwrap_err();
    assert!(err.contains("Custom(6007)"), "{err}");
}

#[test]
fn a_finished_shell_is_the_participants_for_four_weeks() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));

    set_time(&mut env.svm, deadline(FIRST, 0) - 1);
    let err = sweep(&mut env, &user.pubkey(), 0).unwrap_err();
    assert!(err.contains("Custom(6012)"), "{err}");

    set_time(&mut env.svm, deadline(FIRST, 0));
    sweep(&mut env, &user.pubkey(), 0).unwrap();
    assert_eq!(token_amount(&env.svm, &treasury_ata()), 10 * USDC);
}

#[test]
fn sweeping_twice_and_sweeping_a_claim_are_both_refused() {
    let (mut env, user) = a_run(2, 20 * USDC);
    record_days(&mut env, &user, FIRST, &week(1));

    set_time(&mut env.svm, settles(FIRST, 0));
    sweep(&mut env, &user.pubkey(), 0).unwrap();
    assert!(sweep(&mut env, &user.pubkey(), 0).unwrap_err().contains("Custom(6010)"));

    set_time(&mut env.svm, settles(FIRST, 1));
    claim(&mut env, &user, 1).unwrap();
    assert!(sweep(&mut env, &user.pubkey(), 1).unwrap_err().contains("Custom(6009)"));
}

#[test]
fn anyone_may_sweep_and_the_money_still_goes_to_the_treasury() {
    let (mut env, user) = a_run(1, 10 * USDC);
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();

    set_time(&mut env.svm, settles(FIRST, 0));
    let ix = sweep_ix(&user.pubkey(), 0);
    send(&mut env.svm, ix, &[&stranger]).unwrap();

    assert_eq!(token_amount(&env.svm, &treasury_ata()), 10 * USDC);
}

#[test]
fn a_run_with_a_shell_still_open_cannot_be_closed() {
    let (mut env, user) = a_run(2, 20 * USDC);
    let mut days = week(0);
    days.extend(week(1));
    record_days(&mut env, &user, FIRST, &days);

    set_time(&mut env.svm, settles(FIRST, 0));
    claim(&mut env, &user, 0).unwrap();

    let err = close(&mut env, &user, &user).unwrap_err();
    assert!(err.contains("Custom(6013)"), "{err}");
}

#[test]
fn closing_returns_the_rent_and_frees_the_wallet_for_another_run() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));
    set_time(&mut env.svm, settles(FIRST, 0));
    claim(&mut env, &user, 0).unwrap();

    let before = env.svm.get_balance(&TREASURY).unwrap();
    close(&mut env, &user, &user).unwrap();
    let after = env.svm.get_balance(&TREASURY).unwrap();

    // The vault alone is 2_039_280 lamports, so anything above that is both accounts.
    assert!(after - before > 3_000_000, "rent came back: {}", after - before);
    assert!(env.svm.get_account(&run_pda(&user.pubkey())).is_none());
    assert!(env.svm.get_account(&vault(&user.pubkey())).is_none());

    // And the wallet can start again at the same address.
    set_time(&mut env.svm, shell_start(FIRST + 5) + 60);
    enter(&mut env, &user, 1, 10 * USDC).unwrap();
    assert_eq!(run_state(&env.svm, &user.pubkey()).first_shell, FIRST + 6);
}

#[test]
fn a_stranger_may_not_close_a_run() {
    let (mut env, user) = a_run(1, 10 * USDC);
    set_time(&mut env.svm, settles(FIRST, 0));
    sweep(&mut env, &user.pubkey(), 0).unwrap();

    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let err = close(&mut env, &stranger, &user).unwrap_err();
    assert!(err.contains("Custom(6014)"), "{err}");

    // The participant, on the other hand, can.
    close(&mut env, &user, &user).unwrap();
}

#[test]
fn after_the_last_deadline_close_takes_whatever_is_left() {
    let (mut env, user) = a_run(2, 20 * USDC);

    set_time(&mut env.svm, deadline(FIRST, 1));
    close(&mut env, &user, &user).unwrap();

    assert_eq!(token_amount(&env.svm, &treasury_ata()), 20 * USDC);
    assert!(env.svm.get_account(&run_pda(&user.pubkey())).is_none());
    assert!(env.svm.get_account(&vault(&user.pubkey())).is_none());
}

#[test]
fn a_gift_to_the_vault_never_inflates_a_refund() {
    let (mut env, user) = a_run(1, 10 * USDC);
    record_days(&mut env, &user, FIRST, &week(0));

    // A stranger sends the vault five dollars.
    let run = run_pda(&user.pubkey());
    set_token_account(
        &mut env.svm,
        &vault(&user.pubkey()),
        &coldshell::constants::USDC_MINT,
        &run,
        15 * USDC,
    );

    set_time(&mut env.svm, settles(FIRST, 0));
    claim(&mut env, &user, 0).unwrap();
    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())), 500 * USDC);

    close(&mut env, &user, &user).unwrap();
    assert_eq!(token_amount(&env.svm, &treasury_ata()), 5 * USDC);
}
