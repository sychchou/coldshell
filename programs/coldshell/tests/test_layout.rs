//! The shape of a `Run` on the wire.
//!
//! `app/src/lib/runs.ts` reads these bytes by hand rather than through an Anchor client, so a
//! field moving here would silently mis-read every run on the staff page. This pins it.

use {
    anchor_lang::{prelude::Pubkey, AccountSerialize, Discriminator, Space},
    coldshell::state::Run,
};

fn bytes() -> Vec<u8> {
    let run = Run {
        user: Pubkey::new_from_array([9u8; 32]),
        first_shell: 0x1122_3344,
        shells: 7,
        stake: 0x0102_0304_0506_0708,
        days: 0x0f0e_0d0c_0b0a_0908_0706_0504_0302_0100,
        claimed: 0xaabb,
        swept: 0xccdd,
        started_at: 0x1122_3344_5566_7788,
        utc_offset: -321,
        bump: 254,
    };
    let mut out = Vec::new();
    run.try_serialize(&mut out).unwrap();
    out
}

#[test]
fn a_run_is_eighty_four_bytes() {
    assert_eq!(8 + Run::INIT_SPACE, 84);
    assert_eq!(bytes().len(), 84);
}

#[test]
fn every_field_is_where_the_app_looks_for_it() {
    let b = bytes();
    let u16_at = |i: usize| u16::from_le_bytes(b[i..i + 2].try_into().unwrap());
    let u32_at = |i: usize| u32::from_le_bytes(b[i..i + 4].try_into().unwrap());
    let u64_at = |i: usize| u64::from_le_bytes(b[i..i + 8].try_into().unwrap());

    assert_eq!(&b[0..8], Run::DISCRIMINATOR);
    assert_eq!(&b[8..40], [9u8; 32]);
    assert_eq!(u32_at(40), 0x1122_3344);
    assert_eq!(b[44], 7);
    assert_eq!(u64_at(45), 0x0102_0304_0506_0708);
    assert_eq!(u128::from_le_bytes(b[53..69].try_into().unwrap()), 0x0f0e_0d0c_0b0a_0908_0706_0504_0302_0100);
    assert_eq!(u16_at(69), 0xaabb);
    assert_eq!(u16_at(71), 0xccdd);
    assert_eq!(i64::from_le_bytes(b[73..81].try_into().unwrap()), 0x1122_3344_5566_7788);
    assert_eq!(i16::from_le_bytes(b[81..83].try_into().unwrap()), -321);
    assert_eq!(b[83], 254);
}
