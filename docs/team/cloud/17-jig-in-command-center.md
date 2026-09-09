# 17 · I4 · Jig inside command-center
**Tier** ruling (Matter decides first) · **Depends on** nothing built · **Expected PRs** 0 until Matter rules · **Roadmap row** I4

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. You also have no access to the
command-center repository, so you cannot read the other half of this question: say so plainly rather
than guessing at it.

**STEP ONE, AND THE ONLY STEP UNTIL MATTER ANSWERS: this is a ruling slice. Print the questions and
build nothing.** No branch, no PR, no code.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is I4, under "ideas to rule on, not
commitments") · `docs/design/COMMISSION.md` decision 3 (a local Node server and a browser UI, with a
Tauri wrapper named as cheap to undo later) · `docs/ROADMAP.md`'s "What is not planned", which names
a Tauri wrapper · `packages/cli/src/commands/serve.ts` (how the bench is served today) ·
`packages/server/src/http.ts` and `packages/server/src/bench/host.ts` (the HTTP and WebSocket
surface any host would have to speak) · `packages/bench/src/App.tsx` (what the bench assumes about
being a whole page) · `SECURITY.md` (the Host and Origin gates a second host would meet).

THE QUESTIONS. Open a new issue titled "ruling needed: Jig as a surface inside command-center", or
comment on it if it already exists, and lay these out:

1. What is the seam? Three shapes are visible from this repo: command-center opens Jig's own URL in
   a frame; command-center hosts the bench bundle and talks to the same server; or Jig becomes a
   library command-center embeds. Name what each costs in the files you just read.
2. The Host and Origin gates exist because the bench is loopback-only. Any host that is not the
   bench's own origin meets those gates. Which shape needs them changed, and which does not?
3. Who owns the words? Jig's tongue is ruled in the commission. A surface inside another product
   still has to say bench, clamp, plate, Point, Prompt, Build.
4. What would Matter be able to do that he cannot do now? If the answer is only "one fewer browser
   tab", say that.

Then STOP. Say in your final message that the questions are posted, that you could not read the
command-center side, and that nothing was built.

STEP TWO exists only after Matter answers, and only if he says build. Then it is a normal slice, and
AMBER: one branch, test-first with the red line quoted in the commit body, `git commit -s` (DCO), a
PR in the worker-report shape, both CI legs green at the PR head, the lead reviews and merges.

Do NOT, in either step: touch `examples/` source, `QUALITY.md` or `docs/quality/`; run `npm link`,
`claude mcp add`, `npm publish`, tag, or change repository visibility; weaken the Host or Origin
gates for convenience; add a Tauri wrapper, which is on the not-planned list; rewrite pushed history.
----8<---- to here ----8<----
