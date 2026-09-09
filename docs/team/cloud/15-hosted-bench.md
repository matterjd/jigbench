# 15 · I2 · a hosted bench for a team
**Tier** ruling (Matter decides first; this contradicts "not planned") · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I2

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary.

**STEP ONE, AND THE ONLY STEP UNTIL MATTER ANSWERS: this is a ruling slice. Print the questions and
build nothing.** No branch, no PR, no code. This idea also contradicts a standing decision, so say
that first and loudest.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I2, and the "What is not planned"
section, which says cloud, accounts and telemetry are not planned) · `docs/EXECUTION-PLAN.md` §7 (the
same list, as the plan of record) · `docs/design/COMMISSION.md` (Jig is local-first; that is the
product, not an implementation detail) · `SECURITY.md` and `packages/server/src/same-origin.ts` (the
Host and Origin gates, and why they exist: everything today assumes loopback) ·
`packages/server/src/http.ts` and `packages/server/src/bench/host.ts` ·
`packages/server/src/build/runner.ts` (Build spawns `claude -p` on the machine the server runs on).

THE QUESTIONS. Open a new issue titled "ruling needed: a hosted bench for a team", or comment on it
if it already exists, and lay these out:

1. This reverses "cloud, accounts, telemetry: not planned". Is that reversal what Matter wants, or
   does he want something smaller, such as one bench reachable from a second machine on his own
   network?
2. Who runs the build? Today Build spawns `claude -p` on the server's machine, in the clamped repo.
   A hosted bench means someone else's clamp running someone else's Claude on someone else's repo.
   Name that plainly.
3. What would have to exist that does not: accounts, a permission model, transport security beyond
   the loopback gates, and a story for the `.jig/` files as shared state.
4. What is the smallest useful version? Say what it would and would not do.

Then STOP. Say in your final message that the questions are posted and nothing was built. Do not
write a design document, a proposal, or a prototype: the ruling comes first.

STEP TWO exists only after Matter answers, and only if he says build. It would not be one slice. Say
so, and propose a slice table for the lead rather than starting one.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; add any network listener, any
account, or any telemetry; rewrite pushed history.
----8<---- to here ----8<----
