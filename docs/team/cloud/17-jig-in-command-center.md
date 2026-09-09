# 17 · I4 · Jig inside command-center
**Tier** ruling (Matter decides first) · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I4

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH, as
they already do. You also have no access to the command-center repository, so you cannot read the
other half of this question: say so plainly rather than guessing at it.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I4, under "ideas to rule on, not
commitments") · `docs/design/COMMISSION.md` decision 3 (a local Node server and a browser UI, with a
Tauri wrapper named as cheap to undo later) · `docs/ROADMAP.md`'s "What is not planned", which names
a Tauri wrapper · `packages/cli/src/commands/serve.ts` (how the bench is served today) ·
`packages/server/src/http.ts` and `packages/server/src/bench/host.ts` (the HTTP and WebSocket
surface any host would have to speak) · `packages/bench/src/App.tsx` (what the bench assumes about
being a whole page) · `SECURITY.md` (the Host and Origin gates a second host would meet).

THE FRONTIER.

1. **Stop and print the ruling questions for Matter; do not build until they are answered in the
   issue.** No branch, no PR, no code. Read the files above, then open a new issue titled "ruling
   needed: Jig as a surface inside command-center", or comment on it if it already exists, and lay
   the questions below out. Then STOP, and say in your final message that the questions are posted,
   that you could not read the command-center side, and that nothing was built. The questions:
   - What is the seam? Three shapes are visible from this repo: command-center opens Jig's own URL
     in a frame; command-center hosts the bench bundle and talks to the same server; or Jig becomes
     a library command-center embeds. Name what each costs in the files you just read.
   - The Host and Origin gates exist because the bench is loopback-only. Any host that is not the
     bench's own origin meets those gates. Which shape needs them changed, and which does not?
   - Who owns the words? Jig's tongue is ruled in the commission. A surface inside another product
     still has to say bench, clamp, plate, Point, Prompt, Build.
   - What would Matter be able to do that he cannot do now? If the answer is only "one fewer
     browser tab", say that.
2. **Only after Matter answers, and only if he says build.** Then it is a normal slice, and it is
   AMBER. If his answers are already in the issue when you open this prompt, the session continues
   from here under HOW WORK LANDS below.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; weaken the Host or Origin
gates for convenience; add a Tauri wrapper, which is on the not-planned list; rewrite pushed history.

HOW WORK LANDS (step 2 only): one branch (`delegate/build-i4`), test-first with the red line quoted
in the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what
changed, the red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu,
green at the PR head — then the LEAD reviews and merges, because this row is amber: do not merge it
yourself. Record every merge on issue #1 with the sha and the CI run id, the way the record reads
today. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change repository visibility.

CLOSE: a docs PR refreshing `HANDOFF.md` (seat Delivery, what is on main, what is still open, what
Matter owes). If you stopped at step 1, say so plainly and refresh nothing. The last line of your
final message is a one-sentence handoff for the next hand.
----8<---- to here ----8<----
