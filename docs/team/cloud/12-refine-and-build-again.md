# 12 · S29 · refine and build again
**Tier** amber (the lead reviews before merge) · **Depends on** S28 · **Expected PRs** 2 to 3 · **Roadmap row** S29

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, and
that fake is how you drive two builds in a row.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S29) ·
`docs/design/AMENDMENT-1-the-simplification.md` §2 and §3 (the loop: look at it, refine the
requirement, go again; and the states draft, ready, building, built, plus scrapped) ·
`docs/design/COMMISSION.md` §3 (the words) · `packages/core/src/prompt.ts` and
`packages/core/src/ladder.ts` (the states and which moves are legal) ·
`packages/core/src/work-order.ts` (`parseWorkOrder`, and issue #6: the log does not round-trip) ·
`packages/server/src/prompts/service.ts`, `store.ts` and `route.ts` ·
`packages/server/src/build/runner.ts` and `git-diff.ts` (what a build records) ·
`packages/bench/src/prompts/PromptsPane.tsx`, `PromptCard.tsx` and `usePrompts.ts` · issue #6.

THE FRONTIER, in order:

1. **Back to draft, with the history kept.** A built Prompt can be refined: it returns to draft and
   keeps every build it has already had. Add the move to the ladder if it is not legal today, and
   say in the PR body which moves you added. Red first: a ladder test for the new move, and a
   service test asserting the earlier build survives the move.
2. **The second build records its own.** Files touched and transcript per build, not one set
   overwritten. Red first: two builds through the fake `claude`, asserting two records with
   different contents.
3. **The diff of diffs.** The bench shows the second build's diff against the first, not against the
   original tree. Red first: a test with two known builds asserting the range that is diffed. Say in
   the PR body, in one sentence, what the range is.
4. **The log round-trips (this closes issue #6).** A prompt file read back from disk keeps its log
   entries, so an elapsed timer does not freeze after a re-read. Red first: a golden round-trip test
   in `packages/core`, written the way `work-order.golden.test.ts` is written.
5. **The floor.** Nothing new on the status line, nothing new on the default view beyond what the
   prompt card already holds. `packages/bench/src/floor-*.test.ts` and `tongue.test.ts` stay green.

DOCS, in the PR that ships each: `docs/USING.md` §Built and §Prompts describe refining and building
again. `docs/TEST-RUN.md` Part 2 gains the second lap of the loop. `CHANGELOG.md` gets an
`## [Unreleased]` entry per PR. Close #6 with the PR that fixes it. Change the S29 row in
`docs/ROADMAP.md` to say shipped when the last PR merges.

Do NOT: change what the prompt file looks like on disk without a golden test proving the old files
still parse; delete a build's record to make room for the next; add a version control feature (this
is a diff of two builds, not history browsing); touch `examples/` source, `QUALITY.md` or
`docs/quality/`; rewrite pushed history.

HOW WORK LANDS: one branch per PR (`delegate/build-refine-<slug>`), test-first with the red line
quoted in the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report
(what changed, the red line, how it was verified, what you did not do). Both CI legs, Windows and
Ubuntu, green at the PR head. THIS SLICE IS AMBER: do not merge. Post each PR link and its CI run id
on issue #1 for the lead's review. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change
visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
