mod common;

use {
    anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas},
    coldshell::constants::{RECORD_EARLY_SECONDS, RECORD_LATE_SECONDS},
    common::*,
    solana_signer::Signer,
};

const FIRST: u32 = 12;

fn a_run(shells: u8) -> (Env, solana_keypair::Keypair) {
    let mut env = setup(shell_start(FIRST) + 60);
    let user = new_user(&mut env.svm, 50 * USDC);
    enter(&mut env, &user, shells, 10 * USDC).unwrap();
    (env, user)
}

#[test]
fn a_day_inside_its_window_is_recorded() {
    let (mut env, user) = a_run(2);

    record_days(&mut env, &user, FIRST, &[0, 3]);

    let run = run_state(&env.svm, &user.pubkey());
    assert_eq!(run.days, 0b1001);
}

#[test]
fn the_early_edge() {
    let (mut env, user) = a_run(1);
    let opens = day_start(FIRST, 4) - RECORD_EARLY_SECONDS;

    set_time(&mut env.svm, opens - 1);
    let err = record(&mut env, &user, 4).unwrap_err();
    assert!(err.contains("Custom(6004)"), "{err}");

    set_time(&mut env.svm, opens);
    record(&mut env, &user, 4).unwrap();
}

#[test]
fn the_late_edge() {
    let (mut env, user) = a_run(1);
    let closes = day_start(FIRST, 2) + RECORD_LATE_SECONDS;

    set_time(&mut env.svm, closes + 1);
    let err = record(&mut env, &user, 2).unwrap_err();
    assert!(err.contains("Custom(6005)"), "{err}");

    set_time(&mut env.svm, closes);
    record(&mut env, &user, 2).unwrap();
}

#[test]
fn the_same_day_twice_is_refused() {
    let (mut env, user) = a_run(1);
    record_days(&mut env, &user, FIRST, &[1]);
    let err = record(&mut env, &user, 1).unwrap_err();
    assert!(err.contains("Custom(6003)"), "{err}");
}

#[test]
fn a_day_past_the_end_of_the_run_is_refused() {
    let (mut env, user) = a_run(2);
    set_time(&mut env.svm, day_start(FIRST, 14) + 1);
    let err = record(&mut env, &user, 14).unwrap_err();
    assert!(err.contains("Custom(6002)"), "{err}");
}

#[test]
fn the_seventieth_day_of_a_ten_shell_run_still_fits() {
    let mut env = setup(shell_start(FIRST) + 60);
    let user = new_user(&mut env.svm, 50 * USDC);
    enter(&mut env, &user, 10, 10 * USDC).unwrap();

    record_days(&mut env, &user, FIRST, &[69]);

    assert_eq!(run_state(&env.svm, &user.pubkey()).days, 1u128 << 69);
}

#[test]
fn the_hash_is_never_looked_at() {
    let (mut env, user) = a_run(1);
    set_time(&mut env.svm, day_start(FIRST, 0) + 1);
    let ix = record_day_ix(&user.pubkey(), 0, [0u8; 32]);
    let payer = env.payer.insecure_clone();
    send(&mut env.svm, ix, &[&payer, &user]).unwrap();
}

#[test]
fn somebody_elses_run_cannot_be_recorded() {
    let (mut env, user) = a_run(1);
    let stranger = new_user(&mut env.svm, 50 * USDC);

    // The stranger signs as `user` but points the instruction at the real run.
    let ix = Instruction::new_with_bytes(
        coldshell::id(),
        &coldshell::instruction::RecordDay { day: 0, hash: [1u8; 32] }.data(),
        coldshell::accounts::RecordDay {
            user: stranger.pubkey(),
            run: run_pda(&user.pubkey()),
        }
        .to_account_metas(None),
    );
    set_time(&mut env.svm, day_start(FIRST, 0) + 1);
    let payer = env.payer.insecure_clone();
    assert!(send(&mut env.svm, ix, &[&payer, &stranger]).is_err());

    assert_eq!(run_state(&env.svm, &user.pubkey()).days, 0);
}
