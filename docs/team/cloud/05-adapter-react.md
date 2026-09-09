# 05 · S22 · the React, Next and Vite adapter
**Tier** amber (a new package and a new boundary) · **Depends on** R0 · **Expected PRs** 1, or 2 if you split the survey from the gauges · **Roadmap row** S22

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S22) · `AGENTS.md` (the boundary
rules: an adapter imports core interfaces only, never `server`) ·
`docs/design/AMENDMENT-1-the-simplification.md` §6 (ruling A5: the loop never depends on an adapter,
adapters only enrich) · `docs/design/COMMISSION.md` §3 (the words) · `packages/server/src/seams.ts`
(the `SurveyAdapter` interface: `detect` and `survey`) · `packages/core/src/survey.ts` (the shape
you must return) · **`packages/adapters/web/src/`** in full, which is the closest model: a small
adapter with `index.ts`, `find-root.ts`, `gauges.ts`, `dev-server.ts` and its own `__fixtures__/` ·
`packages/adapters/angular/src/components.ts` and `routes.ts` (how a stack adapter names components
and routes) · `packages/server/src/survey/registry.ts` and `merge.ts` (how adapters are registered
and how their results combine) · `packages/server/src/plate/loupe.js` around the React fiber walk
(the runtime half already exists; you are building the survey half).

THE FRONTIER, in order:

1. **The package.** `packages/adapters/react/`, published name `@jigbench/adapter-react`, copying
   the web adapter's `package.json`, `tsconfig.json` and `vitest.config.ts` shape. The root
   workspace glob already covers `packages/adapters/*`, and so does the vitest projects glob, but
   the root `package.json` scripts `build`, `typecheck` and `build:release` name each adapter by
   hand: add yours to all three. Any third-party runtime dependency you take on must also be added
   to `packages/cli/package.json` dependencies and to the `external` list in
   `packages/cli/tsup.config.ts`, or the release bundle will inline or drop it.
2. **detect().** True for a repo with React in its `package.json`, or a `next.config.*`, or a
   `vite.config.*` with the React plugin. False for the Angular fixture, so the Angular adapter
   still wins there. Red first: a detect test over your own fixtures, one per case, plus the false
   case against a fixture shaped like the Angular example.
3. **Components.** Name and file for each component, via react-docgen-typescript or whatever you
   prove works under the pinned TypeScript. Red first: a fixture app with a function component, an
   arrow component, a `memo` wrapper and a default export, asserting name and file for each.
4. **Routes.** From a React Router route config, and from a Next app directory's folder shape. Red
   first: one fixture per source, asserting the route paths that come back.
5. **Gauges.** Tailwind v3 through `resolveConfig`, and Tailwind v4 through `@theme` blocks in CSS.
   The web adapter's CSS custom property reading already covers plain stylesheets; do not duplicate
   it, reuse it or leave it to `web`. Red first: one fixture per Tailwind version.
6. **Registration.** Add your adapter to `SURVEY_ADAPTERS` in
   `packages/server/src/survey/registry.ts` ABOVE `web`. Web stays last, deliberately. Red first: a
   registry or merge test proving a React repo's components come from your adapter and not from
   web's "unknown".
7. **The honest path stays honest.** A repo neither your adapter nor any other matches must still
   survey, still clamp, and still run the loop, with components and routes marked unknown rather
   than invented. Prove it with a test, do not assume it.

DOCS, in the same PR: `README.md` §Targets and `docs/USING.md` gain React, Next and Vite in one line
each. `CHANGELOG.md` gets an `## [Unreleased]` entry. `docs/TEST-RUN.md` gains a Part 4 note saying
what a React repo should show on the Clamp screen, since only the desk can drive that. Change the
S22 row in `docs/ROADMAP.md` to say shipped when the PR merges.

Do NOT: change the `SurveyAdapter` interface; import `server` from an adapter; put fixtures under
`examples/` or edit anything in `examples/`, `QUALITY.md` or `docs/quality/`; make the loop depend
on your adapter in any way; start on Vue, Svelte or Expo (those are their own slices); rewrite
pushed history.

HOW WORK LANDS: one branch (`delegate/build-adapter-react`), test-first with the red line quoted in
the commit body, `git commit -s` (DCO), push, open a PR whose body is a worker report (what changed,
the red line, how it was verified, what you did not do). Both CI legs, Windows and Ubuntu, green at
the PR head. THIS SLICE IS AMBER: do not merge. Post the PR link and its CI run id on issue #1 for
the lead's review. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
