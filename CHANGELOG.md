# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project does not yet follow
semantic versioning strictly (pre-1.0).

## [Unreleased]

Issue #24 — the small defects the first ten minutes of using Jig turn up, one PR each.

- **the app's own log is clean** — `target/runner.ts` strips ANSI escapes (colour, the window
  title an OSC sequence sets, cursor moves) before it broadcasts `target-log` and before the ring
  buffer, so a dev server that believes it owns a TTY no longer shows `[33m❯[39m Building...`
  in the Clamp screen or in the logbook drawer.
- **unclamp no longer waits out a build** — the host cancels an in-flight `claude -p` build
  before it drains, so unclamp and re-clamp return at once instead of blocking for up to the
  build's 30-minute cap with the cancel route already unmounted. A generation counter on every
  bench keeps a late target-up, and a clamp the human overtook, out of the bench that came
  after; `TargetRunner` no longer reports a target `stop()` already let go of as up.
- **the folder browser hides what Windows hides** — `fs/route.ts` honours the hidden and system
  attributes on win32 (one `attrib` per listing, parsed; fail open on any error), so
  `$Recycle.Bin`, `$WINDOWS.~BT`, `System Volume Information` and `Recovery` no longer sit at a
  drive root beside the repos. None of them starts with a dot, which is all the old filter knew.

## [0.2.0] - 2026-09-07

The simplification — `docs/design/AMENDMENT-1-the-simplification.md` (rulings A1–A6, Matter,
2026-09-06/07), after the first live test of 0.1.0: *"very cluttered but I love all the tooling
… I mainly want to select sections, write out a requirement from a PM, it saves that as a
serviceable prompt, we kick that prompt off."* One loop, one button, one command.

- **S11 · Prompt + Build runner** (A1, A2, A4) — the artifact is a **Prompt**
  (`.jig/prompts/NNNN-<slug>.md`, states draft → ready → building → built, plus scrapped; the
  file is the prompt Claude receives, verbatim). **Build** runs `claude -p` itself in the clamped
  repo (`POST /api/prompts/:id/build`), streams its work over the bench WebSocket, records the
  transcript and the files touched, marks the prompt *built*; cancel; **Polish** on demand (Ollama,
  nothing fires by itself; no model → no button). Existing work orders migrate to prompts on first
  start. MCP tools renamed `jig_prompts` / `jig_prompt` / `jig_mark_built` with the old names kept
  as aliases; `jigbench build` and `jigbench prompts` on the CLI.
- **S12 · the quiet bench** (A3; concept D · The Quiet Bench, ruled CHASSIS as is) — the loop only,
  by default: rail **Point · Sketch · Hand**; the app clean on the plate; the **prompt card**
  anchored beside the selection (never over it) with *what should change here?*, acceptance,
  Polish, **Ready** (the one held gesture, ~800 ms), **Build**; right column **Prompts · Inspect ·
  Design system**; one status line (*Claude · idle / building · 00:42 · editing … / built · 3
  files · 1m 12s*) that opens the logbook. Rulers and guides, the SIM strip, fixtures, toolpath,
  the mirror, MCP status, the spine and the scrap bin live behind one **Advanced** switch — kept,
  not deleted.
- **S13 · sketch that snaps** — real snapping on the sheet: the 4px grid, then other elements'
  edges and centres within 6px, with an alignment line per held axis and the coordinates said in
  words; *build this screen* makes a sketch a prompt target.
- **S14 · retest fixes** — six chassis defects and retest items 22/23/5/18 from the first live
  test (the properties pane scrolls; the tray bounded; Hand disengages the loupe; the repo root
  prefers the clamped `.jig/`; `init` writes an explicit `--repo`; a self-contained
  `implement-work-order` prompt; model + elapsed persisted; fixtures fill Angular's reactive forms).
- **S16 · any app with a dev server** (A5) — `@jigbench/adapter-web`: any repo with a
  `package.json` or a stylesheet gets CSS/SCSS/Less gauges, a dev-server guess, honest framework
  hints, and components/routes marked *unknown* rather than invented; the loupe names components
  at runtime Angular → React → Vue; nested workspaces (`apps/*`, `packages/*`) are found; `--target`
  is inferred from the survey.
- **S17 · setup happens in the app** (A6) — one terminal command, ever: `npx jigbench`. With no
  repo clamped the bench opens on the **Clamp** screen: recent benches (one click re-clamps), a
  folder browser or a pasted path, the survey shown as it runs (stack, components, routes,
  endpoints, gauges, the dev-server guess), **Start the app** (the detected dev script, its log
  streamed) or a pasted URL, **Docs**, **Register with Claude Code** (`.mcp.json` — what it will
  say first, then written; the Claude Desktop entry likewise), then the bench. A setup checklist
  is one click from the status line on every bench. Server side: one re-clampable Bench per repo
  root (`POST /api/clamp` / `/api/unclamp`), `GET /api/fs/*`, `POST /api/target/{start,stop,url}`
  with `target-log` over the WebSocket, `GET /api/setup`, `POST /api/setup/{mcp,desktop}`,
  `POST /api/docs/clamp`; recent benches under `~/.jig/recent.json`. The loop's routes ride on the
  clamped bench, so the Clamp screen leads straight into Point → Build.
- **Debt folded** — #7 the bench imports the Prompt model from `@jigbench/core` (the S12 mirror is
  gone; `BuildStreamEvent`, `ClaudeStatus`, `TargetState`, `RecentBenchEntry` and the host's
  `BenchState` live in core); #9 the logbook drawer is fed by the build stream and the target's
  own log (filters human · Claude · bench · app; Esc closes).
- **The 0.2.0 review, before publish** — #17 `POST /api/target/start` runs only a script the
  clamped repo's own `package.json` names (cmd.exe re-parses its command line on Windows; the
  request picks a name, never supplies one); #18 the bench answers only to its own Host
  (`localhost`, `127.0.0.1`, `[::1]`, or the `--host` it was started with) against DNS
  rebinding, and UNC paths are refused before any filesystem call; #22 the `jigbench` tarball
  carries `README.md` and `LICENSE` (0.1.0 shipped neither, so the npm page showed no readme)
  and a description in the amended tongue, both asserted by `scripts/npx-control.sh`.
- **The 0.2.0 review, before the retest** — #19 the survey reaches the loupe on the Clamp-screen
  path (posted again on the plate's `load` and in answer to the loupe's `jig:ready`), the survey's
  component name wins over Angular's dev-build `_Name` (kept as `componentClass`), and the prompt's
  Context matches the decorated name last; #20 the setup checklist one click from the status line
  can **Start the app** (`GET /api/setup` says what it would run); #21 **Polish** appears on the
  Clamp-screen path too — the bench probes the local model at clamp and wires the drafter.
- **The fix-round review, before publish** — #35 the **plate proxy** answers only to its own
  Host as well: the same allowlist #18 put on the bench, applied to every request and every
  WebSocket upgrade on the plate's own port, before any interceptor and before the target is
  contacted. Until now that port gated nothing, so a rebound page reached the running app
  through Jig — and the proxy's `changeOrigin` Host rewrite hid the attacker's name from the
  dev server's own check on the way. The trial-fit mirror is a second plate and is gated with it.
  #36 the `packages/cli` `README.md` and `LICENSE` copies are **build artifacts** — untracked
  now, so the ignore lines #22 added actually bite. Both were still tracked, which made every
  release build dirty the tree and meant a publish from a clean checkout would have shipped the
  committed README (frozen before #18) rather than the root one. `scripts/npx-control.sh` now
  also fails if either copy is committed again or if the packed `README.md`/`LICENSE` differ
  from the root files by a byte, and `release.yml` runs that control before it uploads a tarball.
- **Docs** — `docs/TEST-RUN.md` rewritten for the loop (one `npx jigbench`, the Clamp screen,
  Point → requirement → Polish → hold Ready → Build → Built, the Advanced tour, your
  own repo); `docs/ROADMAP.md` (AMENDMENT §6: the stacks after 0.2.0); README and `docs/USING.md`
  in the amended tongue.

Publishing to npm (`jigbench@0.2.0`, Matter's one-time password), the `v0.2.0` tag and the GitHub
release are Matter's own explicit calls, made by hand after this version — not part of this entry.

## [0.1.0] - 2026-09-06

The Tuesday cut — `docs/EXECUTION-PLAN.md`'s full slice table, S1 through S10. One line per
slice:

- **S1 · shell** — the npm-workspaces monorepo; `@jigbench/core`'s pure survey/work-order/gauges/
  fixture/toolpath types; `@jigbench/server`'s HTTP/WS boot and stderr-only logger; the
  `jigbench` CLI (`jigbench`, `mcp`, `init`, `survey`); the bench's chassis-neutral shell; the
  `examples/ledger-angular` + `examples/ledger-api` fixture apps.
- **S2 · survey** — `@jigbench/adapter-angular` (ts-morph over `@Component`, routes, SCSS/CSS
  gauges) and `@jigbench/adapter-dotnet` (OpenAPI fetch first, a regex-lite C# fallback that
  badges itself as a stub).
- **S2b · docs clamp** — `jigbench clamp --docs <folder>` reads markdown/text/PDF into
  `.jig/survey/docs.json`, heading-chunked with file+line provenance; the drafter ranks chunks
  by keyword overlap with the mark.
- **S3 · plate** — the reverse proxy in front of a target app's own dev server: HTML rewrite
  injects the loupe script, WebSocket/HMR pass-through, selective `CSP`/`X-Frame-Options`
  handling that reports what it changed.
- **S4 · gauges** — the Gauges panel (colour · type · space · radius · shadow · motion · z),
  two-way lit with the plate; the component list with instance counts.
- **S5 · marks → work orders** — the `Drafter` seam (Ollama → a connected agent → a human,
  always something); the human face; release as an ~800ms hold; the shop face filled from the
  survey on release; the work-order ladder, logbook, and scrap bin.
- **S6 · MCP** — `jigbench mcp` on stdio (MCP SDK v1): `jig_survey`, `jig_gauges`,
  `jig_work_orders`, `jig_work_order`, `jig_fixture`, `jig_draft`, `jig_claim`, `jig_report`;
  `jigbench init` writes `.mcp.json`; `jigbench mcp install --claude-desktop` writes the Desktop
  config entry, diff-first.
- **S7 · fixtures** — seeded test data from the survey's schemas (`json-schema-faker` +
  `@faker-js/faker`), applied by the proxy answering `/api/*` and the loupe filling forms.
- **S8 · trial fit + toolpath** — recorded click/input toolpaths, replayable; the trial fit's
  before/after mirror once the shop reports a work order done.
- **S9 · sketch** — a plate mode for a screen that doesn't exist yet, drawn with the gauges,
  saved under `.jig/sketches/`.
- **S10 · ship** — `packages/cli` bundles `@jigbench/core`/`server`/both adapters into one
  publishable `jigbench` package (third-party deps external); `npm run build:release` +
  `npm run pack:release` produce a clean tarball (verified: `npx --yes ./jigbench-0.1.0.tgz`
  survey/init/serve/mcp all green in a clean directory outside this repo); CI on Windows +
  Ubuntu (typecheck, tests, build, the stdout-purity guard, the packed-tarball npx control, a
  DCO check on pull requests) and a manual `release.yml` that builds and uploads the tarball as
  an artifact, never publishing; README/CONTRIBUTING/MAP/`docs/USING.md` brought back in line
  with what the shipped commands actually do.

Publishing to npm and flipping this repo public are Matter's own explicit calls, made by hand
after this version — not part of this changelog entry.
