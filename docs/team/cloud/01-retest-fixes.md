# 01 · S18 · what the 0.2.0 retest files
**Tier** amber (the lead reviews before merge) · **Depends on** R0 · **Expected PRs** one per item the retest filed · **Roadmap row** S18

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S18) · `AGENTS.md` (the boundary
rules between packages) · `docs/design/AMENDMENT-1-the-simplification.md` (rulings A1 to A6, they
bind) · `docs/design/COMMISSION.md` §3 (the words Jig uses; "seed", "recording", "work order" and
"open the bench" are banned on any surface) · `docs/TEST-RUN.md` (the walkthrough that produced your
list) · issue #1 (the record, and the shape your own merge comments must take).

YOUR LIST. Matter ran the 0.2.0 retest on his desk and filed one issue per defect. Find them:
`gh issue list --repo matterjd/jigbench --state open --json number,title,body`, and take every issue
whose body says it came from the 0.2.0 desk retest. That set is your frontier. If the set is empty,
stop and say so; do not invent work.

THE FRONTIER, in order:
1. Read every issue in the set. Post one comment on issue #1 listing them in the order you will fix
   them, cheapest first, and say which ones you believe are the same root cause.
2. Fix them one at a time, one branch and one PR each, named `fix/<slug>` after the issue.
   Acceptance for each: a test exists that fails before the fix and passes after; the red line is
   quoted in the commit body; the fix touches only the package the defect lives in; the whole suite
   is green on both CI legs at the PR head.
3. Where a defect cannot be seen by a test (a colour, a layout, a thing only the desk can drive),
   say so in the PR body, name what you checked instead, and add a step to `docs/TEST-RUN.md` so the
   desk can prove it next time.
4. DOCS, in the same PR as the fix they describe: `CHANGELOG.md` gets an `## [Unreleased]` section
   at the top if there is none, with one line per fix. `README.md` and `docs/USING.md` change only
   if the fix changed what a user sees. When the last item is merged, change the S18 row in
   `docs/ROADMAP.md` to say shipped, with the version it shipped in.
5. Do NOT: fix anything outside the set (open a new issue instead), touch `examples/` source,
   `QUALITY.md` or `docs/quality/`, rewrite pushed history, or start on S19 or S20.

HOW WORK LANDS (CI is the gate, not a local run): one branch per item, test-first with the red line
quoted in the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report
(what changed, the red line, how it was verified, what you did not do). Wait for both CI legs,
Windows and Ubuntu, to pass at the PR head. THIS SLICE IS AMBER: do not merge. Post the PR link and
its CI run id on issue #1 and move to the next item. The lead reviews and merges. Never `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility.

CLOSE: one comment on issue #1 listing every PR you opened with its CI run id and its state, then a
docs PR refreshing `HANDOFF.md` (seat Delivery, what is on main, what is still open, what Matter
owes). The last line of your final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
