# Security Policy

## Reporting a vulnerability

Report a vulnerability through GitHub's private vulnerability reporting on this repo: open the
"Security" tab, then "Report a vulnerability". Do not open a public issue for a security problem.

We will acknowledge a report and work with you on a fix before any public disclosure.

## Scope

Jig runs locally. A few things are worth knowing if you are looking for security issues:

- **The proxy rewrites HTML.** Jig's local proxy sits in front of the target app's dev server and
  rewrites HTML responses to inject the loupe script. It handles `Content-Security-Policy` and
  `X-Frame-Options` selectively — only where needed to let the plate render the app — rather than
  stripping them outright.
- **Both ports answer only to their own Host.** Every `/api/*` request and the WebSocket must
  carry a `Host` that names the bench itself — `localhost`, `127.0.0.1`, `[::1]`, or the `--host`
  it was started with (a wildcard bind accepts any IP-literal Host, never a DNS name) — and a
  browser's `Origin`, when present, must match it. That is the defence against DNS rebinding; a
  request with no `Origin` on an allowed Host is a local non-browser client (curl, an MCP client).
  The **plate proxy listens on its own port** and applies the same Host allowlist to every
  request and every WebSocket upgrade, before any interceptor and before the target is
  contacted — otherwise a rebound page would reach your running app through Jig, and the
  proxy's own `Host` rewrite would hide the attacker's name from the dev server's check too.
  Paths handed to the folder browser or to clamp are refused when they name a UNC share.
- **The MCP server is stdio-only and local.** Jig does not expose MCP over a network transport. An
  agent talks to it over stdio, on the machine that launched it.
- **Writes are confined to `.jig/` in the clamped repo.** Jig never writes outside the repo it is
  pointed at, and never edits application source.
- **Network calls are limited to three things:** the local target app you clamped, a local Ollama
  instance if one is running, and an optional one-time model download the first time you run Jig.
  Nothing else leaves the machine, and nothing leaves it at all unless you connect an agent.
