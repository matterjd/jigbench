# 16 · I3 · the Sketch sheet as a real design surface
**Tier** ruling (Matter decides first) · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I3

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I3, under "ideas to rule on, not
commitments") · `docs/design/AMENDMENT-1-the-simplification.md` §4 (Sketch: the sheet with real
snapping, five primitives, the app's own gauges, and a sketch is a prompt target: build this screen)
· `docs/design/COMMISSION.md` §3 (sketch is a screen that does not exist yet, drawn with the gauges;
"wireframe" and "mockup" are banned on any surface) · `packages/bench/src/sketch/` in full ·
`packages/server/src/sketch/` · `packages/core/src/sketch.ts` · `docs/USING.md` §Sketch.

THE FRONTIER.

1. **Stop and print the ruling questions for Matter; do not build until they are answered in the
   issue.** No branch, no PR, no code. Read the files above, then open a new issue titled "ruling
   needed: is Sketch a design surface or a pointing surface", or comment on it if it already
   exists, and lay the questions below out against what the code does today. Then STOP, and say in
   your final message that the questions are posted and nothing was built. Do not draw a proposal,
   and do not add a primitive to see how it feels. The questions:
   - Sketch snaps, draws with the app's gauges, and a sketch can be a prompt target. Should it
     become a place you design, with more primitives, layers and reuse? Or should it stay a place
     you point at, and everything else be left to a real design tool?
   - If it grows: what is the smallest addition that would change how Matter works, and what does
     it cost the quiet default view (ruling A3 says the loop only)?
   - If it stays: is anything currently on the sheet more than pointing needs, and should it go
     behind Advanced?
   - Either way, what does a sketch hand to Build that a written requirement does not?
2. **Only after Matter answers, and only if he says build.** Then it is a normal slice, and it is
   AMBER. `packages/bench/src/floor-*.test.ts` and `tongue.test.ts` stay green throughout. If his
   answers are already in the issue when you open this prompt, the session continues from here
   under HOW WORK LANDS below.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; put anything new on the
default view; rewrite pushed history.

HOW WORK LANDS (step 2 only): one branch (`delegate/build-i3`), test-first with the red line quoted
in the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what
changed, the red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu,
green at the PR head — then the LEAD reviews and merges, because this row is amber: do not merge it
yourself. Record every merge on issue #1 with the sha and the CI run id, the way the record reads
today. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change repository visibility.

CLOSE: a docs PR refreshing `HANDOFF.md` (seat Delivery, what is on main, what is still open, what
Matter owes). If you stopped at step 1, say so plainly and refresh nothing. The last line of your
final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
