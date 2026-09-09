# 14 · I1 · multi-bench
**Tier** ruling (Matter decides first) · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I1

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I1, under "ideas to rule on, not
commitments") · `docs/design/COMMISSION.md` §3 (bench is one workspace per clamped repo) ·
`docs/design/AMENDMENT-1-the-simplification.md` (rulings A1 to A6) ·
`packages/server/src/bench/host.ts` and `bench.ts` (one Bench per repo root, created and torn down
on clamp and unclamp: this is the shape the idea would change) ·
`packages/server/src/bench/recent.ts` · `packages/bench/src/clamp/ClampScreen.tsx` ·
`packages/core/src/bench-state.ts`.

THE FRONTIER.

1. **Stop and print the ruling questions for Matter; do not build until they are answered in the
   issue.** No branch, no PR, no code. Read the files above, then open a new issue on
   matterjd/jigbench titled "ruling needed: multi-bench (two repos clamped at once)", or comment on
   it if it already exists, and lay the questions below out with what each costs in the code you
   just read. Then STOP, and say in your final message that the questions are posted and nothing
   was built. The questions:
   - Two repos clamped at once, a front end and its API, on one bench. Is the boundary one bench
     per repo, with a way to point at a second, or one bench per product that clamps several repos?
   - Which surfaces would have to change, and which would not? Name them from the code, not from
     guesswork: the state shape, the Clamp screen, the plate, the prompts store, the survey merge,
     the MCP door.
   - Where does a Prompt live when two repos are clamped, and which repo does Build run in? A
     Prompt is a file under `.jig/prompts/` in a repo, so this is the question the whole idea turns
     on.
   - What is the smallest version that would be useful to Matter, and what would it not do?
2. **Only after Matter answers in that issue, and only if he says build.** Then it is a normal
   slice, and it is AMBER. If his answers are already in the issue when you open this prompt, the
   session continues from here under HOW WORK LANDS below.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; rewrite pushed history; write
any code before the ruling.

HOW WORK LANDS (step 2 only): one branch (`delegate/build-i1`), test-first with the red line quoted
in the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what
changed, the red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu,
green at the PR head — then the LEAD reviews and merges, because this row is amber: do not merge it
yourself. Record every merge on issue #1 with the sha and the CI run id, the way the record reads
today. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change repository visibility.

CLOSE: a docs PR refreshing `HANDOFF.md` (seat Delivery, what is on main, what is still open, what
Matter owes). If you stopped at step 1, say so plainly and refresh nothing. The last line of your
final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
