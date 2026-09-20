#!/bin/sh
# coldshell agent installer.
#
#   curl -fsSL https://raw.githubusercontent.com/sychchou/coldshell/main/agent/install.sh | sh
#
# A binary installed from a terminal is not quarantined, so none of this needs notarising — the
# signing fees are the price of a double-click installer, not of the software.
#
# This build runs the agent on node and builds the app from source, so it needs node and npm. A
# release that ships a single binary and a built bundle is the next version of this file; what
# this one is for is proving the shape works end to end on a real machine.

set -eu

REPO="https://github.com/sychchou/coldshell"
HOME_DIR="${COLDSHELL_HOME:-$HOME/.coldshell}"
PORT="${COLDSHELL_PORT:-7531}"

say() { printf '  %s\n' "$*"; }
die() { printf '\n  %s\n\n' "$*" >&2; exit 1; }

printf '\n  coldshell agent\n\n'

command -v node >/dev/null 2>&1 || die "node is not installed — https://nodejs.org"
command -v npm  >/dev/null 2>&1 || die "npm is not installed"
command -v git  >/dev/null 2>&1 || die "git is not installed"

case "$(node -v)" in
  v2[0-9].*|v[3-9][0-9].*) ;;
  *) die "node 20 or newer is needed; this is $(node -v)" ;;
esac

# ffmpeg joins the film. Not fatal yet, because nothing joins anything in this version.
command -v ffmpeg >/dev/null 2>&1 || say "note: ffmpeg is not installed — the film cannot be joined without it"

if [ -f "$HOME_DIR/agent/coldshell-agent.mjs" ]; then
  say "already installed at $HOME_DIR — updating"
  sh "$HOME_DIR/stop.sh" 2>/dev/null || true
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM

say "fetching"
git clone --depth 1 --quiet "$REPO" "$WORK/src"

# The bundle is built here, so the cluster has to be said here too. Without these the app is
# built pointing at a local validator that nobody running this has, and the only sign is a word
# in the title bar.
NETWORK="${COLDSHELL_NETWORK:-devnet}"
RPC="${COLDSHELL_RPC:-https://api.devnet.solana.com}"

say "building the app for $NETWORK — this takes a minute"
# Quiet unless it fails, and then loud: a wall of build output says nothing to somebody who only
# wanted to install a thing, and says everything when the thing did not install.
(
  cd "$WORK/src/app" \
    && npm ci --silent --no-audit --no-fund \
    && VITE_SOLANA_NETWORK="$NETWORK" VITE_RPC_URL="$RPC" npm run build
) >"$WORK/build.log" 2>&1 || { cat "$WORK/build.log" >&2; die "the app would not build"; }

mkdir -p "$HOME_DIR/agent"
rm -rf "$HOME_DIR/app"
cp "$WORK/src/agent/coldshell-agent.mjs" "$HOME_DIR/agent/"
cp -R "$WORK/src/app/dist" "$HOME_DIR/app"

cat > "$HOME_DIR/start.sh" <<EOF
#!/bin/sh
COLDSHELL_PORT=$PORT exec node "$HOME_DIR/agent/coldshell-agent.mjs"
EOF

cat > "$HOME_DIR/stop.sh" <<EOF
#!/bin/sh
pkill -f 'coldshell-agent.mjs' 2>/dev/null || true
EOF

# Uninstalling is a first-class thing here, not a support article. The app offers it when the run
# is over, and this is the same door from the other side.
cat > "$HOME_DIR/uninstall.sh" <<EOF
#!/bin/sh
pkill -f 'coldshell-agent.mjs' 2>/dev/null || true
rm -rf "$HOME_DIR"
printf '\n  coldshell is gone, and so is everything it was keeping.\n\n'
EOF

chmod +x "$HOME_DIR"/*.sh

say "starting"
sh "$HOME_DIR/stop.sh"
( sh "$HOME_DIR/start.sh" >"$HOME_DIR/log" 2>&1 & )

i=0
while [ $i -lt 40 ]; do
  if curl -fsS "http://127.0.0.1:$PORT/agent/health" >/dev/null 2>&1; then
    printf '\n  ready — http://127.0.0.1:%s\n' "$PORT"
    printf '  to remove it:   sh %s/uninstall.sh\n\n' "$HOME_DIR"
    command -v open >/dev/null 2>&1 && open "http://127.0.0.1:$PORT" 2>/dev/null || true
    exit 0
  fi
  i=$((i + 1))
  sleep 0.25
done

die "the agent did not come up — see $HOME_DIR/log"
