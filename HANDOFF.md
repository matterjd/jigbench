# HANDOFF — next-session entry point

> **The 0.2.0 desk retest's SECOND batch (#66 #67 #68 #69) is MERGED.** Five
> PRs — [#82](https://github.com/matterjd/jigbench/pull/82) · [#83](https://github.com/matterjd/jigbench/pull/83) · [#84](https://github.com/matterjd/jigbench/pull/84) · [#85](https://github.com/matterjd/jigbench/pull/85) · [#86](https://github.com/matterjd/jigbench/pull/86) — each test-first with its red line in the
> commit body, all five carried in one integration PR, **[#88](https://github.com/matterjd/jigbench/pull/88)**
> (`int/retest-2`, head `6a29f2e`), **merged to `main` at `7f7d136`** with both CI legs and DCO green.
> GitHub marks the five merged and all four issues closed. **The lead's review blocked #83, #84 and
> #86; a repair round fixed them** (repaired heads `e53231b`, `448b7f0`, `82e6032`) **and a re-review
> of 2026-09-13 cleared all three with follow-ups, filed as
> [#89](https://github.com/matterjd/jigbench/issues/89).** #85 was never one of the four: it
> root-causes a red windows-latest leg that surfaced during the slice (`cli`'s
> `mcp.test.ts` waiting on the shop heartbeat inside vitest's implicit 1 s budget), and it went in
> ahead of #83. Issue #1 carries the merge record. `docs/ROADMAP.md`'s **S18 row now says the second
> batch shipped 2026-09-13**; both batches sit on `main`, unreleased.
> **This repo is AEDL-provisioned (2026-09-09):** the guards run here
> (`bash .claude/hooks/preflight-check.sh` → "Enforcement will run") and `bash scripts/qa-gate.sh` is
> the fast set. `SUBAGENT-AUTHORIZATION.md` is unsigned, so delegation grants nothing until Matter
> signs one.

**seat:** Delivery (remote — no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real
`claude` binary; CI is the only gate) · **branch:** `main` · **written:** 2026-09-14 · main at
`7f7d136` · **the five PRs are merged and the four issues closed; nothing from this batch waits on
the lead. 0.2.0 remains the last release, with S18's two batches and S20 on main, unreleased.**

## State

Founded 2026-09-05 from the Design seat's commission (`docs/design/COMMISSION.md`, F1–F22; the
plan is #1, APPROVED with blanket merge for verified green slices). **v0.1.0** shipped, then
Matter's first live test → **AMENDMENT 1** (`docs/design/AMENDMENT-1-the-simplification.md`,
rulings A1–A6, binding): one loop, a Build button that runs `claude -p`, Polish on demand, the
loop-only default view, the artifact is a Prompt; any app with a dev server (A5); setup happens
in the app (A6). **v0.2.0 shipped 2026-09-08 19:09 CDT** — `jigbench@0.2.0` on npm, tag `v0.2.0`
→ `a34fd89`, GitHub release with the tarball. **S19** (#24) landed 2026-09-09; **S18's first
retest batch** (#56 #57 #58) merged 2026-09-12; **S20** (#37, the nine hardening PRs) merged the
same day as PR #80 → `fc4207b`, with the review's follow-ups filed as **#81**. **S18's second
retest batch** (#66 #67 #68 #69) merged 2026-09-13 as PR #88 → `7f7d136`, with the re-review's
follow-ups filed as **#89**. `main` is at **`7f7d136`**.

### The second retest batch — merged, and how it got there

| # | item | PR | merged head · run | state |
|---|---|---|---|---|
| 1 | #66 the prompt card stays put while Claude builds | [#82](https://github.com/matterjd/jigbench/pull/82) | `96dfcc1` · 34795709125 | ✅ merged · #66 closed |
| 2 | #69 the build-this-screen card opens inside the plate | [#83](https://github.com/matterjd/jigbench/pull/83) | `e53231b` (repaired) · 34800260316 | ✅ merged · #69 closed |
| 3 | #67 the build stream is a peek on the card, a record in the pane | [#84](https://github.com/matterjd/jigbench/pull/84) | `448b7f0` (repaired) · 34800626553 | ✅ merged · #67 closed |
| 4 | #68 the sketch sheet says how to place a primitive | [#86](https://github.com/matterjd/jigbench/pull/86) | `82e6032` (repaired) · 34800892852 | ✅ merged · #68 closed |
| — | **not an item:** the shop-heartbeat wait's implicit 1 s budget (the red leg below) | [#85](https://github.com/matterjd/jigbench/pull/85) | `eb24681` · 34796708271 | ✅ merged, ahead of #83 |
| — | **the integration** — all five, both legs and DCO green | [#88](https://github.com/matterjd/jigbench/pull/88) | `6a29f2e` → `main` `7f7d136` | ✅ merged |

**The loop that got them there, in one sentence:** the lead reviewed all five, **blocked #83, #84
and #86** with findings posted on each PR under *Lead review (2026-09-13)*, a repair round answered
every blocker (#83 docs-only, #84's head box and row track, #86's ink and the held primitive's
underline), and a **re-review cleared all three merge-with-follow-up** — the follow-ups are #89.

Every PR body is a worker report: what changed, the red line verbatim, how it was verified, and
what was deliberately not done. Every commit is `-s` (DCO). All four items add a line to the same
`## [Unreleased]` block in `CHANGELOG.md`, and that hunk was hand-unioned across #82, #83 and #84
inside #88 — the same hand-union the S18 and S20 sets needed.

### The one root cause worth reading before anything else

**#66 and #69 were the same bug, and neither issue guessed it.** `App.tsx` measured the plate's own
box in a `useEffect` with an **empty dependency list**. That effect runs once, after the FIRST
commit — and the first commit is the `state === null` holding screen, where none of the chassis is
rendered and the ref is `null`. It returned early and, with `[]`, never ran again: **`plateSize` was
`{ w: 0, h: 0 }` for the life of the page.** Proved by logging `placeCardPosition`'s own inputs from
a rendered `App` with the boxes stubbed at 1045×700: `PLACE INPUTS {…} 0 0 320`.

Fed a 0-wide plate, `placeCardPosition` comes apart. `clamp(v, 8, W - 340 - 8)` is `clamp(v, 8,
-348)`, and `Math.min` runs first, so the answer is the LARGER of two numbers both outside the
plate. `ch = Math.min(cardHeight, H - 16)` is **−16**, so the card's real height stopped mattering
at all. Every **Point** card was therefore pinned to `left: 8px` at `top = rect.y + 4` instead of
beside its selection (never filed — the card looked plausible there), and a **sketch** anchor
(`{0, 0, plateSize.w, plateSize.h}` = `{0,0,0,0}`) satisfied no branch and fell through to the
corner at `0 − 340 − 8` = **−348**: 348px left of the plate, under the rail. That is #69 exactly.
The plate is now measured by a **callback ref**, which cannot miss a mount that happens after the
first commit, and `placeCardPosition` never answers with a position outside the plate whatever it
is handed.

### Four judgement calls the lead looked at — and what each became

- **#66's "disappear and reappear" is not an unmount, and I could not make it one.** Driven through
  the whole desk flow in jsdom — Point pick, type, hold Ready to completion, Build, three
  `{type:'build'}` frames, `built` — the card's DOM node is the **same element by reference** at
  every step and its `left`/`top` never change. What the fix removes is real and provable: the
  placement effect carried `buildStream.length` and a ResizeObserver watched the card's own box, so
  once the plate is measured the card walks up the plate a step per streamed frame. Element identity
  is now asserted so a future remount is caught, and `docs/TEST-RUN.md` step 16 carries the half only
  a browser can judge (no flash on the way).
- **#67's card shows no clock.** The issue's tier-1 line is `building · 00:42 · editing
  invoice-list.html`; the card gets the state and the step, not the elapsed time. A live clock
  re-renders the card every second — exactly what #66 just stopped — and AMENDMENT-1 §4 puts the
  clock on the status line, where it already is.
- **#68 ships SIX primitives, not five.** The issue names *button · text · input · card · list*;
  `docs/USING.md` and AMENDMENT-1 §4 both say five (*box · text · button · input · list*); the code
  has had **six** since S9 — `box, text, button, input, image, list` — and there is no `card`. A
  strip is the wrong place to silently drop a capability, so it shows what the sheet can actually
  place and `docs/USING.md` now says the same. **Which of the two is wrong is a ruling, not a fix —
  and it is still Matter's to make.** It is now the first ruling in **#89** (`sketchWorkspace.ts:13`):
  four surfaces say six and two say five, and #86's own CHANGELOG and `docs/TEST-RUN.md` step 19
  widened the contradiction rather than settling it.
- **#67 left `say`'s built wording alone**, including *"look at the plate, flip before, or refine"* —
  which names a control #8 removed and `docs/TEST-RUN.md` step 17 explicitly says does not exist.
  It is a real wording defect on the surface #67 touches; changing it there would have made this PR
  and a wording change depend on merge order. **Worth its own issue.**

### The CI story, and the one thing to know before the next Windows push

**#83's first run (34796088213) was green on ubuntu and red on windows — and it was NOT #83's.**
`cli`'s `src/commands/mcp.test.ts` › *deletes the shop heartbeat before the returned promise
resolves* failed with `AssertionError: expected null not to be null`, in a package that diff does
not touch, while PR #82 — a bench-only diff pushed eleven minutes earlier — was green on both legs.
Root-caused rather than re-run: the wait carried vitest's **implicit 1000 ms** budget, and what has
to finish inside it is a chain — the `notifications/initialized` line written onto a `PassThrough`
and not awaited, the SDK parsing it, `oninitialized` firing `heartbeat.start()` **fire-and-forget**
(`server.ts:112`, deliberate), and only then `atomicWriteFile`'s mkdir + temp write + rename, **each
of which is retried with a sleep on Windows** because that is what `atomic-write.ts` exists for.
Reproduced deterministically here by shrinking the budget to 1 ms — identical failure, same message.
Fixed in **#85** (an explicit 20 s budget, the shape `build/runner.test.ts`'s cancel test already
uses) and **ported into #83** so that PR could reach a green head without waiting; #85 went in ahead
of #83 inside #88, so the ported copy no-opped exactly as intended. **No re-run was spent.** This is the sixth Windows-timing failure of the general class
on the record, after `3939bc0`→#32, `dece0fc`→#34, `365ebef`→#45, `c9df97a`→#62 and S20's #78.

### Still true, and still worth knowing before you touch this code

- **There is no browser anywhere in this repo.** No Playwright, no Puppeteer, no Chromium, and none
  installed on either CI leg. bench's vitest runs jsdom with CSS loading off and **no layout engine**,
  so every box measures 0 — which is why a card at `left: -348px` and a stream box with no width rule
  were both invisible to the whole suite. Two idioms answer that, and this slice used both:
  **model the missing layout** (stub `clientWidth`/`clientHeight`/`offsetHeight` so the inputs to a
  pure placement function actually change) and **pin the contract at the source**
  (`floor-*.test.ts`, now including `floor-build-stream-box.test.ts`, each with detector controls).
  A browser harness for the bench is **#64**, deliberately its own slice.
- **jsdom implements neither `setPointerCapture` nor `releasePointerCapture`** (both `undefined` on an
  element), so #58's capture half is proven against a stub, and `docs/TEST-RUN.md` step 15 is what
  proves it on a real pointer.
- **Node exposes neither win32 file attribute**, so `fs/win32-hidden.ts` runs one `attrib /d <dir>\*`
  per listing and **fails open**. Its pure half (`parseAttribOutput`) is split out so it is provable
  off Windows — the same seam `isRunnableScriptName(name, platform)` uses, and the one to reach for
  whenever behaviour forks on the platform.
- **`http-proxy@1.18.1` is unmaintained** and is where DEP0060 comes from, silenced in
  `packages/cli/src/quiet-deprecations.ts` rather than upgraded (a real upgrade means swapping the
  library under `plate/proxy.ts`, which carries #35's Host gate, and is its own slice).
- **From #57:** with `.jig-chassis` now `overflow: hidden`, a window shorter than the centre's own
  floor (`minmax(400px, 1fr)` plate + the 264px Advanced drawer + the 28px status line = 692px)
  **clips** where it used to scroll. Both measured viewports have room (1280×720 leaves exactly
  692px), and that floor is ruled by CHASSIS and pinned by its own test — but a short laptop window is
  where it would show.
- **From #61, named rather than quietly widened:** holding Ready *while the create is still in
  flight* — press and hold in the few ms between the first keystroke and the POST answering — still
  completes into `matchedPrompt && …` with nothing to send, and says nothing. One line in `App.tsx`
  if the lead wants it closed.
- **`SketchProperties` is still mounted only through `PropertiesColumn`, which the quiet chassis does
  not render.** #68 put the primitives on the sheet rather than mounting that panel; everything else
  in it — the gauge slot pickers, the hotspot link, the element scrap bin — is still unreachable from
  the default view. **Now filed, as a bullet in #89** (`PropertiesColumn.tsx:35`): mount it in the
  quiet chassis or retire it with `SketchProperties`' palette. It is still a design question first.

**The plan of record:** `docs/ROADMAP.md`, one row per slice, each with a goal, acceptance,
depends-on, size, tier (green = a cloud session may merge on green CI; amber = the PR waits for
the lead; ruling = Matter decides first) and the file name of its cloud prompt under
`docs/team/cloud/`; read that folder's README first. R0, **S19** and **S20** are shipped; **S18**'s
row now says shipped for **both** batches — the first 2026-09-12, the second 2026-09-13 (PR #88 →
`7f7d136`, follow-ups #89) — and moves once more only to name the version they ship in. Next in
sequence:
**#81** (hardening round 2, the S20 review's follow-ups) as its own slice, then **S21** issue #23,
the three rulings (ruling — Matter answers first) → v0.3, the stacks (S22 React/Next/Vite, S23
Vue/Svelte, S24 Expo web, S25 server-rendered, S26 OpenAPI) → v0.3, the loop deepens (S27 a real
before, S28 the stream and the logbook, S29 refine and build again, S30 the MCP door) → v0.4.
**S22 is the first slice that can make #71's survey-hint tier live** — an adapter emitting a
`devServer` is exactly what that item was written ahead of.

**Debt:** **#23** the three rulings Matter owes · **#81** hardening round 2 (six items; the first
four have teeth) · **#89** the second retest batch's twelve follow-ups (the Prompts pane's scroll
box is keyboard-unreachable at `PromptsPane.css:146` — an accessibility regression #84 itself
created, and the one the re-review would have held on; two rulings for Matter; a floor gate at
`floor-load-bearing-ink.test.ts:132` that survives having the paint deleted) · **#58** open until
the desk holds Ready with a mouse (`docs/TEST-RUN.md` step 15)
· **#64** the browser harness for the bench — **this slice is the strongest argument yet for it:
three of the four defects were things a real browser sees and jsdom cannot** · **#62** the git-diff
fallback test's race, root-caused with a verified patch in the issue (a natural pair with **#3**) ·
**#54** two tests that fail on the desk and pass in CI (a stray `~/.jig` captures `findRepoRoot` —
and the product question under it: on any machine where a `.jig/` exists in `$HOME`, every
`jigbench` started outside a repo silently clamps to the home directory; plus a `ledger-angular`
gauge usage CI does not see). This seat is Linux with no `~/.jig` and no build output under
`examples/`, so **both of #54's failures pass here** — it really is desk-only. Older: #2 pdf-parse
native · #3 trial-fit e2e flake · #4 esbuild advisory · #5 karma qs · #6 the legacy log does not
survive a re-read. Seen once in CI and never root-caused: `plate/proxy.test.ts` letting an
interceptor short-circuit the proxy on ubuntu (run 34174031120 attempt 1; green on the re-run).
**#24 and #37 are closed.** **Not filed, and someone should:** the card's built message still says
*"flip before"*, naming a switch #8 removed — see the judgement calls above.

**Rules of record:** a slice is a branch (`delegate/build-sN` or `fix/<slug>`), test-first with the
red line quoted in the commit body, `git commit -s`, a PR in the worker-report shape, both CI legs
green at the PR head, then a merge commit (a `Signed-off-by:` trailer in its message) — never
rewrite pushed history; record every merge on #1 with the sha and the run id. A red push run on
main is root-caused the same day, as its own PR, and "flake" is not a root cause. Every server test
runs with `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's
fake `claude` on PATH. **Run `npm run typecheck` (or `npm run build`) before `npm test` after a
fresh `npm ci`** — without the workspace build, 21 server files fail to resolve
`@jigbench/adapter-web` and the suite is red for a reason that has nothing to do with the change;
CI does the typecheck first for exactly this reason. **`bash scripts/qa-gate.sh` needs a full
`npm run build` once before its `check:stdout` leg can pass** (that leg runs `packages/cli/dist/bin.js`,
which `typecheck` alone does not produce). Never edit `examples/` source, `QUALITY.md` or
`docs/quality/`; no real `claude -p`, `npm link` or `claude mcp add` in tests; publish, tags and
visibility are Matter's. **A remote seat has no browser and no Windows desk: it never claims a live
UI walkthrough.**

**Matter owes the desk:** the three rulings in #23 (S21 cannot start without them) · the two rulings
in **#89** — five or six primitives (`sketchWorkspace.ts:13`), and whether Esc closes the card or
returns to Hand (`PromptCard.tsx:137` says one thing, `docs/TEST-RUN.md` step 19 the other, in the
same step) · **a re-run of `docs/TEST-RUN.md` now that these four are merged** — steps
**16**, **17** and **19** carry new lines written for exactly this batch, and all of them are things
only his browser can judge: **16** the card stays put from the moment Build is pressed (no blink, no
creep) and the stream is a three-line strip on the card with the whole record scrolling in Prompts,
nothing running off the right edge at 1280×720; **19** the primitives strip is there and legible
(*click a primitive, then click the sheet*), two clicks place a button, and **build this screen →**
opens a fully visible card titled with the sketch's name at both viewports. Still owed from before:
steps **14**, **15** and **18** for #59/#60/#61; delete `wo/0003-days-overdue`; start the Ollama tray
app before the demo (or `JIG_NO_MODEL=1`). Only really judgeable on a Windows desk, from S19/S20: a
drive root showing no `$Recycle.Bin`, `$WINDOWS.~BT`, `System Volume Information` or `Recovery`
(#42); a repo whose `package.json` names a script with a metacharacter (`"start&calc.exe"`) refused
with the charset message rather than run (#72); the folder browser still listing a directory reached
through a junction (#74).

**→ Next session: the frontier is #81 (hardening round 2) as its own slice — paste
`docs/team/cloud/03-hardening.md`'s shape against #81's six items, amber. After that:
`04-rulings.md` (S21, issue #23) if Matter has answered, else `05-adapter-react.md` (S22) — and S22
is the slice that makes #71's survey-hint tier live, so read that PR before writing an adapter's
`devServer`. #73 (Point like the inspector) comes after S28. #64 (the browser harness) and the new
follow-ups issue **#89** both wait: #64 on the desk, #89 on Matter's two rulings and the desk's
re-run of `docs/TEST-RUN.md`.**
