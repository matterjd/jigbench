# 08 · S25 · server-rendered stacks
**Tier** green (merge on green CI) · **Depends on** S22 (the package shape) · **Expected PRs** 2 to 4 · **Roadmap row** S25

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ruby, no Python, no PHP, no Ollama, no real Claude Code binary. Never
attempt a live UI walkthrough or a real `claude -p`, and never try to run one of these frameworks:
everything you build is proven by file-scan fixtures. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S25) · `AGENTS.md` ·
`docs/design/AMENDMENT-1-the-simplification.md` §6 (ruling A5: the loop never depends on an adapter,
the plate proxies the running site, Point names by tag and DOM path where nothing else can) ·
`docs/design/COMMISSION.md` §3 (the words) · `packages/server/src/seams.ts` ·
`packages/core/src/survey.ts` · **`packages/adapters/web/src/`** (the fallback, and your model for a
file-scan adapter) · `packages/adapters/dotnet/src/regex-fallback.ts` (how a stub badges itself
honestly) · `packages/server/src/survey/registry.ts` and `merge.ts`.

THE FRONTIER, in order. One PR per framework, Blazor and Razor first because the .NET example is the
repo's own fixture family:

1. **Blazor and Razor.** Templates and partials by file scan (`.razor`, `.cshtml`), routes from the
   framework's own `@page` directives. Red first: a fixture tree in the adapter's own
   `src/__fixtures__/`, asserting each template's name and file and each route it declares.
2. **Rails.** Views and partials by file scan under `app/views`, routes from `config/routes.rb`
   where it can be read without running Ruby. Where the route table cannot be read, say unknown. Red
   first: a fixture tree with both cases.
3. **Django.** Templates by file scan, routes from `urls.py` where it can be read without running
   Python. Red first: as above.
4. **PHP.** Templates by file scan. Routes are unknown unless the repo carries a framework file you
   can read. Red first: a fixture tree that proves the unknown case is honest and not empty.

Rules that hold across all four:
- **No runtime component naming.** Point names by tag and DOM path, and the prompt must carry no
  invented component name. Add a test that proves an unmatched element produces an honest unknown.
- **Gauges come from the web adapter.** Do not duplicate its stylesheet reading.
- Register each adapter in `SURVEY_ADAPTERS` ABOVE `web`; web stays last. Add each workspace to the
  root `package.json` scripts `build`, `typecheck` and `build:release` by hand, and any third-party
  runtime dependency to `packages/cli/package.json` dependencies and the `external` list in
  `packages/cli/tsup.config.ts`.
- The dev-server guess must go through `packageJsonScriptNames` or say it has none. These stacks
  usually have no `package.json` script at all, so the honest answer is often "take a URL", which
  the Clamp screen already supports.

DOCS, in the PR that ships each: `README.md` §Targets and `docs/USING.md` gain the stack in one
line, saying plainly that Point names by tag and path there. `CHANGELOG.md` gets an
`## [Unreleased]` entry per stack. When all four merge, change the S25 row in `docs/ROADMAP.md` to
say shipped.

Do NOT: install or run any of these frameworks; change the `SurveyAdapter` interface; import
`server` from an adapter; put fixtures under `examples/` or edit anything in `examples/`,
`QUALITY.md` or `docs/quality/`; invent a component name anywhere; rewrite pushed history.

HOW WORK LANDS: one branch per framework (`delegate/build-adapter-<name>`), test-first with the red
line quoted in the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report
(what changed, the red line, how it was verified, what you did not do). Both CI legs, Windows and
Ubuntu, green at the PR head, then merge it yourself. Record every merge on issue #1 with the sha
and the CI run id. If a push run on main goes red, root-cause it the same day as its own PR. Never
`npm link`, `claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
