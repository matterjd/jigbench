# HANDOFF — next-session entry point

> **S19 is shipped and 0.2.0 is on npm; the frontier is the next `docs/team/cloud/` prompt in
> sequence — `03-hardening.md` (S20, issue #37), unless Matter has answered #23, in which case
> `04-rulings.md` (S21) goes first.** The plan of record is `docs/ROADMAP.md`, one row per slice
> with a paste-ready cloud prompt beside it; issue #1 carries every sha and CI run id. This repo
> has no AEDL kit (no `.claude/`, no `config/workspace.yml`), so a session launched here has no
> close loop — record the window in matter-notes.

**seat:** Delivery (remote — no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real
`claude` binary; CI is the only gate) · **branch:** `main` · **written:** 2026-09-09 · code at
`ab89f7b` · **S19 is shipped: issue #24's whole list is on `main`, one PR per item, each merged
with both CI legs green at its head. `docs/ROADMAP.md`'s S19 row says so and issue #1 carries
every sha and run id. 0.2.0 is on npm (`a34fd89`, tag `v0.2.0`); nothing new is tagged or
published. The frontier is the next `docs/team/cloud/` prompt in sequence: S20 (issue #37) or
S21 (issue #23's rulings).**

## State

Founded 2026-09-05 from the Design seat's commission (`docs/design/COMMISSION.md`, F1–F22; the
plan is #1, APPROVED with blanket merge for verified green slices). **v0.1.0** shipped, then
Matter's first live test → **AMENDMENT 1** (`docs/design/AMENDMENT-1-the-simplification.md`,
rulings A1–A6, binding): one loop, a Build button that runs `claude -p`, Polish on demand, the
loop-only default view, the artifact is a Prompt; any app with a dev server (A5); setup happens
in the app (A6). **v0.2.0 shipped 2026-09-08 19:09 CDT** — `jigbench@0.2.0` on npm, tag `v0.2.0`
→ `a34fd89`, GitHub release with the tarball.

**On `main` at `ab89f7b` — the record with shas, PRs and CI run ids is issue #1.** Everything the
last baton listed at `a34fd89`, plus **S19 · issue #24, eleven PRs**, each merged with both legs
green at its head, in #24's own order:

| # | on main | PR | PR head · run |
|---|---|---|---|
| ANSI escapes out of the app's own log | `365ebef` | #41 | `bf1cfd4` · 34296047881 |
| win32 hidden/system folders at a drive root | `7405c5f` | #42 | `711faed` · 34296911806 |
| the two 404s before a clamp | `0850cee` | #43 | `d3ce7c5` · 34298494551 |
| `--plate-port` (and `--host`) on the Clamp path | `fe2edbe` | #44 | `53ce0ce` · 34298940429 |
| unclamp cancels before it drains; a generation per bench | `b9c50b5` | #46 | `7135abf` · 34299515323 |
| `--version` asserted in `scripts/npx-control.sh` | `5f75945` | #47 | `3e1dc4b` · 34300222042 |
| the status line before a clamp | `2a62399` | #48 | `8fcf62b` · 34301075396 |
| the empty-bench frame | `7b7d781` | #49 | `7f20461` · 34301618521 |
| the `util._extend` deprecation | `29deacb` | #50 | `0c4cf76` · 34302052427 |
| wording and stale citations | `c5646a2` | #51 | `19b435a` · 34302457741 |
| the `write EPIPE` (**issue #1**, not #24) | `ab89f7b` | #52 | `c8ca6d3` · 34302896828 |

Plus **#45** (`fcf2bab`, head `57f5070` · run 34297512800), which root-caused main's one red push
run of the round — `365ebef`, windows-latest, `src/mcp/server.test.ts:84` — the same day, as its
own PR: the shop heartbeat is written fire-and-forget from `oninitialized`, and `vi.waitFor`'s
default one-second budget has to cover `atomicWriteFile`'s own ~570 ms of transient-error backoff
on a loaded runner. Test-only: an explicit 10 s wait and a 20 s test timeout, the shape
`orders/service.test.ts`, `watcher.test.ts` and PR #34 already use. Third of that class after
`3939bc0`→#32 and `dece0fc`→#34. **Every push run on `main` in this round was green apart from
that one.**

**One of #24's items needed no PR.** It cites `prompts/store.ts:109-110` and `:121-125` as still
carrying check-then-read windows, and `mcp/prompt-tools.ts:97` as starting the store unawaited.
Read at this head, PR #27 (`4228cb9`) had already closed all three — `readdirOrEmpty` sits behind
every listing the store makes, and `prompt-tools.ts:103` has the `.catch`; `store.enoent.test.ts`
and `prompt-tools.test.ts:173` cover both. The citation predates that merge. Ticked, no code moved.

**Two things worth knowing before you touch this code again.**
- **Node exposes neither win32 file attribute.** `fs.Stats` has no `flags` field with or without
  `bigint`, and `fs.Dirent` carries only the entry type. `fs/win32-hidden.ts` therefore runs one
  `attrib /d <dir>\*` per listing and parses it, **failing open** on every error — hiding a repo
  the human is reaching for is the worse and quieter failure. Its parse half is pure and tested on
  every platform, because the route-level test can only run on windows-latest.
- **`http-proxy@1.18.1` is unmaintained** (no release since 2020) and is where the `util._extend`
  DEP0060 warning comes from. `packages/cli/src/quiet-deprecations.ts` drops that one code by
  wrapping the public `process.emitWarning`; everything else still prints through Node's own path.
  A real upgrade means swapping the library under `plate/proxy.ts` — which carries #35's Host
  gate, `selfHandleResponse`, the interceptors and the ws upgrade — and is its own slice.

**The plan of record:** `docs/ROADMAP.md`, one row per slice, each with a goal, acceptance,
depends-on, size, tier (green = a cloud session may merge on green CI; amber = the PR waits for
the lead; ruling = Matter decides first) and the file name of its cloud prompt under
`docs/team/cloud/`; read that folder's README first. R0 (publish 0.2.0) and **S19** are shipped.
Next in sequence: **S20** issue #37, the hardening items (amber — two touch the Host and Origin
gates) → **S21** issue #23, the three rulings (ruling — Matter answers first) → v0.3, the stacks
(S22 React/Next/Vite, S23 Vue/Svelte, S24 Expo web, S25 server-rendered, S26 OpenAPI) → v0.3, the
loop deepens (S27 a real before, S28 the stream and the logbook, S29 refine and build again,
S30 the MCP door) → v0.4.

**Debt:** **#23** the three rulings Matter owes (Advanced routes on the host path; "Open" vs "go
to the bench"; #8 vs AMENDMENT-1 §3) · **#37** the eight hardening items · older: #2 pdf-parse
native · #3 trial-fit e2e flake · #4 esbuild advisory · #5 karma qs · #6 work-order log on
round-trip. Seen once in CI and never root-caused: `plate/proxy.test.ts` *lets an interceptor
short-circuit the proxy entirely* on ubuntu (run 34174031120 attempt 1 — a fetch to `localhost`
landing on `::1` at another test's port; green on the re-run). **#24 is closed.**

**Rules of record:** a slice is a branch (`delegate/build-sN` or `fix/<slug>`), test-first with the
red line quoted in the commit body, `git commit -s`, a PR in the worker-report shape, both CI legs
green at the PR head, then a merge commit (a `Signed-off-by:` trailer in its message) — never
rewrite pushed history; record every merge on #1 with the sha and the run id. A red push run on
main is root-caused the same day, as its own PR, and "flake" is not a root cause. Every server test
runs with `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's
fake `claude` on PATH. Never edit `examples/` source, `QUALITY.md` or `docs/quality/`; no real
`claude -p`, `npm link` or `claude mcp add` in tests; publish, tags and visibility are Matter's.
**A remote seat has no browser and no Windows desk: it never claims a live UI walkthrough.**

**Matter owes the desk:** the three rulings in #23 (S21 cannot start without them) · **the retest
of the published 0.2.0** per `docs/TEST-RUN.md` at 1440×900 and 1280×720 — the Ready hold, the
saved prompt's `## Context` naming the component and its file (#19), **Start the app** from the
checklist drawer (#20), **Polish** beside Ready with Ollama running on the Clamp-screen path (#21)
— which is what S18 exists to fix; delete `wo/0003-days-overdue`; start the Ollama tray app before
the demo (or `JIG_NO_MODEL=1`). **Worth an eye on the desk this round:** the plate now really does
bind 4601 on the Clamp path (#44), the status line reads `Claude · nothing clamped` before a clamp
(#48), and the folder browser at `C:\` should show no `$Recycle.Bin`, `$WINDOWS.~BT`,
`System Volume Information` or `Recovery` (#42) — the last of those is the one fix on this list
that only a Windows machine can really judge.

**→ Next session: take the next `docs/team/cloud/` prompt in sequence — `03-hardening.md` (S20,
issue #37) unless Matter has answered #23, in which case `04-rulings.md` (S21) goes first — paste
it into a fresh Opus cloud session, and let CI be the gate.**
