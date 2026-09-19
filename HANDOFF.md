# HANDOFF — next-session entry point

> **#103 IS MERGED — [#109](https://github.com/matterjd/jigbench/pull/109) → `6b6611b`, 2026-09-19, CI green on all three legs including `windows-latest` (helm run, two lanes in-session; 6 commits, DCO PASS). SIX of the seven S20b follow-ups built, one signed commit each; the seventh (bullet 1, the #91 reword) was NOT edited because its premise is FALSE on today's main — the `realParent`/`reportedParent` split the issue says "does not exist" is live at `packages/server/src/fs/route.ts:90`, and `cc0737d` is now an ancestor of `origin/main`, so the issue's own second option is what the evidence supports. 6 of ~20 cited anchors had ROTTED in four days, one onto plausible unrelated prose and one a path that does not exist (`packages/adapters/web/src/App.tsx` → `packages/bench/src/App.tsx`) — RE-ANCHOR SYMBOL-FIRST in this repo, always. The four behavioural bullets are each red-before/green-after, including reproducing #96's blind spot first (a router-mounted `/api/leak` left the old scan at 12 passed — a live foreign-reachable GET with the gate green). Suite: baseline on the clean base was ALREADY `1 failed | 193 passed (195 files)`; final same FILE count, same single failing file, `1883 passed` = +6, exactly the 6 added. THE DESK RED IS DESK-ONLY, NOT WINDOWS-GENERIC — `windows-latest` CI passed on this very PR, which REFUTES the "invisible to CI forever" half of the first hypothesis; filed as [#110](https://github.com/matterjd/jigbench/issues/110) with that correction recorded on the issue, and the cheap next measurement named (force `examples/ledger-angular/src/styles.scss` to LF on the desk and re-run the single test). Also filed: [#111](https://github.com/matterjd/jigbench/issues/111) — the #103 residue (a second bare 120 s timer in `start()`, `angularConfiguredPort`'s silent catch, a fourth copy of the re-pointed claim). NEXT: #102 (amber; its cloud prompt is still to be written in the shape of `03b-hardening-round-2.md`). Matter owes `docs/TEST-RUN.md` step 21 on glass and the 0.2.1 publish. Below, the S21 entry this baton was last written for:**
> **S21 — issue #23, the three rulings — is MERGED as [#106](https://github.com/matterjd/jigbench/pull/106) → `6c29879` (2026-09-19): the Advanced routes answer on the Clamp path, "go to the bench" is ratified, the before controls stay out for 0.2.x (S27 is the real before). #23 is closed; #107 filed. NEXT: #103 (green tier — seven small follow-ups), then #102 (amber; its cloud prompt is still to be written in the shape of `03b-hardening-round-2.md`). Matter owes `docs/TEST-RUN.md` step 21 on glass and the 0.2.1 publish. Below, the S20b entry this baton was last written for:**
> **S20b — issue #81, hardening round 2 — is MERGED.** The eight PRs —
> [#91](https://github.com/matterjd/jigbench/pull/91) · [#92](https://github.com/matterjd/jigbench/pull/92) ·
> [#94](https://github.com/matterjd/jigbench/pull/94) · [#95](https://github.com/matterjd/jigbench/pull/95) ·
> [#96](https://github.com/matterjd/jigbench/pull/96) · [#97](https://github.com/matterjd/jigbench/pull/97) ·
> [#98](https://github.com/matterjd/jigbench/pull/98) · [#99](https://github.com/matterjd/jigbench/pull/99) —
> went in together as one integration PR, **[#101](https://github.com/matterjd/jigbench/pull/101)**
> (`int/s20b`, head `a54712a`), and are on `main` at **`af8de79`**, both CI legs and DCO green.
> **The loop was block → repair → re-review:** the lead's first pass blocked #91 (the docs clamp
> walked and recorded the same spelling, so the index reported the canonical path while the commit
> body said the caller's was kept) and cleared six of the other seven with one named repair first —
> five word narrowings and #97's behavioural one; #92 needed none — after which the repair round
> fixed all seven and the re-review cleared **7 of 7**. **#81 is closed**, `docs/ROADMAP.md`'s S20b
> row says shipped 2026-09-15, and the leftovers are **#102** (hardening round 3, amber) and
> **#103** (seven small follow-ups, green).
> **Two finds the issue did not name are still the ones to read first** (below): the UNC guard's
> resolved-path hole, and why the `stop()` test had to be built around a saturated pipe rather than
> a PID.
> **This repo is AEDL-provisioned (2026-09-09):** the guards run here
> (`bash .claude/hooks/preflight-check.sh` → "Enforcement will run") and `bash scripts/qa-gate.sh` is
> the fast set. `SUBAGENT-AUTHORIZATION.md` is unsigned, so delegation grants nothing until Matter
> signs one.

**seat:** Delivery (remote — no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real
`claude` binary; CI is the only gate) · **branch:** `docs/handoff-s20b` · **written:** 2026-09-15,
corrected after the merge · main at `af8de79` · **the eight are merged and #81 is closed. 0.2.0
remains the last release, with S18's two batches, S20 and S20b on main, unreleased.**

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
merged 2026-09-13 as PR #88 → `7f7d136`, follow-ups **#89**. **S20b** (#81, the eight hardening PRs)
merged 2026-09-15 as PR **#101** → **`af8de79`**, follow-ups **#102** and **#103**, and #81 is
closed. `main` is at **`af8de79`** (PR #93, the desk-session docs, merged mid-slice — docs only, no
conflict with any of the eight — is the `68e3414` this baton was first written against).

### S20b — the eight, and what each one turned out to be

| # | item | PR | merged head |
|---|---|---|---|
| 1 | `POST /api/docs/clamp` meets the local-path guard | [#91](https://github.com/matterjd/jigbench/pull/91) | `413284e` (repaired) |
| 2 | the UNC refusal happens before the connection, and the words say only what is true | [#92](https://github.com/matterjd/jigbench/pull/92) | `3c1d5cd` (the one the repairs did not move) |
| 3 | every detected port meets `valid-port.ts` | [#94](https://github.com/matterjd/jigbench/pull/94) | `f70efb5` (repaired) |
| 4 | a clamped root is probed through its target, not the link's spelling | [#95](https://github.com/matterjd/jigbench/pull/95) | `8519803` (repaired) |
| 5 | what a no-Origin GET can still reach (docs only) | [#96](https://github.com/matterjd/jigbench/pull/96) | `3700227` (repaired) |
| 6 | `stop()` does not resolve until the child is gone — and #78's retry is dropped | [#97](https://github.com/matterjd/jigbench/pull/97) | `4fb1fb5` (repaired) |
| 7 | a git that runs out of budget says so | [#98](https://github.com/matterjd/jigbench/pull/98) | `e68833c` (repaired) |
| 8 | the eight small ones, one commit each | [#99](https://github.com/matterjd/jigbench/pull/99) | `64cb09a` (repaired) |

That numbering is the **slice's own**, not issue #81's: items 3 and 4 are swapped between the two,
and the slice's 6 and 8 land elsewhere again. #101's body carries the mapping, and so does the close
comment on #81.

Issue #1 carries the merge record — the eight heads, the block → repair → re-review loop, and the
one windows-latest re-run. Every `## [Unreleased]` CHANGELOG line lands in the same block, so that
hunk needed the **hand-union** the S18 and S20 sets both needed: #101 merged `CHANGELOG.md` under a
temporary `merge=union` attribute, reverted before the push, then deduplicated the block by hand in
its own signed commit.

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

### What the review changed, one line each

One verifier per PR, attackers on the security-adjacent ones. **#91 was blocked**: the route handed
`clampDocs` the *real* spelling and `clampDocs` uses one value for both the walk and what it
records, so under the 8.3/junction mismatch this repo already documents, `relative()` escaped and
every chunk's `file` came back absolute instead of `docs/a.md` — repaired by splitting the two, the
walk through the checked real path, the record and the report keeping the caller's. Six more went
back for one repair each, five of them word narrowings:

- **#94** — the `CHANGELOG.md` lede claimed *every* port detection is bounded, while
  `packages/cli/src/commands/serve.ts:58` and `packages/adapters/web/src/dev-server.ts:18` still
  build a URL from an unbounded one. Narrowed to what it delivers: no path out of `detectDevScript`.
- **#95** — "nothing is probed through a spelling the guard did not see" was false: the guard
  realpaths the **root** only, and `describeEntry` probes five *children* of it, measured returning
  `"hasDocs": true` through a reparse point. Narrowed to the root recheck, with the child depth named.
- **#96** — the `SECURITY.md` GET list called exhaustive omitted `/api/plate` and
  `/api/plate/snapshot/:id`. Both added; the PR's own new test now proves that list is complete.
- **#97** — the behavioural one. `awaitExit` returned as soon as the child was *reaped*, but `close`
  fires later, once the stdio streams have ended, and that gap is the backlog the new test asserts is
  absent — the likely path on win32, the leg whose EBUSY retry this PR removes. The early return is
  gone; `stop()` always awaits `close`.
- **#98** — "git is not on PATH" was printed for every spawn failure that was not our own timeout, so
  EACCES, EMFILE, ENOMEM and EAGAIN all announced a missing binary. Gated on `code === 'ENOENT'`.
- **#99** — "`--no-install` … so npx cannot reach the registry" is refuted by npx itself, which still
  does a manifest lookup. Corrected in the comment, the commit body and the PR body.

The re-review cleared **7 of 7**, and three PR bodies were corrected on GitHub so each record matches
its repaired head. **One CI note, plainly:** an earlier integration head's `test (windows-latest)`
went red on **debt #3**'s timing flake in `orders/service.trialfit.test.ts`; a re-run cleared it and
`a54712a` is green on both legs. That flake is carried into #102 — it wants a fake clock, not another
re-run.

### Four judgement calls, and where each one landed

- **#81 item 8's 415-vs-400 reading.** The bullet says *"a body that is not JSON gets 415 with words,
  not the parser's own 400"*. PR #99 reads that as two clauses: **415** for a body the bench cannot
  read at all (the media type), and *"not the parser's own"* for the **phrasing** of one it can read
  and finds malformed — which keeps 400, the correct HTTP answer for well-typed, ill-formed content.
  Making the malformed case a 415 too is a one-line change if the lead reads it the other way.
  **It merged as written, and the question is carried into #102 as a ruling for Matter.**
- **Item 4 picked "recheck and probe through `real`", not "refuse a mismatched root".** #81 offers
  both. A refusal would turn away every symlinked root, and the item's own acceptance requires
  `entries[].path` to keep the caller's spelling — which a refusal cannot do. The root was already
  rechecked per listing; what was missing was probing through the answer. **Accepted**, and the
  review then found the probes descend two levels below the checked path — that half is #102's.
- **Item 6's windows half is not verified from this seat.** The EBUSY that #78's retry was hiding
  only happens where `taskkill` walks a three-process tree. The retry is **gone** and the `rm` is
  plain, deliberately: with it there a regression in `stop()` would be hidden again. **If
  windows-latest goes red on `runner.test.ts` teardown, that is #97's to answer, not a flake.**
  **Still true after the merge:** both legs are green on `af8de79`, but only a Windows desk can see
  the temp directory come free.
- **Item 5 has no test, and the PR says why.** It changes no behaviour — it corrects what
  `SECURITY.md` and `same-origin.ts` *claim* about behaviour that is already there and already
  tested. What replaced a test was checking every claim against the code first, which is how an
  earlier draft's false line about `/api/setup` writing drafter wiring got caught before it shipped.
  **Accepted**, with the two missing `/api/plate` GETs added in the repair.

### Two cross-PR interactions, and how the integration handled them

1. **#99 (item 8f) gates the bare `angular.json` tier**, and #94 (item 3) has a test that walks that
   tier with no `node_modules`. **Already handled:** a follow-up commit on `fix/detected-ports-bounded`
   (`4b4ea33`) plants `node_modules/.bin/ng` in both fixtures, so those cases passed in either merge
   order. That is why #94's head moved past `c2e1185`, and it merged at `f70efb5` after the repair.
2. **#99 (item 8h) and #92 (item 2) both drop "junction" from `fs/local-path.ts` and the same
   `CHANGELOG.md` entry.** The hunks agree; whichever lands first, the other is a union, not a
   conflict of meaning.

**Both held.** #101 was rebuilt from scratch off `main` against the repaired heads, merged in the
order #92, #91, #94, #95, #96, #97, #98, #99 — #92 first, because it moves the guard every later
path-handling PR builds on. Only #99 conflicted, in five files, and every conflict was resolved by
keeping both sides' intent; nothing was dropped and nothing was refactored.

### Found on the way, not fixed, and still unfiled

`packages/cli/src/commands/serve.ts:58` reads the **same** `angular.json` serve port that #81 item 3
bounds, with the same unbounded `typeof port === 'number'`, and builds `http://localhost:Infinity`
from it. It is a third path, outside item 3's acceptance (scoped to `detectDevScript`), and fixing it
means exporting `isValidPort` from `@jigbench/server`'s public API — `cli` may import nothing else.
That is a widening no item asked for. **#81 is closed and neither #102 nor #103 carries it — filed as
#104 on 2026-09-16 by the eval seat**, together with `packages/adapters/web/src/dev-server.ts:18`,
the third path the #94 review named.

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
paragraph — and **never both at once on `jigbench`**. R0, **S19**, **S20**, **S18** and now **S20b**
are shipped — the S20b row says shipped 2026-09-15, PR #101 `af8de79`, follow-ups #102 #103. Next in
sequence: **S21** issue #23, the three rulings — **Matter has answered them, so S21 is runnable**
→ v0.3, the stacks (S22 React/Next/Vite, S23 Vue/Svelte, S24 Expo
web, S25 server-rendered, S26 OpenAPI) → v0.3, the loop deepens (S27 a real before, S28 the stream
and the logbook, S29 refine and build again, S30 the MCP door) → v0.4. **S22 is the first slice that
can make #71's survey-hint tier live** — and note that #81 item 3 now bounds that hint's port, so an
adapter emitting a `devServer` meets `valid-port.ts` on the way in.

**Debt:** **#23** the three rulings — **answered; S21 writes them in** · **#81** hardening round 2 —
**merged as PR #101 → `af8de79`, closed**, leaving **#102** (round 3, amber: the auto-clamp docs walk
is unguarded at `bench/host.ts:293-297` — the same `clampDocs` walk #91 closed, through a second
door; the folder browser's five probes descend two levels and follow links there; a listing race
measured at 261 of 619 listings; the smaller items; and debt #3's flake) and **#103** (seven small
follow-ups, green tier, one per repaired PR) · **#89** the second retest batch's twelve follow-ups (the Prompts pane's scroll
box is keyboard-unreachable at `PromptsPane.css:146`; two rulings for Matter; a floor gate at
`floor-load-bearing-ink.test.ts:132` that survives having the paint deleted) · **#58** open until the
desk holds Ready with a mouse (`docs/TEST-RUN.md` step 15) · **#64** the browser harness for the
bench · **#62** the git-diff fallback test's race, root-caused with a verified patch in the issue (a
natural pair with **#3**) · **#54** two tests that fail on the desk and pass in CI (a stray `~/.jig`
captures `findRepoRoot` — and the product question under it). This seat is Linux with no `~/.jig` and
no build output under `examples/`, so **both of #54's failures pass here**. Older: #2 pdf-parse native
· #3 trial-fit e2e flake — **it bit again on the S20b integration run** (windows-latest,
`orders/service.trialfit.test.ts`, cleared by a re-run), and it is a line on #102 · #4 esbuild advisory · #5 karma qs · #6 the legacy log does not survive a
re-read. Seen once in CI and never root-caused: `plate/proxy.test.ts` letting an interceptor
short-circuit the proxy on ubuntu (run 34174031120 attempt 1; green on the re-run). **#24 and #37 are
closed.** **Filed as #104 (2026-09-16):** the card's built message says *"flip before"*, naming a
switch #8 removed.

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

**Matter owes the desk:** ~~the three rulings in #23~~ **answered — S21 is runnable** · the two rulings
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

**→ Next session: the frontier is S21 — `docs/team/cloud/04-rulings.md`, issue #23, and Matter has
answered the three rulings, so it is runnable now.** Run it either way: from the **command-center
launcher on the desk**, pasting the prompt with its first paragraph swapped for the **DESK seat
line** in `docs/team/cloud/README.md` § *Desk sessions* (the READ list and everything after it stay
word for word), or as a cloud paste with the remote seat line as written — **never both at once on
`jigbench`**. After S21, **#103** (green tier — seven small follow-ups, one per repaired PR, merge on
green CI) and **#102** (amber, and its cloud prompt still has to be written, in the shape of
`03b-hardening-round-2.md`) each run as their own slice. Then the stacks: `05-adapter-react.md`
(S22) is the slice that makes #71's survey-hint tier live, so read that PR and S20b's item 3 before
writing an adapter's `devServer`. **#73** (Point like the inspector) comes after S28. **#64** (the
browser harness) waits on a ruling — it carries the sub-720 clipping call with it — and **#89** waits
on Matter's two rulings and the desk's re-run of `docs/TEST-RUN.md`.**
