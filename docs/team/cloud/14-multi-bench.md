# 14 · I1 · multi-bench
**Tier** ruling (Matter decides first) · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I1

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary.

**STEP ONE, AND THE ONLY STEP UNTIL MATTER ANSWERS: this is a ruling slice. Print the questions and
build nothing.** No branch, no PR, no code. Read, then write the questions into the tracker, then
stop and report.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I1, under "ideas to rule on, not
commitments") · `docs/design/COMMISSION.md` §3 (bench is one workspace per clamped repo) ·
`docs/design/AMENDMENT-1-the-simplification.md` (rulings A1 to A6) ·
`packages/server/src/bench/host.ts` and `bench.ts` (one Bench per repo root, created and torn down
on clamp and unclamp: this is the shape the idea would change) ·
`packages/server/src/bench/recent.ts` · `packages/bench/src/clamp/ClampScreen.tsx` ·
`packages/core/src/bench-state.ts`.

THE QUESTIONS. Open a new issue on matterjd/jigbench titled "ruling needed: multi-bench (two repos
clamped at once)", or comment on it if it already exists, and lay these out with what each costs in
the code you just read:

1. Two repos clamped at once, a front end and its API, on one bench. Is the boundary one bench per
   repo, with a way to point at a second, or one bench per product that clamps several repos?
2. Which surfaces would have to change, and which would not? Name them from the code, not from
   guesswork: the state shape, the Clamp screen, the plate, the prompts store, the survey merge,
   the MCP door.
3. Where does a Prompt live when two repos are clamped, and which repo does Build run in? A Prompt
   is a file under `.jig/prompts/` in a repo, so this is the question the whole idea turns on.
4. What is the smallest version that would be useful to Matter, and what would it not do?

Then STOP. Say in your final message that the questions are posted and nothing was built.

STEP TWO exists only after Matter answers in that issue, and only if he says build. Then it becomes
a normal slice: one branch, test-first with the red line quoted in the commit body, `git commit -s`
(DCO), a PR in the worker-report shape, both CI legs green at the PR head, and it is AMBER, so the
lead reviews and merges. Record every merge on issue #1 with the sha and the CI run id.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; rewrite pushed history; write
any code before the ruling.
----8<---- to here ----8<----
