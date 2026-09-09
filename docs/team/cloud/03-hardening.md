# 03 · S20 · issue #37, the hardening items
**Tier** amber (two items touch the security gates) · **Depends on** R0 · **Expected PRs** 6 to 8 · **Roadmap row** S20

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S20) · `AGENTS.md` · `SECURITY.md` ·
`docs/design/COMMISSION.md` §3 (the words) · **issue #37, the whole body** · issue #1's comments on
#18, #35 and #36 (the two Host gates and how they were tested) ·
`packages/server/src/same-origin.ts` and `same-origin.test.ts` (the gate itself) ·
`packages/server/src/http.ts` and `packages/server/src/bench/host.ts` (the two callers).

THE FRONTIER, in order. Each item is its own branch and PR, except where noted:

1. **The Origin sentence.** `SECURITY.md:21` says a present `Origin` must match on every request,
   but `http.ts` and `bench/host.ts` skip the check on GET, HEAD and OPTIONS. Decide one of the two:
   enforce Origin on GET at both gates, or correct the sentence to say what the code does and why
   (the browser's own CORS keeps a foreign page from reading those responses). Whichever you pick,
   `SECURITY.md` and the code must say the same thing when you are done. Red first if you enforce:
   a GET with a foreign Origin expecting 403 at both gates.
2. **Bound `port`.** `POST /api/target/start` and `POST /api/clamp` accept `1e999`, which spawns the
   app and burns the 120 second probe. Require an integer 1 to 65535, 400 otherwise, with words that
   say what was wrong. Red first: `target/route.test.ts` and the clamp route's test, each sending
   `1e999` and expecting 400.
3. **The survey-hint tier.** `packages/server/src/target/detect.ts` line 148 bypasses
   `packageJsonScriptNames`. It is unreachable today only because `SurveySchema` strips a top-level
   `devServer`. Route that tier through the allowlist before any adapter can emit one. Red first: a
   detect test handing in a survey hint naming a script the repo does not have.
4. **Script charset on win32.** A repo's own script key can carry metacharacters (`"start&calc"`)
   and still split under cmd.exe. Charset-check accepted names on win32 to letters, digits, `-`,
   `_`, `:` and `.`. Also change the #17 test payload to `start&calc.exe`; the spaced form never
   injected, so the old test proved less than it looked.
5. **Realpath before stat**, one PR for both: `packages/server/src/fs/route.ts` line 137 and
   `packages/server/src/bench/validate-clamp-path.ts` line 30. A symlink inside the home pointing at
   a UNC target passes the lexical guard. Red first: a test that plants a symlink and expects the
   refusal both spellings already give.
6. **Git timeout.** `packages/server/src/build/git-diff.ts` line 15 spawns git with no timeout, so a
   hung git blocks `start()` forever. Give it the runner's budget. Red first: a fake git that never
   exits, asserting the call gives up.
7. **The ENOENT guard.** `packages/server/src/prompts/store.ts` line 135 swallows a write ENOENT as
   well as a read one, which drops the migration-skip record the code promises. Narrow the guard to
   the read. Red first: a write ENOENT expecting the record to survive.
8. **The five test gaps**, one PR: no test re-renders the selector table, so the ref refresh behind
   #19 is unpinned; the #20 "keeps the URL field" test never asserts the URL field; the production
   `new OllamaDrafter()` path in `createBench` has no vitest; the #17 no-scripts 400 message wording
   is never asserted. Each new test must fail if the fix it covers is reverted. Prove that: revert
   the line locally, watch it go red, restore it, and quote both in the PR body.

DOCS: `CHANGELOG.md` gets an `## [Unreleased]` section with one line per item. `SECURITY.md` moves
with item 1. When the last item merges, close #37 and change the S20 row in `docs/ROADMAP.md` to say
shipped.

Do NOT: widen a gate to make a test pass; take on issue #24 (that is S19); touch `examples/` source,
`QUALITY.md` or `docs/quality/`; rewrite pushed history.

HOW WORK LANDS: one branch per item (`fix/<slug>`), test-first with the red line quoted in the
commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what changed, the
red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu, green at the
PR head. THIS SLICE IS AMBER: do not merge. Post each PR link and its CI run id on issue #1 for the
lead's review. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: one comment on issue #1 listing every PR with its run id and state, then a docs PR refreshing
`HANDOFF.md`. The last line of your final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
