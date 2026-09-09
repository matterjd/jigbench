# 07 · S24 · Expo web
**Tier** green (merge on green CI) · **Depends on** S22 (the React resolver) · **Expected PRs** 1 · **Roadmap row** S24

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary, and no device or emulator. Never
attempt a live UI walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S24) · `AGENTS.md` ·
`docs/design/AMENDMENT-1-the-simplification.md` §6 (ruling A5: any app with a dev server) ·
`docs/design/COMMISSION.md` §3 (the words) · **`packages/adapters/react/src/`** (S22's adapter, which
you extend rather than copy) · `packages/adapters/web/src/dev-server.ts` (the dev-server guess you
are adding to) · `packages/server/src/target/detect.ts` (the script allowlist every started script
must pass through: a repo's own `package.json` script names, nothing else) ·
`packages/server/src/target/runner.ts`.

THE FRONTIER, in order:

1. **detect().** Extend the React adapter, or add a thin Expo adapter beside it, so an Expo repo
   (an `app.json` with an `expo` key, or `expo` in `package.json`) is recognised. Red first: a
   fixture Expo app in the adapter's own `src/__fixtures__/`.
2. **The dev-server guess.** The guess must name Expo's web command from the repo's own
   `package.json` scripts. It must go through `packageJsonScriptNames`, the same allowlist every
   other started script uses: never invent a command line. Red first: a fixture whose scripts
   include an Expo web script, asserting the guess names it, and a second fixture with no such
   script, asserting the guess is honest about having none.
3. **Components.** Resolve through the same React path S22 built. Red first: a fixture Expo screen
   asserting name and file.
4. **Say what this is.** Expo web on the plate, not a native device. The plate needs a dev server,
   and Expo web is the one Expo gives. Nothing in the bench or the docs may suggest a phone is being
   driven.

DOCS, in the same PR: `README.md` §Targets and `docs/USING.md` gain one line each saying Expo web
and naming the limit plainly. `CHANGELOG.md` gets an `## [Unreleased]` entry. `docs/TEST-RUN.md`
gains a Part 4 note for the desk, since only the desk can run an Expo dev server. Change the S24 row
in `docs/ROADMAP.md` to say shipped when the PR merges.

Do NOT: start a real Expo server; add a native or device path of any kind; put fixtures under
`examples/` or edit anything in `examples/`, `QUALITY.md` or `docs/quality/`; bypass the script
allowlist; rewrite pushed history.

HOW WORK LANDS: one branch (`delegate/build-expo-web`), test-first with the red line quoted in the
commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what changed, the
red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu, green at the
PR head, then merge it yourself. Record the merge on issue #1 with the sha and the CI run id. If a
push run on main goes red, root-cause it the same day as its own PR. Never `npm link`,
`claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
