# 13 · S30 · the MCP door for Claude Desktop
**Tier** amber (the live half is the desk's) · **Depends on** R0 · **Expected PRs** 1 to 2 · **Roadmap row** S30

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary, and NO Claude Desktop. You cannot
run a real MCP client application. Everything you build is proven by the repo's own stdio test
client and by reading the files the setup writes. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S30) ·
`docs/design/AMENDMENT-1-the-simplification.md` ruling A1 (MCP is the secondary door, and Claude
Desktop cannot build) · `docs/adr/001-pull-not-push-mcp.md` · `docs/design/COMMISSION.md` §3 (the
words) · `packages/server/src/mcp/` in full (`server.ts`, `tools.ts`, `prompt-tools.ts`,
`prompts.ts`, `resources.ts`, and their tests: `server.test.ts` shows how a test client drives the
door over stdio) · `packages/server/src/setup/mcp-json.ts` and `desktop-config.ts` ·
`packages/cli/src/commands/mcp.ts`, `mcp-install.ts`, `init.ts` and their e2e tests ·
`scripts/mcp-smoke.sh` and `scripts/stdout-guard.sh` (stdout carries JSON-RPC only, and CI proves
it).

THE FRONTIER, in order:

1. **The three tools, driven as a client sees them.** An integration test over stdio that lists the
   tools, calls `jig_prompts`, then `jig_prompt` on one of the returned ids, then `jig_mark_built`,
   and asserts the payload a client actually receives at each step, not the internal return value.
   Red first. Assert the old aliases still answer.
2. **The `.mcp.json` command on Windows.** A test that reads the file `POST /api/setup/mcp` writes
   and asserts the command shape runs on Windows: the `npx` invocation, the arguments, and the
   explicit `--repo` that #17 and the S14 fix put there. Red first. This is a file-shape assertion,
   not a spawn.
3. **The diff stays first.** `jigbench mcp install --claude-desktop` still shows what it will write
   before it writes it. Red first if no test pins that today.
4. **Say what you could not do.** Add a Part 3 step to `docs/TEST-RUN.md` for the desk: register
   with Claude Desktop, open it, and drive the three tools from there. Name it as the step a cloud
   session cannot run.

DOCS, in the same PR: `docs/USING.md` §Advanced and `README.md` say what the door offers and what it
cannot do (Claude Desktop reads Prompts and records one as built; it does not run a build).
`CHANGELOG.md` gets an
`## [Unreleased]` entry. Change the S30 row in `docs/ROADMAP.md` to say shipped when the PR merges.

Do NOT: run `claude mcp add` or touch any real Claude configuration on the machine you are running
on; add an HTTP transport, sampling, or push notifications (ADR-001 rules pull, not push); print
anything but JSON-RPC on stdout; touch `examples/` source, `QUALITY.md` or `docs/quality/`; rewrite
pushed history.

HOW WORK LANDS: one branch (`delegate/build-mcp-door`), test-first with the red line quoted in the
commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what changed, the
red line, how it was verified, what you did not do, and plainly: what only the desk can prove). Both
CI legs, Windows and Ubuntu, green at the PR head. THIS SLICE IS AMBER: do not merge. Post the PR
link and its CI run id on issue #1 for the lead's review. Never `npm link`, `npm publish`, tag, or
change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
