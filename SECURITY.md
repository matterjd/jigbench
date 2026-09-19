# Security Policy

## Reporting a vulnerability

Report a vulnerability through GitHub's private vulnerability reporting on this repo: open the
"Security" tab, then "Report a vulnerability". Do not open a public issue for a security problem.

We will acknowledge a report and work with you on a fix before any public disclosure.

## Scope

Jig runs locally. A few things are worth knowing if you are looking for security issues:

- **The proxy rewrites HTML.** Jig's local proxy sits in front of the target app's dev server and
  rewrites HTML responses to inject Jig's own picking script — the one **Point** clicks through
  and **Inspect** reads (`packages/server/src/plate/loupe.js` on disk). It handles
  `Content-Security-Policy` and
  `X-Frame-Options` selectively — only where needed to let the plate render the app — rather than
  stripping them outright.

- **Both ports answer only to their own Host.** Every `/api/*` request and the WebSocket must
  carry a `Host` that names the bench itself — `localhost`, `127.0.0.1`, `[::1]`, or the `--host`
  it was started with (a wildcard bind accepts any IP-literal Host, never a DNS name) — and a
  browser's `Origin`, when present, must match it. Both halves run on every method: a `GET`
  carrying a foreign `Origin` is refused exactly as a `POST` is, rather than being left to the
  browser's own CORS (which stops a foreign page reading the answer, not the request arriving).
  That is the defence against DNS rebinding; a
  request with no `Origin` on an allowed Host is a local non-browser client (curl, an MCP client).
  The **plate proxy listens on its own port** and applies the same Host allowlist to every
  request and every WebSocket upgrade, before any interceptor and before the target is
  contacted — otherwise a rebound page would reach your running app through Jig, and the
  proxy's own `Host` rewrite would hide the attacker's name from the dev server's check too.
  Paths handed to the folder browser or to clamp are refused when they name a UNC share.

- **The folder browser drops a link or a junction child.** `GET /api/fs/list` keeps only the
  children `readdir` reports as real directories, and a symbolic link or an NTFS junction is
  reported as a link rather than a directory — so such a child is never listed, and it cannot be
  browsed to. Treat that as the rule rather than as a gap: the guard judges the folder you asked
  for, not the tree under it, so a listed child that was itself a link would be probed (`.git`,
  `package.json`, `angular.json`, `docs`, `*.csproj`) through a link nothing had judged. A linked
  folder you do want is still reachable by naming its path directly — the path field on the Clamp
  screen, or `?path=` on this route — where the same local-path guard judges it as the folder you
  asked for.

- **A page on another site can still make Jig run a `GET`. It cannot read the answer, and it
  cannot write.** This is the limit of the rule above, and it is worth stating plainly rather
  than leaving to be inferred.

  A browser sends no `Origin` header at all on a request it does not consider a fetch: an
  `<img src>`, a `<script src>`, a `<link>`, an `<iframe>`, or a plain navigation. Such a
  request from `https://evil.example` to `http://localhost:4600/api/state` carries
  `Host: localhost:4600` — the bench's own name, because that is the URL that was used — and no
  `Origin`. Both halves of the gate pass, and **the request runs.** Jig allows an absent
  `Origin` on purpose: `curl`, an MCP client and the CLI itself never send one, and a local
  bench that refused them would be a bench no local tool could talk to.

  So assume any foreign page you have open can cause **any** `/api` `GET` to execute:
  `/api/state` (the whole bench state — the survey, the gauges, the wiring, the target's state,
  every **Point** you have placed and every **prompt** with its text, target file path and
  drafted text (`marks` and `workOrders` are what those two are called on the wire), the clamped
  repo's own path, and on a bench started with no repo the list of recently clamped repo paths),
  `/api/docs` (the clamped docs index), `/api/prompts` and a build's transcript,
  `/api/sketches`, `/api/fixtures`, `/api/toolpaths`, `/api/setup` (which also runs dev-script
  detection), `/api/drafter` (which probes your local Ollama and records whether it answered),
  `/api/plate` (your dev server's URL and port, every header the proxy rewrites, the active
  fixture and the trial-fit mirror's port and status — and it probes the clamped app and the
  mirror on every call), `/api/plate/snapshot/:id` (a stored snapshot's HTML, by id),
  `/api/health`, and `/api/fs/roots` + `/api/fs/list` (folder names anywhere on the disk).

  What such a page **cannot** do:

  - **Read any of it.** The browser gives the response to the tag that asked, not to the page's
    script: an `<img>` cannot parse JSON, and an `<iframe>`'s content is behind the same-origin
    policy. The one API that *would* hand a page the body — `fetch`/`XHR` — sends an `Origin`,
    and a foreign `Origin` is refused with 403 on every method, `GET` included. The request is
    blind.
  - **Write anything.** Every state-changing route is a `POST`, `PUT` or `DELETE`, and the only
    way a page issues one cross-origin without JavaScript is an HTML `<form>` — which cannot set
    `Content-Type: application/json`, the only type the bench parses, and which current browsers
    send an `Origin` with anyway. Nothing that changes a file, clamps a repo, starts the target
    or runs `claude -p` is reachable from a foreign page.
  - **Rebind DNS.** A name the attacker controls is refused by the Host check before `Origin` is
    even read; that is the case the allowlist exists for, and it is a different one from this.

  What it costs is therefore the **work**, not the data: a folder walk, a detection run, a docs
  read, an Ollama probe. That is inherent to a local HTTP server that must also answer
  non-browser clients on the same port. Two of those GETs leave a trace, and both are in-memory
  and self-correcting: `/api/drafter` sets the drafter-wiring status from what its probe just
  observed, and `/api/plate` caches the header-rewrite list from its own probe when the target
  answers, which a later call reports while the target is down. Nothing under `/api` writes a
  file, clamps a repo, starts
  the target or runs an agent on a `GET` — that is the line, and a route that ever needed to
  would need a method other than `GET` instead.

- **The MCP server is stdio-only and local.** Jig does not expose MCP over a network transport. An
  agent talks to it over stdio, on the machine that launched it.

- **Writes are confined to `.jig/` in the clamped repo.** Jig never writes outside the repo it is
  pointed at, and never edits application source.

- **Network calls are limited to three things:** the local target app you clamped, a local Ollama
  instance if one is running, and an optional one-time model download the first time you run Jig.
  Nothing else leaves the machine, and nothing leaves it at all unless you connect an agent.
