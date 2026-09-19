#!/usr/bin/env bash
# A local validator with the short clock and a board worth looking at.
#
# `enter` takes its first shell from the chain's clock, so a live validator can only ever hold
# runs that start now — and a staff page with one unfinished week on it shows nothing about how
# the staff page reads. This writes the runs straight into the ledger instead: one finished,
# one forfeited, one already collected, one halfway through.
#
# It swaps app/src/idl for the short-clock build. `git checkout app/src/idl` puts it back.
set -euo pipefail
cd "$(dirname "$0")/.."

NO_DNA=1 anchor build -- --features short-clock
cp target/idl/coldshell.json target/types/coldshell.ts app/src/idl/

FLAGS=$(node app/scripts/seed-fixtures.mjs)

pkill -f solana-test-validator || true
sleep 1
rm -rf .ledger

# shellcheck disable=SC2086
exec solana-test-validator --reset --ledger .ledger \
  --bpf-program "$(python3 -c "import json;print(json.load(open('target/idl/coldshell.json'))['address'])")" target/deploy/coldshell.so \
  --account 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU scripts/fixtures/usdc-mint.json \
  $FLAGS
