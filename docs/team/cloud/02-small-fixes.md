# 02 · S19 · issue #24, the small fixes
**Tier** green (merge on green CI) · **Depends on** R0 · **Expected PRs** 11 to 12, one per item · **Roadmap row** S19

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S19) · `AGENTS.md` (the boundary
rules) · `docs/design/AMENDMENT-1-the-simplification.md` (rulings A1 to A6, they bind) ·
`docs/design/COMMISSION.md` §3 (the words; "seed", "recording", "work order" and "open the bench"
are banned on any surface) · **issue #24, the whole body** · issue #1's last few comments (the shape
your merge comments must take).

THE FRONTIER. Issue #24 lists eleven small defects. One branch, one PR, one merge each, in this
order (cheapest first, so the record grows early):

1. `packages/server/src/target/runner.ts`: strip ANSI escapes before broadcasting `target-log`, so
   the app's own log does not show `[33m` in the Clamp screen or the drawer. Red first: a runner
   test feeding a line with escapes and asserting the broadcast line is clean.
2. `packages/server/src/fs/route.ts`: the folder browser lists Windows hidden and system folders at
   a drive root. Honour the hidden and system attributes on win32, not just the dot prefix. Red
   first: a route test with a fixture entry carrying those attributes, skipped off win32.
3. `packages/bench/src/App.tsx`: gate the `GET /api/plate` and `GET /api/prompts` polls on
   `state.bench`, so a bench with nothing clamped logs no 404s. Red first: a component test that
   asserts neither request is made when `bench` is null.
4. `--plate-port` is ignored on the Clamp path. Either pass `platePort` from
   `packages/cli/src/commands/serve.ts` into the host, or correct `README.md` and
   `docs/TEST-RUN.md`, which both promise 4601. Prefer passing it. Red first: a host test asserting
   the plate binds the port it was given.
5. `packages/server/src/bench/host.ts`: unclamp and re-clamp wait on an in-flight build for up to
   its 30 minute cap, and drop the cancel route first. Cancel before draining, and add a generation
   counter so a late target-up or a late clamp cannot write into the next bench. Red first: a host
   test that clamps, starts a fake long build, unclamps, and asserts it returns quickly and that the
   late event is dropped.
6. `packages/server/src/prompts/store.ts` still carries two check-then-read windows of the kind PR
   #15 fixed only in `loadAll`: lines 109 to 110 in `hasAnyPromptFile` (`pathExists` on
   `.jig/prompts/`, then the listing) and lines 121 to 125 in `migrateIfNeeded` (`pathExists` on
   `.jig/work-orders/`, then `hasAnyPromptFile` and the listing). And
   `packages/server/src/mcp/prompt-tools.ts` starts the store unawaited with no `.catch`. Red first:
   the ENOENT shape `store.enoent.test.ts` already uses.
7. `packages/cli/src/version.test.ts` skips in CI because `npm test` runs before `npm run build`.
   Assert `--version` in `scripts/npx-control.sh` instead, and delete the skip.
8. The status line says "Claude · not installed" before any repo is clamped, but it means the
   `.mcp.json` registration. Say "not registered", or show nothing until a bench exists.
9. `packages/bench/src/App.tsx` shows the empty bench for a frame before the Clamp screen. Gate on
   `state === null`.
10. The CLI prints a Node `util._extend` deprecation on stderr at start, from http-proxy. Silence it
    or upgrade the dependency.
11. Wording and stale citations, one PR for all of them: `ClampScreen.tsx` swallows a failed setup
    read, `FolderBrowser.tsx` says "nothing here but files" after a failed read, `SetupSteps.tsx`'s
    stop button has no words, `CONTRIBUTING.md` points at the v0.1 plan.
12. Also fix, and say in the PR that it came from issue #1 rather than #24: the unhandled
    `write EPIPE` from `packages/server/src/build/runner.ts` when the child exits before reading
    stdin. An `error` listener on `child.stdin`, or the write inside a try.

DOCS: `CHANGELOG.md` gets an `## [Unreleased]` section with one line per fix. Update `README.md` or
`docs/TEST-RUN.md` in the PR that changes what they describe (items 4 and 8 do). When the last item
merges, tick #24's boxes, close it or refile the leftovers as their own issues, and change the S19
row in `docs/ROADMAP.md` to say shipped.

Do NOT: take on issue #37 (that is S20) or the #23 rulings (S21); touch `examples/` source,
`QUALITY.md` or `docs/quality/`; widen any fix into a refactor; rewrite pushed history.

HOW WORK LANDS: one branch per item (`fix/<slug>`), test-first with the red line quoted in the
commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what changed, the
red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu, green at the
PR head, then merge it yourself. Record every merge on issue #1 with the sha and the CI run id, the
way the record reads today. If a push run on main goes red, root-cause it the same day as its own
PR. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change repository visibility.

CLOSE: a docs PR refreshing `HANDOFF.md` (seat Delivery, what is on main, what is still open, what
Matter owes). The last line of your final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
