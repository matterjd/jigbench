# 10 · S27 · a real before for a built Prompt
**Tier** amber (the lead reviews before merge) · **Depends on** S21 ruling 3 · **Expected PRs** 1 to 2 · **Roadmap row** S27

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

**FIRST, CHECK THE RULING.** This slice depends on ruling 3 of issue #23. Read that issue. If Matter
has not answered it, stop and say so: build nothing.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S27) · closed issue #8 (why the
switch was removed) · issue #23 ruling 3 · `docs/design/AMENDMENT-1-the-simplification.md` §3 and §4
(the mirror is Advanced, and Built shows the app with the before one click away) ·
`docs/design/COMMISSION.md` §3 (the words: Built, not "diff" or "preview") ·
`packages/server/src/trialfit/` in full (`snapshot.ts`, `sanitize-snapshot.ts`, `mirror.ts`,
`route.ts`: the snapshot machinery exists and is keyed the old way) · `packages/core/src/prompt.ts`
(the Prompt model and its states) · `packages/bench/src/trialfit/TrialFitMirror.tsx` and
`useAutoSnapshot.ts` · `packages/bench/src/prompts/useReadyHold.ts` and `PromptCard.tsx` (Ready is
the held gesture, about 800 ms) · `packages/bench/src/chassis/AdvancedDrawer.tsx`.

THE FRONTIER, in order:

1. **Key the snapshot by prompt.** The snapshot machinery is keyed by the old artifact, not by a
   Prompt. Re-key it to a prompt id, migrating or ignoring old keys as the code makes cheapest, and
   say in the PR which you chose. Red first: a server test taking a snapshot for a prompt id and
   reading it back.
2. **Take it at Ready.** Holding Ready takes the snapshot. Not at draft, not at Build: Ready is the
   moment the app is still the way the requirement describes. Red first: a test that holds Ready and
   asserts a snapshot exists for that prompt, and a second that asserts a draft has none.
3. **Show it under Advanced.** `TrialFitMirror` shows that prompt's snapshot beside the app after
   the build. Red first: a component test with a built prompt that has a snapshot, and one with a
   built prompt that has none.
4. **The empty case, in words.** With no snapshot the mirror says so plainly and shows no empty
   frame, and a build is never blocked by a missing snapshot. Red first: both assertions.
5. **The floor.** `packages/bench/src/floor-*.test.ts` and `tongue.test.ts` stay green. The mirror
   is Advanced and stays Advanced: nothing here may put a second frame on the default view.

DOCS, in the same PR: `docs/USING.md` §Built gains the before in one line. `docs/TEST-RUN.md` Part 3
gains the step the desk should walk. `CHANGELOG.md` gets an `## [Unreleased]` entry. If ruling 3
went to the annotate option, `docs/design/AMENDMENT-1-the-simplification.md` and
`docs/team/v0.2/CHASSIS.md` are already annotated by S21: check, and say in the PR that you checked.
Change the S27 row in `docs/ROADMAP.md` to say shipped when the PR merges.

Do NOT: put the mirror or a before control on the default view; build a pixel diff or a video
export; take a snapshot automatically at any moment other than Ready; touch `examples/` source,
`QUALITY.md` or `docs/quality/`; rewrite pushed history.

HOW WORK LANDS: one branch (`delegate/build-a-real-before`), test-first with the red line quoted in
the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what changed,
the red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu, green at
the PR head. THIS SLICE IS AMBER: do not merge. Post the PR link and its CI run id on issue #1 for
the lead's review. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
