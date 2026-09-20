#!/usr/bin/env bash
# Builds and deploys the program to devnet, then refreshes the IDL the app and server read.
set -euo pipefail
cd "$(dirname "$0")/.."

# Prefer the Helius endpoint if HELIUS_API_KEY is in server/.env
if [ -f server/.env ]; then
  # shellcheck disable=SC1090
  # A stray space after the `=` makes a url with %20 in the key, and a 401 that says nothing
  # about where it came from.
  source <(grep -E '^HELIUS_API_KEY=' server/.env | sed -E 's/^([A-Z_]+)=[[:space:]]*(.*[^[:space:]])[[:space:]]*$/\1=\2/' || true)
fi
RPC="${DEVNET_RPC:-}"
if [ -z "$RPC" ] && [ -n "${HELIUS_API_KEY:-}" ]; then
  RPC="https://devnet.helius-rpc.com/?api-key=$HELIUS_API_KEY"
fi
RPC="${RPC:-https://api.devnet.solana.com}"

WALLET="${SOLANA_WALLET:-$HOME/.config/solana/id.json}"
BALANCE=$(solana balance -u "$RPC" -k "$WALLET" | awk '{print $1}')
echo "deployer $(solana address -k "$WALLET") has $BALANCE SOL on devnet"

# A first deploy has to buy the program account outright. An upgrade only rents a buffer the
# same size, and gets it back when the swap lands — so the two need very different balances and
# one floor for both would either block upgrades or wave through a deploy that cannot finish.
PROGRAM=$(python3 -c "import json;print(json.load(open('target/idl/coldshell.json'))['address'])")
if solana program show "$PROGRAM" -u "$RPC" >/dev/null 2>&1; then
  FLOOR=2.5
  echo "upgrading $PROGRAM"
else
  FLOOR=4.5
  echo "first deploy of $PROGRAM"
fi
awk -v b="$BALANCE" -v f="$FLOOR" 'BEGIN { if (b < f) { printf "need ~%s SOL for this one\n", f; exit 1 } }'

# COLDSHELL_FEATURES=short-clock shrinks a day to ten minutes so a whole run fits in an hour.
# The feature reaches the IDL as well as the binary, which is what keeps the screen honest —
# but a deployed program is one clock or the other, with no switch afterwards.
FEATURES="${COLDSHELL_FEATURES:-}"
if [ -n "$FEATURES" ]; then
  NO_DNA=1 anchor build -- --features "$FEATURES"
else
  NO_DNA=1 anchor build
fi

solana program deploy target/deploy/coldshell.so \
  --program-id target/deploy/coldshell-keypair.json \
  -u "$RPC" -k "$WALLET"

# Sweeping and closing both pay into the treasury's own USDC account, so it has to exist.
TREASURY=$(python3 -c "import json;d=json.load(open('target/idl/coldshell.json'));print([c['value'] for c in d['constants'] if c['name']=='TREASURY'][0])")
MINT=$(python3 -c "import json;d=json.load(open('target/idl/coldshell.json'));print([c['value'] for c in d['constants'] if c['name']=='USDC_MINT'][0])")
spl-token create-account "$MINT" --owner "$TREASURY" --fee-payer "$WALLET" -u "$RPC" 2>/dev/null \
  || echo "treasury usdc account already exists"

cp target/idl/coldshell.json target/types/coldshell.ts app/src/idl/
# The server assembles its own instructions, so it needs the same discriminators and constants.
cp target/idl/coldshell.json server/src/idl/

# A constant the program stopped exporting breaks nothing until the site is opened, where it
# breaks everything. This is the moment to find out.
node scripts/check-idl.mjs
DAY=$(python3 -c "import json;d=json.load(open('target/idl/coldshell.json'));print([c['value'] for c in d['constants'] if c['name']=='DAY_SECONDS'][0])")
echo "deployed with DAY_SECONDS=$DAY. IDL copied into app/src/idl — commit it so the server and site match."
