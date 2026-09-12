# HANDOFF — next-session entry point

> **S18 is built but NOT merged: three PRs — #59, #60, #61 — are open on `main`, each green on
> both CI legs at its head, and this slice is amber, so the lead merges them.** They close the
> whole 0.2.0 desk-retest set (#56, #57, #58), including the defect that stopped the retest at
> `docs/TEST-RUN.md` step 15. Nothing else is in flight. Once they land, the frontier is the next
> `docs/team/cloud/` prompt in sequence — `03-hardening.md` (S20, issue #37), unless Matter has
> answered #23, in which case `04-rulings.md` (S21) goes first. The plan of record is
> `docs/ROADMAP.md`, one row per slice with a paste-ready cloud prompt beside it; issue #1 carries
> every sha and CI run id. **This repo is AEDL-provisioned (2026-09-09):** the guards run here
> (`bash .claude/hooks/preflight-check.sh` → "Enforcement will run") and `bash scripts/qa-gate.sh`
> is the fast set. `SUBAGENT-AUTHORIZATION.md` is unsigned, so delegation grants nothing until
> Matter signs one.

**seat:** Delivery (remote — no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real
`claude` binary; CI is the only gate) · **branch:** `main` · **written:** 2026-09-12 · code at
`dd72b2f` · **S18 is built and waiting: three PRs open, all green on both legs, none merged
because this slice is amber. `docs/ROADMAP.md`'s S18 row and issue #1 carry the heads and run
ids. Nothing was tagged or published; 0.2.0 remains the last release.**

## State

Founded 2026-09-05 from the Design seat's commission (`docs/design/COMMISSION.md`, F1–F22; the
plan is #1, APPROVED with blanket merge for verified green slices). **v0.1.0** shipped, then
Matter's first live test → **AMENDMENT 1** (`docs/design/AMENDMENT-1-the-simplification.md`,
rulings A1–A6, binding): one loop, a Build button that runs `claude -p`, Polish on demand, the
loop-only default view, the artifact is a Prompt; any app with a dev server (A5); setup happens
in the app (A6). **v0.2.0 shipped 2026-09-08 19:09 CDT** — `jigbench@0.2.0` on npm, tag `v0.2.0`
→ `a34fd89`, GitHub release with the tarball. **S19** (issue #24, eleven PRs) landed 2026-09-09;
`main` then took the AEDL provisioning merge and is at **`dd72b2f`**.

**Matter drove the published 0.2.0 on his desk on 2026-09-12** and filed one issue per defect —
three, label `retest-0.2.0`, on issue #1 as the S18 set. His verdict on the whole: *"I love the
direction and it seems fairly intuitive so far."* He stopped at step 15.

### S18 — open, green, and the lead's to merge

| # | on main | PR | PR head · run | both legs |
|---|---|---|---|---|
| #56 typed text black on the dark prompt card | **not merged** | [#59](https://github.com/matterjd/jigbench/pull/59) | `fcc230c` · 34711356021 | ✅ |
| #57 the page scrolled instead of the tab panel | **not merged** | [#60](https://github.com/matterjd/jigbench/pull/60) | `f65d4ad` · 34711623331 | ✅ |
| #58 holding Ready did not make the draft ready | **not merged** | [#61](https://github.com/matterjd/jigbench/pull/61) | `be05dae` · 34711954812 (attempt 2) | ✅ |

**#61's windows leg was red on attempt 1, and it was not #61's — see #62.**
`packages/server/src/build/runner.test.ts:220`, `expected [] to include 'new-file.txt'`, in a
package that diff does not touch. Root-caused rather than re-run and forgotten: the test bets a
fixed 500 ms sleep outlasts `BuildRunner.start()`'s own before-snapshot (`runner.ts:207`), which
spawns **two** git subprocesses; on a loaded runner it does not, the file lands *inside* the
before-snapshot, and `filesTouchedBetween` is empty. Reproduced deterministically on this seat by
shrinking that one sleep to 0 — the identical message — and a patch that needs **no sleeps at
all** verified green (the fixture's existing `FAKE_CLAUDE_STDIN_OUT` knob makes the child write
the file, which `runner.ts`'s own sequence orders for free). Both are in **#62**; it was not
fixed inside #61 because it is outside S18's set. The one re-run then passed, at 107 s against
attempt 1's 140 s. **Fourth Windows-timing failure of this general class on the record** after
`3939bc0`→#32, `dece0fc`→#34 and `365ebef`→#45 — and this test's own trailing comment records
being fixed once already, by raising its timeout, which cures a slow test but not a racing one.

All three are `packages/bench` only, test-first with the red line in the commit body, one
`CHANGELOG.md` Unreleased line each, and a `docs/TEST-RUN.md` desk step where CI cannot judge.
They are independent — different files, no shared root cause — so they merge in any order.

**What each actually was.**

- **#56** — a browser inherits neither `color` nor `font` into a form control: `input`,
  `textarea` and `select` start from the UA's own `fieldtext` ink and font, not from the page.
  Read across every control rule in the bench, exactly **two** set a house ground and no ink, and
  both are on the card the loop is driven from: `.jig-prompt-card textarea` and
  `.jig-prompt-card__acc-list input`. (The textarea set no `font-family` either, so it drew in
  the UA's monospace.) A third, not reported: `.jig-sketch-properties__field` had a rule for its
  `select` alone. One reset in `index.css` beside the `button` reset — **bare type selectors, no
  `!important`, and no `background`**: ink and font are safe for every control, a ground is not
  (two of the bench's inputs are real checkboxes).
- **#57** — two mechanisms. A bare `1fr` is `minmax(auto, 1fr)`, whose minimum is the content's
  own min-content size, so `.jig-chassis`'s bench row could not be shorter than what was in it
  and `.jig-chassis__bench` had no row track at all (one implicit `auto` row sized to the tallest
  region's max-content); a long Design system list therefore grew the grid past the bench row and
  `.jig-chassis`'s `overflow: auto` turned it into a page scrollbar. And
  `.jig-right-column`'s `overflow: hidden` was never the scroll container it looked like —
  clipping does not stop a panel's content contributing its full height to the track above. The
  active tab panel is the scroll container now, and **the column needs `height: 100%`** or it is
  a block box of `height: auto` inside a stretched grid item and bounding the row above buys
  nothing. That line is not in the issue and the fix does not work without it.
- **#58** — **not a pointer problem.** `useReadyHold`'s `start` was `useCallback(..., [enabled])`,
  so the `onComplete` its 800 ms timer would call was captured at the render where `enabled` last
  changed — in the real card, the **first keystroke**: `App.tsx:208` lights the card at `'draft'`
  from the words alone, deliberately, while `prompts.create()` is still in flight, so the
  captured callback is `onReadyComplete={() => matchedPrompt && …}` (`App.tsx:316`) with
  `matchedPrompt === null`. The create answered, `enabled` never changed again, `useCallback`
  never recomputed, and the timer fired a frozen no-op. The ring filled and nothing was sent —
  which is also why there was no "let go early" message (it **completed**, it did not cancel) and
  why scrap still worked. `start` and `cancel` hold no props now; every option is read through a
  ref at call time, so a create answering *mid-press* is still the callback that fires.
  `setPointerCapture` and the narrowed blur rule went in too, since the issue requires both and
  neither existed.

### Two things worth knowing before you touch this code again

- **There is no browser anywhere in this repo.** No Playwright, no Puppeteer, no Chromium, and
  none installed on either CI leg. **#58's text asks for a test in "the repo's headless-Chromium
  harness (the one `http.trialfit` uses)" — that harness does not exist**;
  `packages/server/src/orders/http.trialfit.test.ts` boots a Node HTTP server and talks to it
  with `fetch`. It did not matter for #58 (that defect is logic, and it is red in jsdom), but it
  is why #56 and #57 are pinned by **source-contract tests** — `floor-control-ink.test.ts` and
  `floor-viewport-scroll.test.ts`, in `floor-colour-literals.test.ts`'s idiom, each with detector
  controls — rather than by `getComputedStyle` or a scroll measurement. **Both of those would be
  green before their fix**: bench's vitest runs jsdom with CSS loading off, jsdom ships no UA
  stylesheet giving a `textarea` `fieldtext`, and jsdom runs no layout engine, so every box
  measures 0. A test that cannot fail is worse than no test, so the rendering is proved by the
  desk steps in `docs/TEST-RUN.md` (14, 15 and 18) instead. **A browser harness for the bench is
  worth its own slice and has deliberately not been filed** — the S18 brief says not to widen the
  set. If the lead wants it, that is a new issue.
- **jsdom implements neither `setPointerCapture` nor `releasePointerCapture`** (checked directly:
  both `undefined` on an element). So #58's capture half is proven against a stub carrying the
  surface a real button has, never a real DOM event, and step 15 is what proves it on a pointer.

Still true from the last baton: **Node exposes neither win32 file attribute**, so
`fs/win32-hidden.ts` runs one `attrib /d <dir>\*` per listing and **fails open**; and
**`http-proxy@1.18.1` is unmaintained** and is where DEP0060 comes from, silenced in
`packages/cli/src/quiet-deprecations.ts` rather than upgraded (a real upgrade means swapping the
library under `plate/proxy.ts`, which carries #35's Host gate, and is its own slice).

**One consequence of #57 worth an eye:** with `.jig-chassis` now `overflow: hidden`, a window
shorter than the centre's own floor (`minmax(400px, 1fr)` plate + the 264px Advanced drawer +
the 28px status line = 692px) **clips** where it used to scroll. Both measured viewports have
room (1280×720 leaves exactly 692px), and that floor is ruled by CHASSIS and pinned by its own
test, so it was not changed — but a short laptop window is where it would show.

**One residual named in #61 rather than quietly widened:** holding Ready *while the create is
still in flight* — press and hold in the few ms between the first keystroke and the POST
answering — still completes into `matchedPrompt && …` with nothing to send, and says nothing.
The window is nil in practice, and closing it means a change in `App.tsx`, not the hook. One
line if the lead wants it in.

**The plan of record:** `docs/ROADMAP.md`, one row per slice, each with a goal, acceptance,
depends-on, size, tier (green = a cloud session may merge on green CI; amber = the PR waits for
the lead; ruling = Matter decides first) and the file name of its cloud prompt under
`docs/team/cloud/`; read that folder's README first. R0 and **S19** are shipped; **S18 is built
and waiting on the lead**. Next in sequence: **S20** issue #37, the hardening items (amber — two
touch the Host and Origin gates) → **S21** issue #23, the three rulings (ruling — Matter answers
first) → v0.3, the stacks (S22 React/Next/Vite, S23 Vue/Svelte, S24 Expo web, S25 server-rendered,
S26 OpenAPI) → v0.3, the loop deepens (S27 a real before, S28 the stream and the logbook, S29
refine and build again, S30 the MCP door) → v0.4.

**Debt:** **#23** the three rulings Matter owes · **#37** the eight hardening items · **#62** the
git-diff fallback test's race, root-caused with a verified patch in the issue (a natural pair with
**#3**, which the roadmap already routes to S20's test-hardening pass) · **#54** two
tests that fail on the desk and pass in CI (a stray `~/.jig` captures `findRepoRoot` — and the
product question under it: on any machine where a `.jig/` exists in `$HOME`, every `jigbench`
started outside a repo silently clamps to the home directory; plus a `ledger-angular` gauge
usage CI does not see). This seat is Linux with no `~/.jig` and no build output under
`examples/`, so **both of #54's failures pass here** — it really is desk-only. Older: #2
pdf-parse native · #3 trial-fit e2e flake · #4 esbuild advisory · #5 karma qs · #6 the legacy log
does not survive a re-read. Seen once in CI and never root-caused: `plate/proxy.test.ts` letting an
interceptor short-circuit the proxy on ubuntu (run 34174031120 attempt 1; green on the re-run).
**#24 is closed.**

**Rules of record:** a slice is a branch (`delegate/build-sN` or `fix/<slug>`), test-first with the
red line quoted in the commit body, `git commit -s`, a PR in the worker-report shape, both CI legs
green at the PR head, then a merge commit (a `Signed-off-by:` trailer in its message) — never
rewrite pushed history; record every merge on #1 with the sha and the run id. A red push run on
main is root-caused the same day, as its own PR, and "flake" is not a root cause. Every server test
runs with `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's
fake `claude` on PATH. **Run `npm run typecheck` (or `npm run build`) before `npm test` after a
fresh `npm ci`** — without the workspace build, 21 server files fail to resolve
`@jigbench/adapter-web` and the suite is red for a reason that has nothing to do with the change;
CI does the typecheck first for exactly this reason. Never edit `examples/` source, `QUALITY.md` or
`docs/quality/`; no real `claude -p`, `npm link` or `claude mcp add` in tests; publish, tags and
visibility are Matter's. **A remote seat has no browser and no Windows desk: it never claims a live
UI walkthrough.**

**Matter owes the desk:** the three rulings in #23 (S21 cannot start without them) · **a re-run of
`docs/TEST-RUN.md` once #59, #60 and #61 are merged** — steps 14, 15 and 18 carry new lines
written for exactly these three fixes, and all three are things only his browser can judge: **14**
the text you type is light on the dark card, in the bench's sans and not the browser's monospace;
**15** the ring fills from the moment the button goes down, the card says *hold — the ring fills*,
drifting the mouse off the button mid-hold no longer ends it, a tap still says *let go early —
still a draft · N ms of 800*, and a completed hold **actually makes the draft ready** (#58's
shape was: ring fills, nothing happens, no message); **18** at 1440×900 and 1280×720 a long gauge
list scrolls inside the tab panel while the window itself has no scrollbar and the tab strip, rail
and status line stay put. Also still owed from the last baton: delete `wo/0003-days-overdue`, and
start the Ollama tray app before the demo (or `JIG_NO_MODEL=1`). Still only really judgeable on a
Windows desk, from S19: a drive root showing no `$Recycle.Bin`, `$WINDOWS.~BT`,
`System Volume Information` or `Recovery` (#42).

**→ Next session: if #59, #60 and #61 are merged, take the next `docs/team/cloud/` prompt in
sequence — `03-hardening.md` (S20, issue #37) unless Matter has answered #23, in which case
`04-rulings.md` (S21) goes first. If they are still open, they are the frontier: they need the
lead's merge, not more code.**
