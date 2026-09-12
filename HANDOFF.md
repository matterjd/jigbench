# HANDOFF — next-session entry point

> **S20 (issue #37, the hardening items) is BUILT and waiting on the lead: eight PRs, #65 #70 #71
> #72 #74 #75 #76 #77, one per item, each test-first with its red line in the commit body.** The
> slice is **amber** — nothing was merged, `main` is still `39496f2`, and no tag, publish or
> visibility change was touched. A ninth PR, **#78**, is not one of #37's items: it root-causes a
> red windows-latest leg that surfaced during the slice (`target/runner.test.ts`'s unretried temp-dir
> `rm` after a real `npm` spawn). `docs/ROADMAP.md`'s S20 row is deliberately unchanged and **#37 is
> deliberately still open** — both move when the last item merges. Issue #1 carries every PR with its
> head sha, run id and state. **This repo is AEDL-provisioned (2026-09-09):** the guards run here
> (`bash .claude/hooks/preflight-check.sh` → "Enforcement will run") and `bash scripts/qa-gate.sh` is
> the fast set. `SUBAGENT-AUTHORIZATION.md` is unsigned, so delegation grants nothing until Matter
> signs one.

**seat:** Delivery (remote — no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real
`claude` binary; CI is the only gate) · **branch:** `main` · **written:** 2026-09-12 · code at
`39496f2` · **S20's nine PRs are open and green-or-named; S18 (#59 #60 #61) merged earlier the same
day. Nothing was merged by this seat, nothing tagged, nothing published; 0.2.0 remains the last
release.**

## State

Founded 2026-09-05 from the Design seat's commission (`docs/design/COMMISSION.md`, F1–F22; the
plan is #1, APPROVED with blanket merge for verified green slices). **v0.1.0** shipped, then
Matter's first live test → **AMENDMENT 1** (`docs/design/AMENDMENT-1-the-simplification.md`,
rulings A1–A6, binding): one loop, a Build button that runs `claude -p`, Polish on demand, the
loop-only default view, the artifact is a Prompt; any app with a dev server (A5); setup happens
in the app (A6). **v0.2.0 shipped 2026-09-08 19:09 CDT** — `jigbench@0.2.0` on npm, tag `v0.2.0`
→ `a34fd89`, GitHub release with the tarball. **S19** (issue #24) landed 2026-09-09; **S18** (the
0.2.0 desk-retest set, #56 #57 #58) merged 2026-09-12 as #61 `c9df97a` → #60 `2c83f3f` → #59
`5bced66`, and `main` is at **`39496f2`** (that merge train plus the S18 docs PR #63).

### S20 — open, and the lead's to merge

| # | item | PR | head · run | both legs |
|---|---|---|---|---|
| 1 | Origin checked on every method, GET included; `SECURITY.md` moved with it | [#65](https://github.com/matterjd/jigbench/pull/65) | `b833d45` · 34715458105 | ✅ |
| 2 | `port` bounded to a whole 1–65535, in words | [#70](https://github.com/matterjd/jigbench/pull/70) | `e9f2ee4` · 34715808651 | ✅ |
| 3 | the survey's dev-server hint goes through the repo's own allowlist | [#71](https://github.com/matterjd/jigbench/pull/71) | `fb38809` · 34715977103 | ✅ |
| 4 | script-name charset on win32; the #17 payload is the form that splits | [#72](https://github.com/matterjd/jigbench/pull/72) | `8de9e1f` · 34717541078 | ✅ (first run red — see below) |
| 5 | realpath before stat, at both spellings of the local-path guard | [#74](https://github.com/matterjd/jigbench/pull/74) | `bbbafc9` · 34717651107 | ✅ (first run red — not #74's; see below) |
| 6 | a budget per `git` invocation, so a wedged git cannot hold a build open | [#75](https://github.com/matterjd/jigbench/pull/75) | `752ee7a` · 34716829905 | ✅ |
| 7 | the migration's ENOENT guard narrowed to the read it was written for | [#76](https://github.com/matterjd/jigbench/pull/76) | `99d721c` · 34717027007 | ✅ |
| 8 | the four test gaps, tests only, each proved by reverting its fix | [#77](https://github.com/matterjd/jigbench/pull/77) | `1c23e65` · 34717324883 | ✅ |
| — | **not an item:** `target/runner.test.ts`'s teardown retry (the red leg above) | [#78](https://github.com/matterjd/jigbench/pull/78) | `294faaa` · 34717635499 | ✅ |

Every PR body is a worker report: what changed, the red line verbatim, how it was verified, and
what was deliberately not done. Every commit is `-s` (DCO). All eight items add a line to the same
`## [Unreleased]` block in `CHANGELOG.md`, so **expect the CHANGELOG hunk to conflict on every merge
after the first** — the same hand-union the S18 set needed.

### Five judgement calls the lead should look at first

- **#37 names `POST /api/clamp` as the second unbounded `port`. It is not one.** Its handler reads
  only `repoRoot` (`bench/host.ts:342`) and the bench's own client posts only `{ repoRoot }`
  (`packages/bench/src/clamp/api.ts:95`); a `port` sent there is accepted and ignored, and can
  neither spawn nor bind. The second route that really takes one is **`POST /api/plate/mirror`**, and
  that is what #70 bounds. No `port` was added to clamp's contract just to reject it.
- **#70 keeps `0` on `POST /api/plate/mirror`,** the OS's "assign me any free port" sentinel, because
  that route's 200 body reports the port actually bound — and because `trialfit/route.test.ts`'s real
  end-to-end mirror test passes `0` for exactly that reason (its own comment says so). Refusing it
  would have meant rewriting that test around a `freePort()` probe, re-introducing the collision its
  author was avoiding, for no security gain. `POST /api/target/start` has no such exception.
- **#72 left the #17 no-scripts 400 wording byte-for-byte alone** even though a win32 repo whose every
  script name fails the charset now reads as "defines no scripts" where "defines none Jig can run" is
  the truth. #77 pins that wording; changing it in both PRs would have made them depend on merge
  order. There is a comment at the site saying so.
- **#74 does not change any reported path to its canonical form.** `realpath` is used for the guards
  and the filesystem calls; `resolved` — what the human typed or clicked — is still what every
  message quotes, what every `entries[].path` is built from, and what a clamp records. On win32
  `realpath` expands an 8.3 alias (`C:\Users\RUNNER~1\…`), which `build/git-diff.ts` already
  documents as a real difference between two spellings of one directory; rewriting a clamp's
  `repoRoot` to it is a separate change with its own Windows landmine.
- **#37's fifth "test gap" bullet is not a test and was not actionable.** It reads *"PR #32's comment
  misdescribes the mechanism (the listener holds the previous commit's null `plateOrigin`)"* — that is
  a comment on a merged pull request, which is pushed history. Nothing in the current tree carries
  that misdescription (`usePlateBridge.ts`'s own comments describe the ref and the three posts
  correctly). If a **code** comment was meant, it needs pointing at.

### Two CI stories worth reading before the next Windows push

- **#72's first run (34716234717) was green on ubuntu and red on windows — and it was mine.** The
  existing #17 case asserted `/package\.json/` on the 400 body; with the charset check running
  *before* the membership test, `start&calc.exe` on win32 is refused for its characters and that
  message speaks about cmd.exe, not package.json. Off win32 the old message still stands. So the
  assertion was only ever true on one leg, and the payload change is what made that visible. Now
  asserted per platform. **The lesson for this seat: `bash scripts/qa-gate.sh` cannot see win32
  behaviour, so any change that forks on `process.platform` is only half-verified until the Windows
  leg reports.**
- **#74's first run (34716624245) was red on windows and it was NOT #74's.**
  `target/runner.test.ts`'s real-`npm` case failed with `EBUSY … rmdir
  'C:\Users\RUNNER~1\…\jig-runner-npm-dl84Jg'`, in a package that diff does not touch, while the same
  test passed on the windows leg of the six other S20 PRs pushed in the same half hour. Root-caused
  rather than re-run: that test spawns a real `npm run start`, which on Windows is three processes
  deep (`cmd.exe` → `npm.cmd` → `node server.mjs`), and `stop()` resolving does not mean the OS has
  released their handles into `repoRoot` — so the unretried `rm` in its `finally` can arrive an
  instant early. `maxRetries: 5, retryDelay: 100`, the retry `build/runner.test.ts` already documents
  for the same and shorter chain. Fixed in **#78** and **ported into #74** so that PR could reach a
  green head without waiting; it no-ops once #78 merges. **No re-run was spent.** This is the fifth
  Windows-timing failure of the general class on the record, after `3939bc0`→#32, `dece0fc`→#34,
  `365ebef`→#45 and `c9df97a`→#62.

### Still true, and still worth knowing before you touch this code

- **There is no browser anywhere in this repo.** No Playwright, no Puppeteer, no Chromium, and none
  installed on either CI leg. `packages/server/src/orders/http.trialfit.test.ts` boots a Node HTTP
  server and talks to it with `fetch` — it is not a headless-Chromium harness, whatever #58's text
  says. bench's vitest runs jsdom with CSS loading off and no layout engine, so `getComputedStyle`
  and any box measurement are worthless there; rendering is proved by the desk steps in
  `docs/TEST-RUN.md` and pinned in code by **source-contract tests** (`floor-control-ink.test.ts`,
  `floor-viewport-scroll.test.ts`, in `floor-colour-literals.test.ts`'s idiom, each with detector
  controls). A browser harness for the bench is **#64**, deliberately its own slice.
- **jsdom implements neither `setPointerCapture` nor `releasePointerCapture`** (both `undefined` on an
  element), so #58's capture half is proven against a stub, and `docs/TEST-RUN.md` step 15 is what
  proves it on a real pointer.
- **Node exposes neither win32 file attribute**, so `fs/win32-hidden.ts` runs one `attrib /d <dir>\*`
  per listing and **fails open**. Its pure half (`parseAttribOutput`) is split out so it is provable
  off Windows — the same seam #72's `isRunnableScriptName(name, platform)` now uses, and the one to
  reach for whenever behaviour forks on the platform.
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

**The plan of record:** `docs/ROADMAP.md`, one row per slice, each with a goal, acceptance,
depends-on, size, tier (green = a cloud session may merge on green CI; amber = the PR waits for
the lead; ruling = Matter decides first) and the file name of its cloud prompt under
`docs/team/cloud/`; read that folder's README first. R0, **S19** and **S18** are shipped; **S20 is
built and waiting on the lead**. Next in sequence: **S21** issue #23, the three rulings (ruling —
Matter answers first) → v0.3, the stacks (S22 React/Next/Vite, S23 Vue/Svelte, S24 Expo web, S25
server-rendered, S26 OpenAPI) → v0.3, the loop deepens (S27 a real before, S28 the stream and the
logbook, S29 refine and build again, S30 the MCP door) → v0.4. **S22 is the first slice that can make
#71's survey-hint tier live** — an adapter emitting a `devServer` is exactly what that item was
written ahead of.

**Debt:** **#23** the three rulings Matter owes · **#37** the eight hardening items (all eight built;
the issue closes when the last PR merges) · **#58** open until the desk holds Ready with a mouse
(`docs/TEST-RUN.md` step 15) · **#64** the browser harness for the bench · **#62** the git-diff
fallback test's race, root-caused with a verified patch in the issue (a natural pair with **#3**,
which the roadmap routes to S20's test-hardening pass; **#78** is a *different* race in a *different*
file — do not fold them) · **#54** two tests that fail on the desk and pass in CI (a stray `~/.jig`
captures `findRepoRoot` — and the product question under it: on any machine where a `.jig/` exists in
`$HOME`, every `jigbench` started outside a repo silently clamps to the home directory; plus a
`ledger-angular` gauge usage CI does not see). This seat is Linux with no `~/.jig` and no build output
under `examples/`, so **both of #54's failures pass here** — it really is desk-only. Older: #2
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
CI does the typecheck first for exactly this reason. **`bash scripts/qa-gate.sh` needs a full
`npm run build` once before its `check:stdout` leg can pass** (that leg runs `packages/cli/dist/bin.js`,
which `typecheck` alone does not produce). Never edit `examples/` source, `QUALITY.md` or
`docs/quality/`; no real `claude -p`, `npm link` or `claude mcp add` in tests; publish, tags and
visibility are Matter's. **A remote seat has no browser and no Windows desk: it never claims a live
UI walkthrough.**

**Matter owes the desk:** the three rulings in #23 (S21 cannot start without them) · **a re-run of
`docs/TEST-RUN.md` now that #59, #60 and #61 are merged** — steps 14, 15 and 18 carry new lines
written for exactly those three fixes, and all three are things only his browser can judge: **14**
the text you type is light on the dark card, in the bench's sans and not the browser's monospace;
**15** the ring fills from the moment the button goes down, the card says *hold — the ring fills*,
drifting the mouse off the button mid-hold no longer ends it, a tap still says *let go early —
still a draft · N ms of 800*, and a completed hold **actually makes the draft ready**; **18** at
1440×900 and 1280×720 a long gauge list scrolls inside the tab panel while the window itself has no
scrollbar and the tab strip, rail and status line stay put. Also still owed: delete
`wo/0003-days-overdue`, and start the Ollama tray app before the demo (or `JIG_NO_MODEL=1`). Still
only really judgeable on a Windows desk, from S19: a drive root showing no `$Recycle.Bin`,
`$WINDOWS.~BT`, `System Volume Information` or `Recovery` (#42). **New from S20, and only judgeable
on Windows:** a repo whose `package.json` names a script with a metacharacter (`"start&calc.exe"`)
is refused with the charset message rather than run (#72), and the folder browser still lists a
directory reached through a junction (#74).

**→ Next session: S20's nine PRs are the lead's to review and merge (amber; expect the `CHANGELOG.md`
Unreleased hunk to conflict after the first, and merge #78 or #74 in either order — the fix is in
both). When the last of the eight items lands, close #37 and flip the S20 row in `docs/ROADMAP.md`
to shipped. Then the frontier is `docs/team/cloud/04-rulings.md` (S21, issue #23) if Matter has
answered, else `05-adapter-react.md` (S22) — and S22 is the slice that makes #71's survey-hint tier
live, so read that PR before writing an adapter's `devServer`.**
