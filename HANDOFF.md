# HANDOFF — next-session entry point

> **S20b — issue #81, hardening round 2 — is BUILT and waiting on the lead.** Eight items, **eight
> PRs**, each on its own `fix/<slug>` branch, each test-first with the red line quoted verbatim in
> the commit body, each `-s` (DCO), each a worker-report PR body:
> [#91](https://github.com/matterjd/jigbench/pull/91) · [#92](https://github.com/matterjd/jigbench/pull/92) ·
> [#94](https://github.com/matterjd/jigbench/pull/94) · [#95](https://github.com/matterjd/jigbench/pull/95) ·
> [#96](https://github.com/matterjd/jigbench/pull/96) · [#97](https://github.com/matterjd/jigbench/pull/97) ·
> [#98](https://github.com/matterjd/jigbench/pull/98) · [#99](https://github.com/matterjd/jigbench/pull/99).
> **Both CI legs and DCO green at every PR head.** The slice is **amber**: nothing was merged from
> this seat, #81 is still open, and `docs/ROADMAP.md`'s S20b row is deliberately unchanged — it
> moves when the last of the eight merges, with the version it ships in.
> **Two finds the issue did not name are the ones to read first** (below): the UNC guard's
> resolved-path hole, and why the `stop()` test had to be built around a saturated pipe rather than
> a PID.
> **This repo is AEDL-provisioned (2026-09-09):** the guards run here
> (`bash .claude/hooks/preflight-check.sh` → "Enforcement will run") and `bash scripts/qa-gate.sh` is
> the fast set. `SUBAGENT-AUTHORIZATION.md` is unsigned, so delegation grants nothing until Matter
> signs one.

**seat:** Delivery (remote — no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real
`claude` binary; CI is the only gate) · **branch:** `docs/handoff-s20b` · **written:** 2026-09-15 ·
main at `68e3414` · **the eight PRs are open and green; the merge word is the lead's. 0.2.0 remains
the last release, with S18's two batches and S20 on main, unreleased.**

## State

Founded 2026-09-05 from the Design seat's commission (`docs/design/COMMISSION.md`, F1–F22; the
plan is #1, APPROVED with blanket merge for verified green slices). **v0.1.0** shipped, then
Matter's first live test → **AMENDMENT 1** (`docs/design/AMENDMENT-1-the-simplification.md`,
rulings A1–A6, binding): one loop, a Build button that runs `claude -p`, Polish on demand, the
loop-only default view, the artifact is a Prompt; any app with a dev server (A5); setup happens
in the app (A6). **v0.2.0 shipped 2026-09-08 19:09 CDT** — `jigbench@0.2.0` on npm, tag `v0.2.0`
→ `a34fd89`, GitHub release with the tarball. **S19** (#24) landed 2026-09-09; **S18's first
retest batch** (#56 #57 #58) merged 2026-09-12; **S20** (#37, the nine hardening PRs) merged the
same day as PR #80 → `fc4207b`, follow-ups **#81**. **S18's second retest batch** (#66 #67 #68 #69)
merged 2026-09-13 as PR #88 → `7f7d136`, follow-ups **#89**. **S20b** (#81) is built and open, this
session. `main` is at **`68e3414`** (PR #93, the desk-session docs, merged mid-slice — docs only, no
conflict with any of the eight).

### S20b — the eight, and what each one turned out to be

| # | item | PR | head · run |
|---|---|---|---|
| 1 | `POST /api/docs/clamp` meets the local-path guard | [#91](https://github.com/matterjd/jigbench/pull/91) | `8d243d1` · [34922151377](https://github.com/matterjd/jigbench/actions/runs/34922151377) |
| 2 | the UNC refusal happens before the connection, and the words say only what is true | [#92](https://github.com/matterjd/jigbench/pull/92) | `3c1d5cd` · [34922611733](https://github.com/matterjd/jigbench/actions/runs/34922611733) |
| 3 | every detected port meets `valid-port.ts` | [#94](https://github.com/matterjd/jigbench/pull/94) | `4b4ea33` · [34925589092](https://github.com/matterjd/jigbench/actions/runs/34925589092) |
| 4 | a clamped root keeps the link's spelling, not its target | [#95](https://github.com/matterjd/jigbench/pull/95) | `cc0737d` · [34923050386](https://github.com/matterjd/jigbench/actions/runs/34923050386) |
| 5 | what a no-Origin GET can still reach (docs only) | [#96](https://github.com/matterjd/jigbench/pull/96) | `73c50ba` · [34923291070](https://github.com/matterjd/jigbench/actions/runs/34923291070) |
| 6 | `stop()` does not resolve until the child is gone — and #78's retry is dropped | [#97](https://github.com/matterjd/jigbench/pull/97) | `738202b` · [34924107114](https://github.com/matterjd/jigbench/actions/runs/34924107114) |
| 7 | a git that runs out of budget says so | [#98](https://github.com/matterjd/jigbench/pull/98) | `b0d94c1` · [34924557978](https://github.com/matterjd/jigbench/actions/runs/34924557978) |
| 8 | the eight small ones, one commit each | [#99](https://github.com/matterjd/jigbench/pull/99) | `b242c91` · [34925551269](https://github.com/matterjd/jigbench/actions/runs/34925551269) |

Issue #1 carries the same table with each run's final state. Every `## [Unreleased]` CHANGELOG line
lands in the same block, so that hunk needs the **hand-union** the S18 and S20 sets both needed.

### The two finds the issue did not name, and they are the ones to read

**1 · The UNC guard had a hole one step past where #81 pointed.** #81 item 2 asked for the refusal
to move in front of `realpath` and for four sentences to stop claiming it already was. Both were
right. But `checkLocalPath` judged `raw` and then handed `realpath` the **resolved** path, which
nothing had ever judged — and `path.resolve` takes a relative *or root-relative* value against
`process.cwd()`. A bench started **from** a share turns `sub` into `\\host\share\dir\sub` and
`\repo` into `\\host\share\repo`. Neither raw string is UNC-spelled, both land on the share, and
`realpath` is the SMB open on Windows. The value *was* refused — by the post-`realpath` check, after
the connection. The red line says exactly that: `expected "vi.fn()" to be called +0 times, but got 1
times`.

The fix asks the question **the win32 way as well** — `path.win32.resolve(process.cwd(), raw)`, pure
string work, no I/O — and that arm is the one that matters for CI: POSIX's `path.resolve` collapses
`//host/share` into `/host/share`, so `/repo` under a UNC cwd reads as harmless on ubuntu and as a
share on windows. **Any future guard in this family should ask the win32 question on both legs**, for
the same reason #18 judged the raw string in the first place.

**2 · A test can be red for a reason that will not hold, and #97 nearly shipped one.** #81 item 6
asks for "a runner test asserting the child has exited by the time `stop()` resolves". The obvious
assertion — is the PID still alive? — **passes without the fix on Linux**: probed five runs of five,
the child is reaped inside the same turn `stop()` returns in. A PID assertion guards nothing on the
ubuntu leg.

The half that shows the gap is the **pipe**: `close` fires only once the process is reaped *and* its
streams have ended, so residual output is structural proof that `stop()` returned early. Getting
that to be a real guard took measuring, and the numbers are in the fixture so nobody re-derives them:

| burst/tick | full-file result | why |
|---|---|---|
| 200 | red in isolation, **green in the full file** | the backlog drains inside the gap — a guard that does not guard |
| **5000** | **red 4 of 4**, one whole burst pending each run | pipe saturated, child still yielding enough to refill it |
| 20000 | **green every run** | the child goes CPU-bound in its own write loop and *starves* the pipe |

Two-byte lines, because a pipe holds ~64 KB and that backlog is all that survives SIGKILL. **The
lesson generalises: on this suite, "it went red once" is not evidence a timing test guards
anything** — run it in the full file, several times, and write down what you measured.

### Four judgement calls the lead should look at

- **#81 item 8's 415-vs-400 reading.** The bullet says *"a body that is not JSON gets 415 with words,
  not the parser's own 400"*. PR #99 reads that as two clauses: **415** for a body the bench cannot
  read at all (the media type), and *"not the parser's own"* for the **phrasing** of one it can read
  and finds malformed — which keeps 400, the correct HTTP answer for well-typed, ill-formed content.
  Making the malformed case a 415 too is a one-line change if the lead reads it the other way.
- **Item 4 picked "recheck and probe through `real`", not "refuse a mismatched root".** #81 offers
  both. A refusal would turn away every symlinked root, and the item's own acceptance requires
  `entries[].path` to keep the caller's spelling — which a refusal cannot do. The root was already
  rechecked per listing; what was missing was probing through the answer.
- **Item 6's windows half is not verified from this seat.** The EBUSY that #78's retry was hiding
  only happens where `taskkill` walks a three-process tree. The retry is **gone** and the `rm` is
  plain, deliberately: with it there a regression in `stop()` would be hidden again. **If
  windows-latest goes red on `runner.test.ts` teardown, that is #97's to answer, not a flake.**
- **Item 5 has no test, and the PR says why.** It changes no behaviour — it corrects what
  `SECURITY.md` and `same-origin.ts` *claim* about behaviour that is already there and already
  tested. What replaced a test was checking every claim against the code first, which is how an
  earlier draft's false line about `/api/setup` writing drafter wiring got caught before it shipped.

### Two cross-PR interactions the integration must not trip on

1. **#99 (item 8f) gates the bare `angular.json` tier**, and #94 (item 3) has a test that walks that
   tier with no `node_modules`. **Already handled:** a follow-up commit on `fix/detected-ports-bounded`
   (`4b4ea33`) plants `node_modules/.bin/ng` in both fixtures, so those cases pass in either merge
   order. That is why #94's head is `4b4ea33` and not `c2e1185`.
2. **#99 (item 8h) and #92 (item 2) both drop "junction" from `fs/local-path.ts` and the same
   `CHANGELOG.md` entry.** The hunks agree; whichever lands first, the other is a union, not a
   conflict of meaning.

### Found on the way, not fixed, and worth a line on #81 or its own issue

`packages/cli/src/commands/serve.ts:58` reads the **same** `angular.json` serve port that #81 item 3
bounds, with the same unbounded `typeof port === 'number'`, and builds `http://localhost:Infinity`
from it. It is a third path, outside item 3's acceptance (scoped to `detectDevScript`), and fixing it
means exporting `isValidPort` from `@jigbench/server`'s public API — `cli` may import nothing else.
That is a widening no item asked for.

### Still true, and still worth knowing before you touch this code

- **There is no browser anywhere in this repo.** No Playwright, no Puppeteer, no Chromium, and none
  installed on either CI leg. bench's vitest runs jsdom with CSS loading off and **no layout engine**,
  so every box measures 0. Two idioms answer that: **model the missing layout** (stub
  `clientWidth`/`clientHeight`/`offsetHeight`) and **pin the contract at the source**
  (`floor-*.test.ts`, each with detector controls). A browser harness for the bench is **#64**.
- **The win32 shapes this slice guards against cannot be planted on a CI runner** without making the
  very connection the guard prevents, so `realpath` is injected through a test-only seam — in
  `fs/route.ts`, `bench/validate-clamp-path.ts` and now `setup/route.ts` too. The same seam proves a
  re-pointed link (#95) by answering two different directories on two calls.
- **A `-` is not a shell metacharacter, and that is why #99 item 8c is a rule on every platform.**
  The win32 charset allows `-` so `lint-all` works; a LEADING one is an option to any argv, on any
  OS. When a rule is not about cmd.exe re-parsing a line, it does not belong behind the platform
  branch.
- **jsdom implements neither `setPointerCapture` nor `releasePointerCapture`**, so #58's capture half
  is proven against a stub, and `docs/TEST-RUN.md` step 15 is what proves it on a real pointer.
- **Node exposes neither win32 file attribute**, so `fs/win32-hidden.ts` runs one `attrib /d <dir>\*`
  per listing and **fails open**. Its pure half is split out so it is provable off Windows — the same
  seam `isRunnableScriptName(name, platform)` uses.
- **`http-proxy@1.18.1` is unmaintained** and is where DEP0060 comes from, silenced in
  `packages/cli/src/quiet-deprecations.ts` rather than upgraded (a real upgrade means swapping the
  library under `plate/proxy.ts`, which carries #35's Host gate, and is its own slice).
- **From #57:** with `.jig-chassis` now `overflow: hidden`, a window shorter than the centre's own
  floor (692px) **clips** where it used to scroll. Both measured viewports have room, but a short
  laptop window is where it would show.
- **From #61, named rather than quietly widened:** holding Ready *while the create is still in
  flight* still completes into `matchedPrompt && …` with nothing to send, and says nothing. One line
  in `App.tsx` if the lead wants it closed.
- **`SketchProperties` is still mounted only through `PropertiesColumn`, which the quiet chassis does
  not render** — filed as a bullet in **#89**. A design question first.

**The plan of record:** `docs/ROADMAP.md`, one row per slice, each with a goal, acceptance,
depends-on, size, tier (green = a session may merge on green CI; amber = the PR waits for the lead;
ruling = Matter decides first) and the file name of its cloud prompt under `docs/team/cloud/`; read
that folder's README first. **New since #93: two lanes, one writer.** A row is picked up on the desk
(command-center's launcher) or in the cloud, from the same prompt file, differing only in the seat
paragraph — and **never both at once on `jigbench`**. R0, **S19**, **S20** and **S18** are shipped;
**S20b**'s row moves when the eight merge. Next in sequence: **S21** issue #23, the three rulings
(ruling — Matter answers first) → v0.3, the stacks (S22 React/Next/Vite, S23 Vue/Svelte, S24 Expo
web, S25 server-rendered, S26 OpenAPI) → v0.3, the loop deepens (S27 a real before, S28 the stream
and the logbook, S29 refine and build again, S30 the MCP door) → v0.4. **S22 is the first slice that
can make #71's survey-hint tier live** — and note that #81 item 3 now bounds that hint's port, so an
adapter emitting a `devServer` meets `valid-port.ts` on the way in.

**Debt:** **#23** the three rulings Matter owes · **#81** hardening round 2 — **built, eight PRs open,
awaiting the lead** · **#89** the second retest batch's twelve follow-ups (the Prompts pane's scroll
box is keyboard-unreachable at `PromptsPane.css:146`; two rulings for Matter; a floor gate at
`floor-load-bearing-ink.test.ts:132` that survives having the paint deleted) · **#58** open until the
desk holds Ready with a mouse (`docs/TEST-RUN.md` step 15) · **#64** the browser harness for the
bench · **#62** the git-diff fallback test's race, root-caused with a verified patch in the issue (a
natural pair with **#3**) · **#54** two tests that fail on the desk and pass in CI (a stray `~/.jig`
captures `findRepoRoot` — and the product question under it). This seat is Linux with no `~/.jig` and
no build output under `examples/`, so **both of #54's failures pass here**. Older: #2 pdf-parse native
· #3 trial-fit e2e flake · #4 esbuild advisory · #5 karma qs · #6 the legacy log does not survive a
re-read. Seen once in CI and never root-caused: `plate/proxy.test.ts` letting an interceptor
short-circuit the proxy on ubuntu (run 34174031120 attempt 1; green on the re-run). **#24 and #37 are
closed.** **Still not filed, and someone should:** the card's built message says *"flip before"*,
naming a switch #8 removed.

**Rules of record:** a slice is a branch (`delegate/build-sN` or `fix/<slug>`), test-first with the
red line quoted in the commit body, `git commit -s`, a PR in the worker-report shape, both CI legs
green at the PR head, then a merge commit (a `Signed-off-by:` trailer in its message) — never rewrite
pushed history; record every merge on #1 with the sha and the run id. A red push run on main is
root-caused the same day, as its own PR, and "flake" is not a root cause. Every server test runs with
`JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake
`claude` on PATH. **Run `npm run typecheck` (or `npm run build`) before `npm test` after a fresh
`npm ci`** — without the workspace build, 21 server files fail to resolve `@jigbench/adapter-web`.
**A change to `packages/core` needs `npm run build --workspace @jigbench/core` before `server`
typechecks against it** (S20b item 7 added a `notice` kind to core and hit exactly this).
**`bash scripts/qa-gate.sh` needs a full `npm run build` once before its `check:stdout` leg can
pass.** Never edit `examples/` source, `QUALITY.md` or `docs/quality/`; no real `claude -p`,
`npm link` or `claude mcp add` in tests; publish, tags and visibility are Matter's. **A remote seat
has no browser and no Windows desk: it never claims a live UI walkthrough.**

**Matter owes the desk:** the three rulings in #23 (S21 cannot start without them) · the two rulings
in **#89** — five or six primitives (`sketchWorkspace.ts:13`), and whether Esc closes the card or
returns to Hand · **a re-run of `docs/TEST-RUN.md`** for the second retest batch: steps **16**, **17**
and **19** carry lines written for exactly those four fixes and only a browser can judge them. Still
owed from before: steps **14**, **15** and **18** for #59/#60/#61; delete `wo/0003-days-overdue`;
start the Ollama tray app before the demo (or `JIG_NO_MODEL=1`). Only really judgeable on a Windows
desk, from S19/S20: a drive root showing no `$Recycle.Bin`, `$WINDOWS.~BT`, `System Volume
Information` or `Recovery` (#42); a repo whose `package.json` names a script with a metacharacter
refused with the charset message rather than run (#72); the folder browser still listing a directory
reached through a junction (#74). **New from S20b, and only a Windows desk can see it:** with #97
merged, stopping a target started through `npm run start` must leave its temp directory free
immediately — that is the EBUSY #78's retry was hiding, and the retry is now gone.

**→ Next session: S20b is built and the merge word is the lead's — review the eight
(#91 #92 #94 #95 #96 #97 #98 #99), noting the two cross-PR interactions above, then close #81 and
flip the S20b row. After that: `04-rulings.md` (S21, issue #23) if Matter has answered, else
`05-adapter-react.md` (S22) — and S22 is the slice that makes #71's survey-hint tier live, so read
that PR and #81 item 3 before writing an adapter's `devServer`. #73 (Point like the inspector) comes
after S28. #64 (the browser harness) and #89 both wait: #64 on the desk, #89 on Matter's two rulings
and the desk's re-run of `docs/TEST-RUN.md`.**
