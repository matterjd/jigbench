# Contributing to Jig

Thanks for looking at this. Jig is a young project (v0.1 in progress) — read
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

## Reporting a design-floor issue

If something in the bench does not meet the design floor (the accessibility and interaction
baseline the design seat holds the bench to), open an issue and label it `design-floor`. Say what
you clicked or looked at, what you expected, and what you got. Screenshots help.
