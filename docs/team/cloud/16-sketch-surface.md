# 16 · I3 · the Sketch sheet as a real design surface
**Tier** ruling (Matter decides first) · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I3

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary.

**STEP ONE, AND THE ONLY STEP UNTIL MATTER ANSWERS: this is a ruling slice. Print the questions and
build nothing.** No branch, no PR, no code.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I3, under "ideas to rule on, not
commitments") · `docs/design/AMENDMENT-1-the-simplification.md` §4 (Sketch: the sheet with real
snapping, five primitives, the app's own gauges, and a sketch is a prompt target: build this screen)
· `docs/design/COMMISSION.md` §3 (sketch is a screen that does not exist yet, drawn with the gauges;
"wireframe" and "mockup" are banned on any surface) · `packages/bench/src/sketch/` in full ·
`packages/server/src/sketch/` · `packages/core/src/sketch.ts` · `docs/USING.md` §Sketch.

THE QUESTIONS. Open a new issue titled "ruling needed: is Sketch a design surface or a pointing
surface", or comment on it if it already exists, and lay these out against what the code does today:

1. Sketch snaps, draws with the app's gauges, and a sketch can be a prompt target. Should it become
   a place you design, with more primitives, layers and reuse? Or should it stay a place you point
   at, and everything else be left to a real design tool?
2. If it grows: what is the smallest addition that would change how Matter works, and what does it
   cost the quiet default view (ruling A3 says the loop only)?
3. If it stays: is anything currently on the sheet more than pointing needs, and should it go behind
   Advanced?
4. Either way, what does a sketch hand to Build that a written requirement does not?

Then STOP. Say in your final message that the questions are posted and nothing was built. Do not
draw a proposal, and do not add a primitive to see how it feels.

STEP TWO exists only after Matter answers, and only if he says build. Then it is a normal slice: one
branch, test-first with the red line quoted in the commit body, `git commit -s` (DCO), a PR in the
worker-report shape, both CI legs green at the PR head, AMBER, so the lead reviews and merges.
`packages/bench/src/floor-*.test.ts` and `tongue.test.ts` stay green throughout.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; put anything new on the
default view; rewrite pushed history.
----8<---- to here ----8<----
