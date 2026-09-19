#!/usr/bin/env bash
# Builds and deploys the program to devnet, then refreshes the IDL the app and server read.
set -euo pipefail
cd "$(dirname "$0")/.."

# Prefer the Helius endpoint if HELIUS_API_KEY is in server/.env
if [ -f server/.env ]; then
  # shellcheck disable=SC1090
  source <(grep -E '^HELIUS_API_KEY=' server/.env || true)
fi
RPC="${DEVNET_RPC:-}"
if [ -z "$RPC" ] && [ -n "${HELIUS_API_KEY:-}" ]; then
  RPC="https://devnet.helius-rpc.com/?api-key=$HELIUS_API_KEY"
fi
RPC="${RPC:-https://api.devnet.solana.com}"

WALLET="${SOLANA_WALLET:-$HOME/.config/solana/id.json}"
BALANCE=$(solana balance -u "$RPC" -k "$WALLET" | awk '{print $1}')
echo "deployer $(solana address -k "$WALLET") has $BALANCE SOL on devnet"
awk -v b="$BALANCE" 'BEGIN { if (b < 4.5) { print "need ~4.5 SOL to deploy (2.2 stays locked, the rest comes back)"; exit 1 } }'

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
DAY=$(python3 -c "import json;d=json.load(open('target/idl/coldshell.json'));print([c['value'] for c in d['constants'] if c['name']=='DAY_SECONDS'][0])")
echo "deployed with DAY_SECONDS=$DAY. IDL copied into app/src/idl — commit it so the server and site match."
