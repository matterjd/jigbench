# 03b · S20b · issue #81, hardening round 2
**Tier** amber (five items sit on the path guards) · **Depends on** S20 · **Expected PRs** 8 · **Roadmap row** S20b

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S20b) · `AGENTS.md` · `SECURITY.md` ·
**issue #81, the whole body** · issue #1's comment of 2026-09-12 (the S20 merge and what the lead's
review left) · `packages/server/src/fs/local-path.ts` and `fs/unc-path.ts` (the one guard) ·
`packages/server/src/fs/route.ts`, `bench/validate-clamp-path.ts` and `setup/route.ts` line 165 (its
three callers, one of which does not call it) · `packages/server/src/valid-port.ts`.

THE FRONTIER, in order. One branch (`fix/<slug>`) and one PR each:

1. **`POST /api/docs/clamp` reads whatever it is handed.** `setup/route.ts:179` refuses only the UNC
   SPELLING, so a symlink or junction inside the home carries a share past it and `clampDocs` walks
   it. Call `checkLocalPath` there, before any read, and hand `clampDocs` the checked spelling.
   Thread a test-only `realpath` option the way `FsRouteOptions` already does.
   Red first: in `setup/route.test.ts`, an injected `realpath` answering a UNC target for a locally
   spelled folder, expecting 400 with `UNC_REFUSED_MESSAGE` and `clampDocs` never called.
   Acceptance: the three routes answer the same input with the same refusal in the same words.
2. **The UNC refusal happens before the connection, and the words say only what is true.**
   `fs/local-path.ts:48` judges the raw string, but the `realpath` at line 55 is itself the SMB open
   when a local spelling points at a share, and a resolved `\\?\UNC\host\share` reaches it too.
   Refuse the `\\`, `//` and `\\?\UNC` prefixes on the raw string AND on the resolved path BEFORE
   `realpath` runs; keep the post-`realpath` check behind it. Then correct every sentence that
   claims the guard precedes any filesystem call: `fs/local-path.ts:8-25`, `fs/route.ts:130-134`,
   `bench/validate-clamp-path.ts:29-30`, `CHANGELOG.md:85-93`.
   Red first: `local-path.test.ts` cases for both new spellings, each with a `realpath` spy.
   Acceptance: the spy answers zero calls for every refused spelling, the check gives the same
   answer on both CI legs, and no sentence left in the tree promises a refusal that lands late.
3. **Every detected port meets `valid-port.ts`.** #70 bounds a request body's `port`; `detect.ts:96`
   still takes one out of `angular.json` and `detect.ts:76` out of a survey hint, so `1e999` from
   either spawns the app and burns the 120 second probe. Put both through `isValidPort` and treat an
   out-of-range value as no configured port, falling through to the tier below.
   Red first: two `detect.test.ts` cases, an `angular.json` carrying `"port": 1e999` and a hint
   `{script:'start', port:1e999}`, each expecting a bounded port.
   Acceptance: no path out of `detectDevScript` answers with a port `isValidPort` rejects, and one
   test walks every tier to say so.
4. **A clamped root keeps the link's spelling, not its target.** `fs/route.ts:173` builds each child
   from `target`, and `describeEntry` (lines 77-89) probes `.git`, `package.json`, `angular.json`,
   `docs` and `*.csproj` through it, so a link re-pointed after the check is followed with nothing
   looking again. Pick one and carry it through: recheck the root on every listing and probe through
   `real`, or refuse a root whose `resolved` and `real` differ.
   Red first: a listing whose injected `realpath` moves between two calls, expecting the second call
   to refuse or to probe the new target.
   Acceptance: `describeEntry` never touches the filesystem through a spelling the guard did not
   check, and `entries[].path` still reads back in the caller's own spelling.
5. **What a no-Origin GET can still reach.** `SECURITY.md:18-30` is true and still leaves a reader
   believing a foreign page cannot reach an `/api` GET. It can: an `<img>`, a `<script>` or a plain
   navigation sends no `Origin`, and `same-origin.ts:94` lets an absent one through because curl and
   MCP clients send none. Say that plainly, name what such a GET reaches (state, the survey, folder
   names under `/api/fs/list`) and what it cannot do (no writes, and the browser withholds the body
   from the page that asked). Docs only; `same-origin.ts`'s own doc comment moves with it.
   Red first: none, and the PR body says why this one has no test.
   Acceptance: `SECURITY.md` and the code say the same thing about every method.
6. **`stop()` returns before the child is gone.** `target/runner.ts:249-262` clears `this.child`,
   awaits `killTree`, and returns; `killTree` resolves when `taskkill` exits, not when the target
   does, so the temp directory can still be held. Await the child's `close` event under a bounded
   wait, then drop #78's retry at `target/runner.test.ts:206-211`.
   Red first: a runner test asserting the child has exited by the time `stop()` resolves, with a
   plain `rm` and no `maxRetries` to hide it.
   Acceptance: the retry is gone from that file and both legs are green without it.
7. **A git that runs out of budget says so.** `build/git-diff.ts:64` aborts the child and
   `gitStatusSnapshot` (line 142) answers `null`, which the caller reads as no diff information and
   tells nobody. Emit one line in words on the build stream and into the logbook's rows, distinct
   from "not a git working tree" and from "git is not on PATH". The words belong in
   `packages/core/src/build.ts`'s `buildStreamLine`; `build/runner.ts` is the caller. A `text` event
   or a new kind, your call, as long as the three cases read differently.
   Red first: a fake git that never exits, asserting the line reaches the stream.
   Acceptance: the three reasons a snapshot can be `null` are three sentences, one test each.
8. **The small ones**, one PR, one commit per bullet:
   - `plate/PlateBench.test.tsx:120-128` is PR #32's comment and it misdescribes the race: the
     listener is attached, holding the previous commit's null `plateOrigin`. Correct it, and check
     `App.test.tsx:86-90` against the same mechanism.
   - #72 left one `target/route.test.ts` title saying the opposite of its body. Rename it.
   - `detect.ts`'s `isRunnableScriptName` (line 126): reject a name starting with `-` and cap its
     length, on every platform, not only win32.
   - `same-origin.ts:82` accepts `https:`. Require `http:`, refuse an empty `Origin` header, and pin
     `Origin: null` in a test.
   - `http.ts:218`: a body that is not JSON gets 415 with words, not the parser's own 400.
   - `detect.ts:213` runs `npx ng serve`, which fetches `ng` from the registry when the repo has no
     local install. Pin it to the repo's own `node_modules/.bin/ng`, or decline the tier and say so.
   - `fs/local-path.ts:56-59` gives EPERM the words meant for ENOENT. Separate them.
   - A Windows junction cannot target a UNC share; the threat is a symlink. Fix that sentence in
     `fs/local-path.ts:9-12` and `CHANGELOG.md:85-93`.
   Red first: a test per bullet that fails without it, except the two prose corrections.
   Acceptance: the PR body lists which bullets a test holds and which are words only.

DOCS: `CHANGELOG.md` gets one line per item under `## [Unreleased]`. `SECURITY.md` moves with item
5. When the last PR merges, close #81 and change the S20b row in `docs/ROADMAP.md` to say shipped.

Do NOT: take on **issue #89** (the retest round 2 follow-ups: the Prompts pane's scroll box, the
floor gate that stays green with the paint deleted, the two rulings Matter owes, and nine smaller
items). It is a separate slice and none of it is yours. Do not widen a guard to make a test pass; do
not touch `examples/` source, `QUALITY.md` or `docs/quality/`; do not rewrite pushed history.

HOW WORK LANDS: one branch per item, test-first with the red line quoted in the commit body,
`git commit -s` (DCO), push, open a PR whose body is a worker report (what changed, the red line,
how it was verified, what you did not do). Both CI legs, Windows and Ubuntu, green at the PR head.
THIS SLICE IS AMBER: do not merge. Post each PR link, its head sha and its CI run id on issue #1 as
it opens, for the lead's review. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change
visibility.

CLOSE: one comment on issue #1 listing every PR with its sha, run id and state, then a docs PR
refreshing `HANDOFF.md`. The last line of your final message is a one-sentence handoff for the next
hand.
----8<---- to here ----8<----
