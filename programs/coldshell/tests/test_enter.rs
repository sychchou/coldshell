mod common;

use {
    anchor_lang::prelude::Pubkey,
    coldshell::constants::{DAY_SECONDS, MAX_STAKE, MIN_STAKE, SHELL_EPOCH_TS, WEEK_SECONDS},
    common::*,
    solana_signer::Signer,
};

fn start(shell: u32) -> i64 {
    shell_start(shell) + 60
}

#[test]
fn enter_locks_the_stake() {
    let mut env = setup(start(5));
    let user = new_user(&mut env.svm, 50 * USDC);

    enter(&mut env, &user, 3, 30 * USDC).unwrap();

    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())), 20 * USDC);
    assert_eq!(token_amount(&env.svm, &vault(&user.pubkey())), 30 * USDC);

    let run = run_state(&env.svm, &user.pubkey());
    assert_eq!(run.user, user.pubkey());
    assert_eq!(run.first_shell, 6); // paid in shell 5, runs from 6
    assert_eq!(run.shells, 3);
    assert_eq!(run.stake, 30 * USDC);
    assert_eq!(run.days, 0);
    assert_eq!(run.claimed, 0);
    assert_eq!(run.swept, 0);
    assert_eq!(run.started_at, start(5));
}

#[test]
fn a_participant_needs_no_sol() {
    let mut env = setup(start(1));
    let user = new_user(&mut env.svm, 10 * USDC);
    assert_eq!(env.svm.get_balance(&user.pubkey()).unwrap_or(0), 0);

    enter(&mut env, &user, 1, 10 * USDC).unwrap();

    assert_eq!(env.svm.get_balance(&user.pubkey()).unwrap_or(0), 0);
}

/// A run always begins in the next shell. The week already under way cannot be joined at any
/// point in it, including the moment it starts: it would be selling somebody a week they had
/// already lost part of.
#[test]
fn a_run_always_begins_in_the_next_shell() {
    let cases: [(&str, i64); 5] = [
        ("monday 00:00", 0),
        ("monday 23:59", DAY_SECONDS - 1),
        ("tuesday 00:00", DAY_SECONDS),
        ("saturday", 5 * DAY_SECONDS),
        ("sunday 23:59", WEEK_SECONDS - 1),
    ];
    for (name, offset) in cases {
        let mut env = setup(shell_start(20) + offset);
        let user = new_user(&mut env.svm, 10 * USDC);
        enter(&mut env, &user, 1, 10 * USDC).unwrap();
        assert_eq!(run_state(&env.svm, &user.pubkey()).first_shell, 21, "{name}");
    }
}

/// And the first day of that shell is not recordable the moment the stake is placed — a run
/// bought on a tuesday waits nearly a week before there is anything to do.
#[test]
fn nothing_can_be_recorded_until_the_run_starts() {
    let mut env = setup(shell_start(20) + DAY_SECONDS);
    let user = new_user(&mut env.svm, 10 * USDC);
    enter(&mut env, &user, 1, 10 * USDC).unwrap();

    let err = record(&mut env, &user, 0).unwrap_err();
    assert!(err.contains("Custom(6003)"), "{err}");
}

#[test]
fn a_stake_under_ten_dollars_is_refused() {
    let mut env = setup(start(1));
    let user = new_user(&mut env.svm, 50 * USDC);
    let err = enter(&mut env, &user, 1, MIN_STAKE - 1).unwrap_err();
    assert!(err.contains("Custom(6001)"), "{err}");
}

#[test]
fn a_stake_over_two_hundred_dollars_is_refused() {
    let mut env = setup(start(1));
    let user = new_user(&mut env.svm, 500 * USDC);
    let err = enter(&mut env, &user, 1, MAX_STAKE + 1).unwrap_err();
    assert!(err.contains("Custom(6001)"), "{err}");
}

#[test]
fn a_run_is_one_to_ten_shells() {
    for shells in [0u8, 11] {
        let mut env = setup(start(1));
        let user = new_user(&mut env.svm, 50 * USDC);
        let err = enter(&mut env, &user, shells, 10 * USDC).unwrap_err();
        assert!(err.contains("Custom(6000)"), "{shells}: {err}");
    }
}

#[test]
fn ten_shells_is_allowed() {
    let mut env = setup(start(1));
    let user = new_user(&mut env.svm, 50 * USDC);
    enter(&mut env, &user, 10, 10 * USDC).unwrap();
    assert_eq!(run_state(&env.svm, &user.pubkey()).shells, 10);
}

#[test]
fn a_second_run_while_one_is_open_is_refused() {
    let mut env = setup(start(1));
    let user = new_user(&mut env.svm, 50 * USDC);
    enter(&mut env, &user, 1, 10 * USDC).unwrap();
    assert!(enter(&mut env, &user, 1, 10 * USDC).is_err());
}

#[test]
fn entering_without_the_money_leaves_nothing_behind() {
    let mut env = setup(start(1));
    let user = new_user(&mut env.svm, 5 * USDC);
    assert!(enter(&mut env, &user, 1, 10 * USDC).is_err());
    assert!(env.svm.get_account(&run_pda(&user.pubkey())).is_none());
    assert!(env.svm.get_account(&vault(&user.pubkey())).is_none());
}

#[test]
fn a_run_cannot_start_before_the_first_shell() {
    let mut env = setup(SHELL_EPOCH_TS - 1);
    let user = new_user(&mut env.svm, 50 * USDC);
    assert!(enter(&mut env, &user, 1, 10 * USDC).is_err());
    let _: Pubkey = run_pda(&user.pubkey());
}
