# 15 · I2 · a hosted bench for a team
**Tier** ruling (Matter decides first; this contradicts "not planned") · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I2

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I2, and the "What is not planned"
section, which says cloud, accounts and telemetry are not planned) · `docs/EXECUTION-PLAN.md` §7 (the
same list, as the plan of record) · `docs/design/COMMISSION.md` (Jig is local-first; that is the
product, not an implementation detail) · `SECURITY.md` and `packages/server/src/same-origin.ts` (the
Host and Origin gates, and why they exist: everything today assumes loopback) ·
`packages/server/src/http.ts` and `packages/server/src/bench/host.ts` ·
`packages/server/src/build/runner.ts` (Build spawns `claude -p` on the machine the server runs on).

THE FRONTIER.

1. **Stop and print the ruling questions for Matter; do not build until they are answered in the
   issue.** No branch, no PR, no code. This idea contradicts a standing decision, so say that first
   and loudest. Read the files above, then open a new issue titled "ruling needed: a hosted bench
   for a team", or comment on it if it already exists, and lay the questions below out. Then STOP,
   and say in your final message that the questions are posted and nothing was built. Do not write
   a design document, a proposal, or a prototype: the ruling comes first. The questions:
   - This reverses "cloud, accounts, telemetry: not planned". Is that reversal what Matter wants,
     or does he want something smaller, such as one bench reachable from a second machine on his
     own network?
   - Who runs the build? Today Build spawns `claude -p` on the server's machine, in the clamped
     repo. A hosted bench means someone else's clamp running someone else's Claude on someone
     else's repo. Name that plainly.
   - What would have to exist that does not: accounts, a permission model, transport security
     beyond the loopback gates, and a story for the `.jig/` files as shared state.
   - What is the smallest useful version? Say what it would and would not do.
2. **Only after Matter answers, and only if he says build.** It would not be one slice. Say so, and
   propose a slice table for the lead rather than starting one. If his answers are already in the
   issue when you open this prompt, the session continues from here under HOW WORK LANDS below.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; add any network listener, any
account, or any telemetry; rewrite pushed history.

HOW WORK LANDS (step 2 only, and only for the slices Matter approves off that table): one branch per
slice, test-first with the red line quoted in the commit body, `git commit -s` (DCO), push, open a
PR whose body is a worker report (what changed, the red line, how it was verified, what you did not
do). Both CI legs, Windows and Ubuntu, green at the PR head — then the LEAD reviews and merges,
because this row is amber: do not merge it yourself. Record every merge on issue #1 with the sha and
the CI run id, the way the record reads today. Never `npm link`, `claude mcp add`, `npm publish`,
tag, or change repository visibility.

CLOSE: a docs PR refreshing `HANDOFF.md` (seat Delivery, what is on main, what is still open, what
Matter owes). If you stopped at step 1, say so plainly and refresh nothing. The last line of your
final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
