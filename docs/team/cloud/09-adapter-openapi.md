# 09 · S26 · APIs beyond .NET
**Tier** green (merge on green CI) · **Depends on** R0 · **Expected PRs** 1 · **Roadmap row** S26

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S26) · `AGENTS.md` ·
`docs/design/AMENDMENT-1-the-simplification.md` §6 (ruling A5, the last row: OpenAPI documents
first, framework-neutral) · `docs/design/COMMISSION.md` §3 (the words) ·
`packages/server/src/seams.ts` · `packages/core/src/survey.ts` and `packages/core/src/jsonschema.ts`
(the endpoint and schema shapes you must return) · **`packages/adapters/dotnet/src/`** in full,
especially `openapi-file.ts`, `openapi-live.ts`, `openapi-parse.ts` and `regex-fallback.ts`: the
`openapi-file` then `openapi-live` then `regex-stub` ladder is the pattern you are lifting off .NET ·
`packages/server/src/survey/registry.ts` and `merge.ts`.

THE FRONTIER, in order:

1. **Decide the shape and say it in the PR body.** Either a new `packages/adapters/openapi/`
   package, or the reusable half of the .NET adapter's OpenAPI reading lifted into a module both
   adapters share. Pick one, say why, and do not leave the .NET adapter with a second copy.
2. **A document in the repo.** Any `openapi.json`, `openapi.yaml`, `swagger.json` or the like found
   by file scan produces endpoints and schemas, with no .NET present anywhere. Red first: a fixture
   repo carrying an OpenAPI 3 document and nothing else.
3. **A live document.** A document fetched from a running URL does the same. Red first: a fake
   upstream server, the shape `openapi-live.test.ts` already uses. Never reach a real network.
4. **No document.** The survey badges itself a stub, exactly as the .NET fallback does, and the
   endpoints it reports are marked as such. Red first: a fixture with no document at all.
5. **Registration and regression.** Register above `web` in
   `packages/server/src/survey/registry.ts`. The .NET adapter must keep its exact behaviour on
   `examples/ledger-api`, which is proven by its existing tests: run them and quote the result. Add
   your workspace to the root `package.json` scripts `build`, `typecheck` and `build:release`, and
   any third-party runtime dependency to `packages/cli/package.json` dependencies and the `external`
   list in `packages/cli/tsup.config.ts`.

DOCS, in the same PR: `README.md` §Targets and `docs/USING.md` say that any API with an OpenAPI
document is read, .NET or not. `CHANGELOG.md` gets an `## [Unreleased]` entry. Change the S26 row in
`docs/ROADMAP.md` to say shipped when the PR merges.

Do NOT: change the `SurveyAdapter` interface; regress the .NET adapter; write a per-language regex
parser (the ruling says documents first, and a fallback only where a spec is absent); reach a real
network in a test; put fixtures under `examples/` or edit anything in `examples/`, `QUALITY.md` or
`docs/quality/`; rewrite pushed history.

HOW WORK LANDS: one branch (`delegate/build-adapter-openapi`), test-first with the red line quoted
in the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what
changed, the red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu,
green at the PR head, then merge it yourself. Record the merge on issue #1 with the sha and the CI
run id. If a push run on main goes red, root-cause it the same day as its own PR. Never `npm link`,
`claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
