# ROADMAP: 0.2.0 out the door, then v0.3

The plan of record after 0.2.0. Two rules from `docs/design/AMENDMENT-1-the-simplification.md` §6
(A5) hold over every row: **the loop never depends on a survey adapter, and adapters only enrich**.
Where no adapter matches, the survey says so honestly and the loop still runs: the plate proxies the
dev server and Point names by DOM path and tag. The tongue (`docs/design/COMMISSION.md` §3 as
amended by AMENDMENT 1 §3) and the floor do not change. What 0.2.0 shipped is in `CHANGELOG.md`.

**One row is one slice and one session**, and each names a prompt file under `docs/team/cloud/`,
ready to paste into a new cloud session; read its README first. **Tier:** `green` a session merges
its own PR once both CI legs are green at the PR head; `amber` the PR waits for the lead; `ruling`
Matter decides first. **Size:** `S` one sitting, `M` a session, `L` a session and a fix pass.

## 0 · Release 0.2.0

### R0 · release 0.2.0 · Matter's hands only · SHIPPED 2026-09-08 19:09 CDT (jigbench@0.2.0 on npm, tag v0.2.0 → a34fd89, GitHub release with the tarball)
**S · ruling · after nothing (both gates are on `main`) · prompt** `00-release-0-2-0.md` (a desk runbook, not a paste block)

**Goal.** `jigbench@0.2.0` on npm, tagged, released, and retested on this desk. **Why now.** Every
row below assumes a published 0.2.0 and a retest that says what still bites.

```bash
npm ci --no-audit --no-fund   # after any pull of main, before the release build
npm run build:release && npm run pack:release && bash scripts/npx-control.sh "$(pwd)/jigbench-0.2.0.tgz"
cd packages/cli && npm login && npm publish --access public
```

**Two lessons from the first attempt**, in full in `00-release-0-2-0.md`. Skip the `npm ci` after a
pull and a stale `node_modules` has no `@jigbench/adapter-web` workspace, so the server build dies
with `Cannot find module '@jigbench/adapter-web'`. And `404 Not Found - PUT
https://registry.npmjs.org/jigbench` on publish means the npm token has expired: `npm login` first,
then publish. The one-time password prompt is Matter's alone; once he confirms `+ jigbench@0.2.0` an
Opus session may tag, cut the GitHub release and run the `npx` registry check, recorded on issue #1.

**Acceptance.**
- `scripts/npx-control.sh` green on the 0.2.0 tarball: README and LICENSE packed and identical to
  the root files, neither copy tracked, `--version` right.
- The npm page for `jigbench@0.2.0` shows the readme; `npx --yes jigbench@0.2.0 --version` answers.
- The `v0.2.0` tag and the GitHub release carry the tarball.
- The desk retest per `docs/TEST-RUN.md` at 1440x900 and 1280x720 is run, every defect filed.

## 1 · v0.2.1, the retest fixes

### S18 · what the retest files · SHIPPED 2026-09-12 (unreleased on main: #61 `c9df97a`, #60 `2c83f3f`, #59 `5bced66`; #58 open until the desk holds Ready; harness #64)
**M · amber (the list is unknown until the retest runs) · after R0 · prompt** `01-retest-fixes.md`

**Goal.** Fix what the desk retest of the published 0.2.0 finds, one PR per item. **Why now.** The
retest is the first drive of the shipped package, so its list is the truest defect list Jig has.

**The retest filed three** (2026-09-12, label `retest-0.2.0`), all in `packages/bench`, one PR each,
each with both CI legs green at its PR head. **Amber, so none is merged — the lead merges.**

| # | what it was | PR | PR head · run |
|---|---|---|---|
| #56 typed text black on the dark card | two control rules set a house ground and no ink; a browser inherits neither `color` nor `font` into a form control | #59 | `fcc230c` · 34711356021 |
| #57 the page scrolled, not the panel | a bare `1fr` cannot be shorter than its content, and the right column's `overflow: hidden` was never the scroll container it looked like | #60 | `f65d4ad` · 34711623331 |
| #58 holding Ready did nothing | `useReadyHold`'s completion callback was frozen at the render where Ready first lit — the first keystroke, while `POST /api/prompts` was still in flight | #61 | `be05dae` · 34711954812 (attempt 2) |

**#61's windows leg was red on attempt 1 and it was not #61's.** `build/runner.test.ts:220` —
`expected [] to include 'new-file.txt'` — in `packages/server`, which that diff does not touch.
Root-caused, not re-run and forgotten: the test bets a fixed 500 ms sleep outlasts
`BuildRunner.start()`'s before-snapshot, which spawns two git subprocesses, and on a loaded
runner it does not, so the file lands *inside* the before-snapshot and the diff is empty.
Reproduced deterministically here by shrinking that sleep to 0, and a patch needing no sleeps at
all verified green — filed as **#62** with both, since it is outside this set. The one re-run
then passed (107 s against attempt 1's 140 s).

None share a root cause. **#56 and #57 share a why, and it is the one thing this slice leaves
behind:** both are contracts only a real browser can judge, and there is no browser anywhere in
this repo — no Playwright, no Puppeteer, no e2e harness, and none on either CI leg. (The
"headless-Chromium harness" #58's text points at does not exist; `http.trialfit` is a plain Node
HTTP test.) So both are pinned by source-contract tests in `floor-*.test.ts`'s idiom, with
detector controls, and `docs/TEST-RUN.md` carries the desk steps that prove the rendering. A
browser harness for the bench is worth its own slice; it has deliberately not been filed here.

**Acceptance.** All three met: an issue and a PR per item, each red-first with the red line quoted
in the commit body, and `CHANGELOG.md`'s Unreleased section naming each fix in one line. The
version this ships in goes in this row when the lead merges.

### S19 · issue #24, the small fixes · SHIPPED 2026-09-09 (main at `ab89f7b`; record on issue #1)
**M · green · after R0 · prompt** `02-small-fixes.md`

**Goal.** Close #24's list, one PR each. **Why now.** Eleven small defects sat in the first ten
minutes of using Jig.

**Shipped.** Eleven PRs, each merged with both CI legs green at its head, in #24's own order:
#41 ANSI in the app's own log · #42 the win32 hidden/system attributes · #43 the pre-clamp 404s ·
#44 `--plate-port` and `--host` on the Clamp path · #46 unclamp cancels before it drains (plus a
generation counter per bench, and `TargetRunner` no longer reporting a target `stop()` let go of
as up) · #47 `--version` in `scripts/npx-control.sh` · #48 the status line before a clamp ·
#49 the empty-bench frame · #50 the `util._extend` deprecation · #51 wording and stale citations ·
#52 the `write EPIPE` (from issue #1, not #24). One item needed no PR: #24's ENOENT windows and
the unawaited MCP store were already closed by PR #27 (`4228cb9`) — the citation predates it.
main's one red push run, at `365ebef`, was root-caused the same day as its own PR (#45).

**Acceptance.** All three met: one PR per item, each red-first with the red line quoted;
`README.md` and `docs/TEST-RUN.md` name 4601 and #44 makes it true on that path; #24 closed with
every box ticked and nothing refiled.

### S20 · issue #37, the hardening items
**M · amber (two items touch the Host and Origin gates) · after R0 · prompt** `03-hardening.md`

**Goal.** Close #37's eight items. **Why now.** They came out of the fix-round verification, none
blocking, each small, and two of them sit on the gates that hold the publish: `SECURITY.md:21`
overstates the Origin gate (both gates skip Origin on GET, HEAD and OPTIONS); `port` unbounded on
`POST /api/target/start` and `/api/clamp`; the survey-hint tier of `target/detect.ts`; a win32
charset check on script names; realpath before stat in `fs/route.ts` and
`bench/validate-clamp-path.ts`; the runner's timeout on `build/git-diff.ts`; the ENOENT guard in
`prompts/store.ts`; five named test gaps. `03-hardening.md` carries each in full.

**Acceptance.**
- One PR per item, or one per pair where the tests share a fixture, each red-first.
- The Origin item ends with `SECURITY.md` and the code saying the same thing.
- Each of the five test gaps closes with a test that fails if the fix it covers is reverted.

### S21 · issue #23, the three rulings
**S · ruling · after R0 · prompt** `04-rulings.md`

**Goal.** Get Matter's three answers, then write them into the docs and the build. **Why now.** One
of the three makes a `docs/TEST-RUN.md` step impossible to pass.

1. **Advanced on the Clamp path.** `bench/host.ts` does not mount toolpath, orders or trialfit while
   the Advanced drawer still renders the Toolpath panel. Mount the three (the stores exist), hide
   the panels in words there and cut the TEST-RUN step, or say Advanced needs `--repo`.
2. **The step into the bench.** AMENDMENT 1 §7 and `docs/team/v0.2/REMOTE-KICKOFF.md` use "Open",
   the build says "go to the bench", the tongue bans "open". Ratify the build and amend the two doc
   lines, or change the build.
3. **The before controls.** #8 closed by removing them, while AMENDMENT 1 §3 and §4 and
   `docs/team/v0.2/CHASSIS.md` still rule them on. Annotate it (S27 returns them) or build #8 now.

**Acceptance.**
- The session prints the three questions and their options on #23 and builds nothing.
- Once Matter answers, the ruled words land in the docs and the code they name, one PR per ruling.
- `floor-*.test.ts` and `tongue.test.ts` stay green.

## 2 · v0.3, the next stacks

Straight from AMENDMENT 1 §6. Each adapter is one workspace package registered in
`packages/server/src/survey/registry.ts` above `web` (web stays last, deliberately), with fixtures
in its own `src/__fixtures__/`, never under `examples/`.

### S22 · the React, Next and Vite adapter
**L · amber (a new package and a new boundary) · after R0 · prompt** `05-adapter-react.md`

**Goal.** An adapter that names React components with their files, reads routes from React Router
and the Next app dir, and adds Tailwind tokens to the gauges. **Why now.** Matter's other apps are
Tauri with React and Angular, so this is the adapter that makes Jig useful on his own bench.

**Acceptance.**
- The adapter detects a React, Next or Vite repo and returns components with name and file.
- Routes appear from a React Router config and from a Next app dir.
- Gauges appear from Tailwind v3 (`resolveConfig`) and v4 (`@theme` blocks).
- `detect()` is false on an Angular fixture, so the Angular adapter still wins there.

### S23 · Vue and Svelte
**L · green · after S22 · prompt** `06-adapter-vue-svelte.md`

**Goal.** Components and files for Vue and Svelte repos. **Why now.** Point already names Vue
components (the plate's runtime resolver), so the survey side is the half that is missing.

**Acceptance.**
- Vue components carry name and file, from the adapter's own fixtures.
- Svelte components carry name and file from the compiler's metadata.
- Where the metadata is absent the survey says unknown, and Point still names by tag and DOM path.

### S24 · Expo web
**M · green · after S22 · prompt** `07-adapter-expo-web.md`

**Goal.** An Expo app on the plate through its web dev server. **Why now.** The plate needs a dev
server, and Expo web is the one Expo already gives.

**Acceptance.**
- The dev-server guess finds Expo's web command from `package.json`.
- Components resolve through the same React path S22 builds.
- README and `docs/USING.md` say plainly that this is Expo web, not a native device.

### S25 · server-rendered stacks
**L · green · after S22 · prompt** `08-adapter-server-rendered.md`

**Goal.** Blazor and Razor, Rails, Django and PHP, by file scan plus the web adapter. **Why now.**
These are the apps with no client component tree at all, so they prove the honest path end to end.

**Acceptance.**
- Templates and partials are found by file scan for each of the four, from fixtures.
- Routes come from the framework's own table where one exists, and are unknown where not.
- No invented component name reaches the prompt: Point names by tag and DOM path.

### S26 · APIs beyond .NET
**M · green · after R0 · prompt** `09-adapter-openapi.md`

**Goal.** Any API with an OpenAPI document, framework-neutral. **Why now.** The .NET adapter's
`openapi-file`, `openapi-live`, `regex-stub` ladder is already the pattern, and lifting it off .NET
costs less than a second stack adapter.

**Acceptance.**
- An OpenAPI or Swagger document in the repo produces endpoints and schemas with no .NET present.
- With no document the survey badges itself a stub, exactly as the .NET fallback does.
- The .NET adapter keeps its behaviour on the `examples/ledger-api` fixture.

## 3 · v0.3, the loop deepens

### S27 · a real before for a built Prompt
**M · amber · after S21 (ruling 3) · prompt** `10-a-real-before.md`

**Goal.** A Prompt held at Ready keeps a snapshot, and the mirror under Advanced shows it beside the
app after the build. **Why now.** #8 closed by removing a switch that did nothing; the before itself
was never built.

**Acceptance.**
- Holding Ready takes a snapshot keyed by prompt id.
- The mirror under Advanced shows that snapshot beside the built app.
- With no snapshot the mirror says so in words, shows no empty frame, and blocks no build.

### S28 · the build stream and the logbook
**M · green · after R0 · prompt** `11-stream-and-logbook.md`

**Goal.** The status line reads `building · 00:42 · editing …` from the real stream, and the logbook
drawer filters what it holds. **Why now.** Both exist already; the reading is what is missing.

**Acceptance.**
- The status line shows elapsed time and the file being edited, from the build stream.
- The drawer filters human, Claude, bench and app, and Esc closes it.
- A cancelled build reads as cancelled, never as built.

### S29 · refine and build again
**M · amber · after S28 · prompt** `12-refine-and-build-again.md`

**Goal.** Refine a built Prompt, Build again, and see the second build's diff against the first.
**Why now.** This is the half of Matter's loop that 0.2.0 does not close: look at it, refine, go
again.

**Acceptance.**
- A built Prompt can go back to draft with its history kept, not lost.
- A second build records its own files touched and its own transcript.
- The bench shows the second build's diff against the first, not against the original tree.
- A prompt file round-trips through the store with its log intact (this absorbs #6).

### S30 · the MCP door for Claude Desktop
**M · amber · after R0 · prompt** `13-mcp-door.md`

**Goal.** `jig_prompts`, `jig_prompt` and `jig_mark_built` proven against a real client, and the
`.mcp.json` command proven on Windows. **Why now.** MCP is the secondary door (A1) and has never
been driven by a client other than the repo's own tests.

**Acceptance.**
- An integration test drives the three tools over stdio and asserts what a client would see.
- A test reads the written `.mcp.json` and asserts the command shape works on Windows.
- `jigbench mcp install --claude-desktop` still shows its diff first.
- What the session could not do live is added to `docs/TEST-RUN.md` as a desk step.

## 4 · v0.4, ideas to rule on, not commitments

Nothing here is planned. Each row is a question, and each prompt's first step is to ask, not build.

| id | Idea | The question | Size | Tier | Prompt |
|---|---|---|---|---|---|
| I1 | multi-bench | Two repos clamped at once, front end and API on one bench. Is one bench per repo the boundary, or one bench per product? | L | ruling | `14-multi-bench.md` |
| I2 | a hosted bench for a team | A bench reached over the network. This is the thing "not planned" says no to, so it needs Matter's word before a line is written. | L | ruling | `15-hosted-bench.md` |
| I3 | the Sketch sheet as a real design surface | Sketch snaps, and a sketch can be a prompt target. Should it become a place you design, or stay a place you point at? | M | ruling | `16-sketch-surface.md` |
| I4 | Jig inside command-center | Jig as a hull in Matter's own harness UI rather than its own browser tab. What is the seam? | M | ruling | `17-jig-in-command-center.md` |

## What is not planned

Cloud, accounts, telemetry, editing application source, a light theme, a Tauri wrapper, a
`node-llama-cpp` driver, rrweb. Unchanged from `docs/EXECUTION-PLAN.md` §7. Row I2 is that list's
standing exception in question form, and stays a question until Matter rules on it.

## Debt carried forward (open issues)

| # | Debt | Absorbed by |
|---|---|---|
| #23 | the three rulings Matter owes | S21 |
| #24 | the small fixes from the 0.2.0 review and the walkthrough | S19 |
| #37 | the hardening items from the fix round | S20 |
| #3 | the trial-fit e2e flakes under load | S20, the same test-hardening pass |
| #6 | the legacy log does not survive a re-read, so a migrated prompt's elapsed timer freezes | S29, the slice that re-reads a prompt after a build |
| #2 | `pdf-parse` pulls a native transitive dependency | no slice yet. The issue lists the options; the cheap one (PDF optional, said plainly in the clamp summary) is ruled when a locked-down machine actually blocks it |
| #4 | esbuild advisory inside tsup, build time only | no slice yet. Revisited at the next release build |
| #5 | karma `qs` advisory in the Angular example | no slice yet. `examples/` source is off limits to sessions, so this one is the desk's |
