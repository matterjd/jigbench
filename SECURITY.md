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
- **The MCP server is stdio-only and local.** Jig does not expose MCP over a network transport. An
  agent talks to it over stdio, on the machine that launched it.
- **Writes are confined to `.jig/` in the clamped repo.** Jig never writes outside the repo it is
  pointed at, and never edits application source.
- **Network calls are limited to three things:** the local target app you clamped, a local Ollama
  instance if one is running, and an optional one-time model download the first time you run Jig.
  Nothing else leaves the machine, and nothing leaves it at all unless you connect an agent.
