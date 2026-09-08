# Contributing to Jig

Thanks for looking at this. Jig is a young project (0.2.0, the loop) — read
`docs/EXECUTION-PLAN.md` for the current plan before picking up a slice.

## Running the monorepo

Jig is an npm workspaces monorepo. Requires Node >= 22 and npm 11 or later.

```bash
npm i
npm test
npm run dev
```

`npm test` runs every package's tests. `npm run dev` starts the server and bench in watch mode
against `examples/`.

## Layout and boundary rules

```
packages/core             pure TypeScript, zero I/O — survey/work-order/gauges/fixture models
packages/server           MCP stdio + HTTP/WS + proxy + drafters — imports core
packages/bench            web UI (React + Vite) — imports core only (pure TS, no I/O; never server, adapters, or node I/O)
packages/cli              the jigbench bin — thin wiring, imports server
packages/adapters/angular SurveyAdapter for Angular — imports core interfaces only
packages/adapters/dotnet  SurveyAdapter for .NET 10 — imports core interfaces only
examples/                 a tiny Angular app + a tiny .NET 10 app — not a workspace package
```

These import rules are law, not convention:

| Package | Must NOT import | Why |
|---|---|---|
| `core` | server, bench, cli, adapters, any Node I/O module | keeps the model testable with no process running |
| `server` | bench (UI code), cli | server is a library the cli wires up, not an app |
| `bench` | server, adapters, `fs`/`child_process` | browser-sandboxed; talks to server only over HTTP/WS, never in-process |
| `cli` | anything but `server`'s public API | no business logic in the bin — a thin wiring layer |
| `adapters/*` | server, bench, each other | one stack is one package; a new stack adds a package and touches nothing else |
| `examples/*` | (nothing imports it) | it's a fixture the adapters' tests run against, not a dependency of anything |

A pull request that crosses one of these lines gets sent back, whatever else it does.

## Test-first

A change lands red before it lands green. Write the failing test first, then the code that makes
it pass. A pull request without a test that failed before your change is not test-first, whatever
the test suite looks like after.

## Sign off your commits (DCO)

Every commit must carry a Developer Certificate of Origin sign-off:

```bash
git commit -s -m "your message"
```

This adds a `Signed-off-by:` line with your name and email. CI checks for it on every commit in a
pull request. There is no CLA.

## Branch naming

- A slice from the execution plan: `delegate/build-sN` (for example `delegate/build-s3`)
- Anything else: `fix/<slug>` (for example `fix/proxy-csp-header`)

## Commit messages

Use a conventional-commit subject line: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.
Keep the subject under 72 characters. Say why in the body if it is not obvious from the subject.

## Adding a stack adapter

A new target stack (React, Expo, Blazor, anything else) is one new package under
`packages/adapters/<stack>` that implements the `SurveyAdapter` interface from `packages/core`. It
imports core interfaces only — never `server`, `bench`, or another adapter. Nothing else in the
monorepo needs to change for a new adapter to exist.

## Environment switches

| Variable | Effect |
|---|---|
| `JIG_NO_MODEL=1` | Skips the Ollama availability probe entirely and falls straight to the next drafter (a connected agent, then a human) — regardless of what a real or mocked Ollama would answer. Used by CI and the fresh-checkout control so a test run never depends on what happens to be installed/running on the machine. Not needed for day-to-day dev. |
| `JIG_OLLAMA_URL` | Overrides where the Ollama drafter looks (default `http://127.0.0.1:11434`). Point it at an unreachable address (e.g. `http://127.0.0.1:9`) to make "Ollama is down" deterministic without `JIG_NO_MODEL`, or at a real Ollama on another host/port. |
| `JIGBENCH_SMOKE_GLOBAL=1` | Opt-in for `scripts/mcp-smoke.sh`'s global-state steps (`npm link` into global npm, `claude mcp add`/`claude mcp list` into your own `~/.claude.json`). Without it, that script stays read-only — build, the stdout-purity guard, and a real MCP e2e over stdio, nothing global. |

## The smoke scripts

All are bash, run from the repo root after `npm run build` unless noted:

- `bash scripts/stdout-guard.sh` (`npm run check:stdout`) — a real `jigbench mcp` process,
  `initialize` → `tools/list` over stdio; asserts the *entire* stdout stream is JSON-RPC and
  nothing else. Accepts `JIG_MCP_CMD` to target something other than the local
  `packages/cli/dist/bin.js` build — e.g. a packed release tarball:
  `JIG_MCP_CMD="npx --yes ./jigbench-0.2.0.tgz" bash scripts/stdout-guard.sh`.
- `bash scripts/mcp-smoke.sh` (`npm run check:mcp-smoke`) — builds, re-runs the guard above,
  then a read-only MCP e2e with the real SDK `Client`. `JIGBENCH_SMOKE_GLOBAL=1` additionally
  runs the two global-state steps described above.
- `bash scripts/npx-control.sh <path-to-tarball>` — the S10 ship gate: stages a throwaway repo
  with copies of `examples/ledger-angular` (source only) and `examples/ledger-api` as siblings,
  then runs `survey` / `init` / the bench server / `mcp` against the packed tarball there — the
  same thing `.github/workflows/ci.yml` runs after packing.
- `bash scripts/check-dco.sh <base-ref> <head-ref>` — fails on the first commit in that range
  missing a `Signed-off-by:` trailer. What `.github/workflows/ci.yml`'s `dco` job runs over a
  pull request's base/head SHAs.
- `bash scripts/fixture-smoke.sh`, `scripts/plate-smoke.sh`, `scripts/trialfit-smoke.sh` —
  slice-specific smokes for S7 (fixtures), S3 (the plate proxy), and S8 (trial fit).

## The release build

`packages/cli` (published to npm as `jigbench`) bundles the whole in-repo dependency graph —
`@jigbench/core`, `@jigbench/server`, and both adapters — into one file, so `npm publish` never
depends on an unpublished workspace package. This is a *separate* build from the plain
`tsc`-based `npm run build` every workspace package uses for dev/typecheck/tests:

```bash
npm run build:release   # rebuilds core/adapters/server/bench, then bundles+packages the cli
npm run pack:release    # npm pack -> jigbench-<version>.tgz at the repo root (gitignored)
```

`npm pack --dry-run --workspace=jigbench` shows exactly what ships: `dist/bin.js` (the bundle),
`dist/bench/` (the built bench UI), `dist/loupe.js` (the plate's injected script),
`package.json`, and copies of the root `README.md` and `LICENSE` (npm includes both whatever
`files` says; the copies under `packages/cli/` are **build artifacts** — gitignored, untracked,
rewritten by every release build. Edit the root files; never those copies, and never commit
them: a tracked copy makes the ignore a dead letter and a publish from a clean checkout would
ship it instead of the root file) — no `src/`, no tests, no examples. See
`packages/cli/tsup.config.ts` and `packages/cli/scripts/copy-release-assets.mjs` for how the
assets land next to the bundle; `scripts/npx-control.sh` asserts the README and LICENSE are in
the packed tarball, that they match the root files byte for byte, and that neither copy is
tracked in git.

## Reporting a design-floor issue

If something in the bench does not meet the design floor (the accessibility and interaction
baseline the design seat holds the bench to), open an issue and label it `design-floor`. Say what
you clicked or looked at, what you expected, and what you got. Screenshots help.
