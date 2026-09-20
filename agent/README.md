# The coldshell agent

The app, served from your own machine.

```sh
curl -fsSL https://raw.githubusercontent.com/sychchou/coldshell/main/agent/install.sh | sh
```

Then open **http://127.0.0.1:7531**. To remove it, `sh ~/.coldshell/uninstall.sh` — or ask the
app, which offers it once a run is over.

## Why it serves the app instead of answering it

The obvious arrangement is a website that talks to a program on your computer. Chrome does not
allow it: a request from a public page to a local address is gated behind a Local Network Access
permission which, tested in Chrome 153, refuses without ever prompting — no preflight arrives and
no dialog appears, with a user gesture or without one.

Turning it around removes the problem rather than fighting it. The agent serves the app, so the
app is same-origin with it: no permission, no CORS, no mixed content. `http://127.0.0.1` is a
secure context, so the camera, WebCrypto and the file pickers are all there. `/api` is proxied to
the real server exactly as the deployed site proxies it, so the app runs here unmodified.

The same rule that made this necessary also protects it. No other page can reach this port.

## What is here

| | |
|---|---|
| `/` | the app, from `~/.coldshell/app` |
| `/api/*` | proxied to the coldshell server |
| `/agent/health` | whether the agent is running, and its version |
| `/agent/uninstall` | takes itself off the machine, and stops |

Loopback only, and said explicitly: binding to every interface would put somebody's recordings on
their coffee shop's wifi.

## What is not here yet

Clips still go to the server. Keeping them on this machine — encrypted, unreadable to us and
unreadable to their owner until the run finishes — is the point of the agent existing, and it is
the next thing. See [the capsule](../docs/design.md#the-capsule).

This version needs node and npm, and builds the app from source. A release that ships one binary
and a built bundle is what comes after the shape is proven.
