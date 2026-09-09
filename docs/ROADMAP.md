# ROADMAP: 0.2.0 out the door, then v0.3

The plan of record after 0.2.0. Two rules from `docs/design/AMENDMENT-1-the-simplification.md` §6
(A5) hold over every row: **the loop never depends on a survey adapter, and adapters only enrich**.
Where no adapter matches, the survey says so honestly and the loop still runs: the plate proxies the
dev server and Point names by DOM path and tag. The tongue (`docs/design/COMMISSION.md` §3 as
amended by AMENDMENT 1 §3) and the floor do not change. What 0.2.0 shipped is in `CHANGELOG.md`.

**One row is one slice and one session**, and each names a prompt file under `docs/team/cloud/`,
ready to paste into a new cloud session on this repo. Read `docs/team/cloud/README.md` first.
**Tier:** `green` a cloud session may merge its own PR once both CI legs are green at the PR head;
`amber` the PR waits for the lead's review; `ruling` Matter decides before anything is built.
**Size:** `S` one sitting, `M` a session, `L` a session and a fix pass.

## 0 · Release 0.2.0

### R0 · release 0.2.0 · Matter's hands only
**S · ruling · after nothing (both gates are on `main`) · prompt** `00-release-0-2-0.md` (a desk runbook, not a paste block)

**Goal.** `jigbench@0.2.0` on npm, tagged, released, and retested on this desk. **Why now.** Every
row below assumes a published 0.2.0 and a retest that says what still bites.

```bash
npm run build:release && npm run pack:release && bash scripts/npx-control.sh "$(pwd)/jigbench-0.2.0.tgz"
cd packages/cli && npm publish --access public
gh release create v0.2.0 ./jigbench-0.2.0.tgz --title "Jig v0.2.0 — one loop" --notes-file CHANGELOG.md
```

**Acceptance.**
- `scripts/npx-control.sh` green on the 0.2.0 tarball (packed README and LICENSE identical to the
  root files, neither copy tracked, `--version` right).
- The npm page for `jigbench@0.2.0` shows the readme.
- The `v0.2.0` tag and the GitHub release carry the tarball.
- The desk retest per `docs/TEST-RUN.md` at 1440x900 and 1280x720 is run, every defect filed.

## 1 · v0.2.1, the retest fixes

### S18 · what the retest files
**M · amber (the list is unknown until the retest runs) · after R0 · prompt** `01-retest-fixes.md`

**Goal.** Fix what the desk retest of the published 0.2.0 finds, one PR per item. **Why now.** The
retest is the first drive of the shipped package, so its list is the truest defect list Jig has.

**Acceptance.**
- Every item the retest files has an issue and a PR that names it.
- Each PR is test-first, with the red line quoted in the commit body.
- `CHANGELOG.md`'s Unreleased section names each fix in one line.

### S19 · issue #24, the small fixes
**M · green · after R0 · prompt** `02-small-fixes.md`

**Goal.** Close #24's list, one PR each. **Why now.** Eleven small defects sit in the first ten
minutes of using Jig. **The list:** raw ANSI escapes in the app's own log; hidden and system folders
at a drive root in the folder browser; the two 404s the bench logs before a clamp; `--plate-port`
ignored on the Clamp path; unclamp waiting on an in-flight build; the two remaining read windows in
`prompts/store.ts` and the unawaited store start in `mcp/prompt-tools.ts`; `cli/src/version.test.ts`
skipped in CI; the status line saying "not installed" before a clamp; the empty bench shown for a
frame; the `util._extend` deprecation on stderr; the wording and stale citations in `ClampScreen`,
`FolderBrowser`, `SetupSteps` and `CONTRIBUTING.md`. Plus the `write EPIPE` from `build/runner.ts`
recorded on issue #1 under #35.

**Acceptance.**
- One PR per item, each red-first, or a note in the PR saying what was checked by hand instead.
- `README.md` and `docs/TEST-RUN.md` name plate port 4601 only if `--plate-port` is honoured on the
  Clamp path.
- #24 closes with every box ticked, or the leftovers refiled as their own issues.

### S20 · issue #37, the hardening items
**M · amber (two items touch the Host and Origin gates) · after R0 · prompt** `03-hardening.md`

**Goal.** Close #37's eight items. **Why now.** They came out of the fix-round verification, none
blocking, each small, and two of them sit on the gates that hold the publish. **The list:**
`SECURITY.md:21` overstates the Origin gate (both gates skip Origin on GET, HEAD and OPTIONS), so
enforce it or correct the sentence; bound `port` to an integer 1 to 65535 in `POST /api/target/start`
and `/api/clamp`; route the survey-hint tier of `target/detect.ts` through `packageJsonScriptNames`;
charset-check accepted script names on win32; realpath before stat in `fs/route.ts` and
`bench/validate-clamp-path.ts`; give `build/git-diff.ts` the runner's timeout; narrow the ENOENT
guard in `prompts/store.ts` to the read; close the five named test gaps.

**Acceptance.**
- One PR per item, or one per pair where the tests share a fixture, each red-first.
- The Origin item ends with `SECURITY.md` and the code saying the same thing.
- Each of the five test gaps closes with a test that fails if the fix it covers is reverted.

### S21 · issue #23, the three rulings
**S · ruling · after R0 · prompt** `04-rulings.md`

**Goal.** Get Matter's three answers, then write them into the docs and the build. **Why now.** One
of the three makes a `docs/TEST-RUN.md` step impossible to pass.

1. **Advanced on the Clamp path.** `bench/host.ts` does not mount toolpath, orders or trialfit,
   while the Advanced drawer still renders the Toolpath panel. Mount the three (the stores exist),
   or hide the panels in words there and cut the TEST-RUN step, or say Advanced needs `--repo`.
2. **The step into the bench.** AMENDMENT 1 §7 and `docs/team/v0.2/REMOTE-KICKOFF.md` use "Open",
   the build says "go to the bench", the tongue bans "open". Ratify the build and amend the two doc
   lines, or change the build.
3. **The before controls.** #8 closed by removing them, while AMENDMENT 1 §3 and §4 and
   `docs/team/v0.2/CHASSIS.md` still rule them on. Annotate the amendment (they return with S27),
   or reopen #8 and build it now.

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

**Goal.** Components and files for Vue and Svelte repos. **Why now.** The loupe already names Vue
components at runtime, so the survey side is the half that is missing.

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
