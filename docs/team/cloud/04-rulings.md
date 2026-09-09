# 04 · S21 · issue #23, the three rulings
**Tier** ruling (Matter answers first) · **Depends on** R0 · **Expected PRs** 0 on the first run, then 1 per ruling · **Roadmap row** S21

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

**STEP ONE, BEFORE ANY CODE: this is a ruling slice. Print the questions and build nothing.** Read
first, then post one comment on issue #23 laying out the three questions and their options, each
with what it costs and what it breaks, and stop there. If issue #23 already carries Matter's
answers, skip to step two.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S21) · **issue #23, the whole body** ·
`docs/design/AMENDMENT-1-the-simplification.md` §3, §4 and §7 · `docs/design/COMMISSION.md` §3 (the
words; "seed", "recording", "work order" and "open the bench" are banned on any surface) ·
`docs/team/v0.2/CHASSIS.md` · `docs/TEST-RUN.md` around line 211 ·
`packages/server/src/bench/host.ts` (what a runtime bench mounts, and what it does not) ·
`packages/cli/src/commands/serve.ts` · `packages/bench/src/chassis/AdvancedDrawer.tsx` · closed
issue #8.

THE THREE QUESTIONS, with the options as the code has them today:

1. **Advanced on the Clamp path.** A bench created at runtime mounts prompts, plate, fixtures,
   sketches and docs, but not toolpath, orders or trialfit. The Advanced drawer still renders the
   Toolpath panel, and `docs/TEST-RUN.md` tells the user to record and replay a toolpath after
   `npx jigbench` from a folder with no repo. That step cannot pass. Options: (a) mount the three on
   the host, the stores exist; (b) hide the panels in words on that path, as the mirror line already
   does, and cut the TEST-RUN step; (c) document that Advanced needs `--repo` for 0.2.x. Say what
   each costs before Matter picks.
2. **The step into the bench.** AMENDMENT 1 §7 and `docs/team/v0.2/REMOTE-KICKOFF.md` use "Open",
   the build says "go to the bench", and the tongue bans "open". `serve.ts` line 95 still prints the
   banned form outside the tongue gate. Options: (a) ratify the build's words, amend the two doc
   lines and fix `serve.ts`; (b) change the build to the doc's word, which the tongue forbids, so
   this option needs the tongue amended too.
3. **The before controls.** Issue #8 closed by removing them, while AMENDMENT 1 §3 and §4 and
   `docs/team/v0.2/CHASSIS.md` still rule them on. Options: (a) annotate the amendment to say the
   before returns with roadmap slice S27 and leave the build alone; (b) reopen #8 and build it now,
   which is S27 brought forward.

STEP TWO, only after Matter has answered in issue #23. One branch and one PR per ruling,
`fix/ruling-<n>-<slug>`:
- The ruled words land in the docs they contradict AND in the code they name. A doc that still says
  the old thing is the defect this slice exists to remove.
- `packages/bench/src/tongue.test.ts` and the `floor-*.test.ts` files stay green. If ruling 2 goes
  to option (a), add the case that would have caught `serve.ts` line 95.
- If ruling 1 goes to option (a), the mount is test-first: a host test asserting the three routes
  answer on a runtime bench. If it goes to (b) or (c), the TEST-RUN step goes with it, and the
  drawer says why in words.
- `CHANGELOG.md` gets an `## [Unreleased]` line per ruling. Close #23 when all three have landed,
  and change the S21 row in `docs/ROADMAP.md` to say shipped.

Do NOT: guess an answer; build any part of a ruling Matter has not given; change the tongue on your
own; touch `examples/` source, `QUALITY.md` or `docs/quality/`; rewrite pushed history.

HOW WORK LANDS: one branch per ruling, test-first with the red line quoted in the commit body,
`git commit -s` (DCO), push, open a PR whose body is a worker report (what changed, the red line,
how it was verified, what you did not do). Both CI legs, Windows and Ubuntu, green at the PR head,
then merge. Record every merge on issue #1 with the sha and the CI run id. Never `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. If you stopped at step one, say so plainly and refresh
nothing. The last line of your final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
