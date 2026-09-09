# 06 · S23 · Vue and Svelte
**Tier** green (merge on green CI) · **Depends on** S22 (the same package shape) · **Expected PRs** 2, one per stack · **Roadmap row** S23

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary. Never attempt a live UI
walkthrough or a real `claude -p`. Run every server test with `JIG_NO_MODEL=1
JIG_OLLAMA_URL=http://127.0.0.1:9`; the Build-runner tests use the repo's fake `claude` on PATH.

READ, in order: `HANDOFF.md` · `docs/ROADMAP.md` (your row is S23) · `AGENTS.md` (an adapter imports
core interfaces only, never `server`) · `docs/design/AMENDMENT-1-the-simplification.md` §6 (ruling
A5: adapters only enrich) · `docs/design/COMMISSION.md` §3 (the words) ·
`packages/server/src/seams.ts` · `packages/core/src/survey.ts` · **`packages/adapters/react/src/`**,
the adapter S22 built, which is your model · `packages/adapters/web/src/` (the fallback that must
keep working) · `packages/server/src/survey/registry.ts` and `merge.ts` ·
`packages/server/src/plate/loupe.js` around `__vueParentComponent` (Vue is already named at runtime;
you are building the survey half, and Svelte has neither yet).

THE FRONTIER, in order. Two PRs, Vue first:

1. **Vue.** A `packages/adapters/vue/` package, `@jigbench/adapter-vue`, same shape as the React
   one. `detect()` true for a repo with Vue in its `package.json` or a `vue` Vite plugin.
   Components carry name and file, read with vue-component-meta or whatever you prove works under
   the pinned TypeScript. Red first: a fixture with a single-file component, a script-setup
   component and a component with no name, asserting name and file for the first two and an honest
   unknown for the third.
2. **Svelte.** A `packages/adapters/svelte/` package, same shape. Components carry name and file
   from the compiler's own metadata. Red first: a fixture with two components, one importing the
   other.
3. **Both.** Register each in `SURVEY_ADAPTERS` in `packages/server/src/survey/registry.ts` ABOVE
   `web`; web stays last. Add each workspace to the root `package.json` scripts `build`, `typecheck`
   and `build:release` by hand, and any third-party runtime dependency to
   `packages/cli/package.json` dependencies and the `external` list in
   `packages/cli/tsup.config.ts`.
4. **The honest path.** Where the metadata is absent, the survey says unknown and Point still names
   by tag and DOM path. Prove that with a test rather than assuming it, and prove that the web
   adapter's gauges still apply to both stacks.

DOCS, in the PR that ships each: `README.md` §Targets and `docs/USING.md` gain the stack in one
line. `CHANGELOG.md` gets an `## [Unreleased]` entry per stack. When both merge, change the S23 row
in `docs/ROADMAP.md` to say shipped.

Do NOT: change the `SurveyAdapter` interface; import `server` from an adapter; put fixtures under
`examples/` or edit anything in `examples/`, `QUALITY.md` or `docs/quality/`; touch the loupe's
runtime naming, which already handles Vue; make the loop depend on either adapter; rewrite pushed
history.

HOW WORK LANDS: one branch per stack (`delegate/build-adapter-vue`, `delegate/build-adapter-svelte`),
test-first with the red line quoted in the commit body, `git commit -s` (DCO), push, open a PR whose
body is a worker report (what changed, the red line, how it was verified, what you did not do). Both
CI legs, Windows and Ubuntu, green at the PR head, then merge it yourself. Record every merge on
issue #1 with the sha and the CI run id. If a push run on main goes red, root-cause it the same day
as its own PR. Never `npm link`, `claude mcp add`, `npm publish`, tag, or change visibility.

CLOSE: a docs PR refreshing `HANDOFF.md`. The last line of your final message is a one-sentence
handoff for the next hand.
----8<---- to here ----8<----
