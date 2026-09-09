# 11 · S28 · the build stream and the logbook
**Tier** green (merge on green CI) · **Depends on** R0 · **Expected PRs** 2, the status line then the drawer · **Roadmap row** S28

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, and
that fake is how you drive a build end to end.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S28) ·
`docs/design/AMENDMENT-1-the-simplification.md` §4 (the status line's exact readings, and that
nothing else sits on that line) · `docs/design/COMMISSION.md` §3 (the words: Claude, logbook, bench,
plate) · `packages/core/src/build.ts` (`BuildStreamEvent`, `ClaudeStatus`, `buildStreamLine`) ·
`packages/server/src/build/runner.ts`, `stream-parser.ts` and `types.ts` (what the runner actually
emits) · `packages/server/src/target/runner.ts` (the app's own log) ·
`packages/bench/src/chassis/StatusLine.tsx` · `packages/bench/src/logbook/LogbookDrawer.tsx` and
`useLogbook.ts`.

THE FRONTIER, in order. Two PRs:

1. **The status line reads the stream.** `Claude · idle`, then `building · 00:42 · editing
   invoice-list.html`, then `built · 3 files · 1m 12s`. The elapsed time ticks from the real stream,
   and the file named is the one the stream last said was being edited. Red first: a component test
   driving a sequence of real `BuildStreamEvent` values, taken from what the runner emits and not
   invented, asserting each reading in turn. Build the fixture stream from `stream-parser.ts`'s own
   output, not from a hand-written guess.
2. **A cancelled build reads as cancelled.** Never as built. Red first: cancel mid-stream and assert
   the reading.
3. **The drawer filters.** human, Claude, bench and app, and Esc closes it. The drawer is fed by the
   build stream and the target's own log. Red first: a component test with entries of all four
   kinds, asserting each filter shows exactly its own and that Esc closes.
4. **The floor.** One status line, nothing else on it. `packages/bench/src/floor-*.test.ts` and
   `tongue.test.ts` stay green.

DOCS, in the PR that ships each: `docs/USING.md` §The logbook and §Build say what the line reads and
what the filters do. `CHANGELOG.md` gets an `## [Unreleased]` entry per PR. `docs/TEST-RUN.md` Part
2 gains the reading the desk should see during a build. Change the S28 row in `docs/ROADMAP.md` to
say shipped when both merge.

Do NOT: add anything else to the status line; change the `BuildStreamEvent` shape without saying why
in the PR body and updating `packages/core/src/build.ts`'s tests; write a fixture stream by hand
when the parser can produce one; touch `examples/` source, `QUALITY.md` or `docs/quality/`; rewrite
pushed history.

HOW WORK LANDS: one branch per PR (`delegate/build-status-line`, `delegate/build-logbook-filters`),
test-first with the red line quoted in the commit body, `git commit -s` (DCO), push, open a PR whose
body is a worker report (what changed, the red line, how it was verified, what you did not do). Both
CI legs, Windows and Ubuntu, green at the PR head, then merge it yourself. Record every merge on
issue #1 with the sha and the CI run id. If a push run on main goes red, root-cause it the same day
as its own PR. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
