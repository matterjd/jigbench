# Jig

**Status:** v0.1 in progress — the Tuesday cut

Nothing leaves your machine unless you connect an agent. Jig runs locally: no telemetry, no
accounts, no cloud. The only network calls it makes are to the app you point it at, to a local
Ollama instance if one is running, and to download a small model the first time you run it.

## What Jig is

Jig is a benchtop for shaping a feature before an agent builds it. You clamp (attach) an existing
app repo, or a folder of its docs, into the bench. Jig surveys (reads) the app: its stack, screens,
components, and gauges (design system tokens). The app lands on the plate (where it renders and
can be clicked) as a working, clickable surface. You put the loupe (point-and-inspect) on
anything, say what should change, and Jig's local model drafts a work order: the requirement, the
acceptance, and a fixture (reproducible test data), plus — once you release (approve) it — the
shop face, an implementation brief written in the app's own stack idiom. The work order is a file
in the repo. Any connected agent (the shop) picks it up over MCP, builds it, and Jig shows the
trial fit: the app with the change, next to the app before it.

Jig never edits application source. It only writes files under `.jig/` in the repo you clamped.

## 60-second quick start

```bash
cd your-app-repo
npx jigbench
```

This starts the local server and opens the bench in your browser at `http://localhost:<port>`.

To wire up an agent:

```bash
npx jigbench init
```

This writes `.mcp.json` (so Claude Code registers Jig as a local MCP server on stdio) and creates
the `.jig/` folder in your repo. Claude Desktop needs the matching entry in its own config file;
`jigbench init` prints how to add it.

Once a work order exists under `.jig/work-orders/`, open the repo in Claude Code. Claude Code
reads `.mcp.json`, connects to Jig over stdio, lists the open work orders as MCP resources, and
can claim and implement one. When it reports the work order done, the bench shows the trial fit.

## The tongue

Jig uses its own words for a few ideas. Each pairs with a plain word the first time it comes up in
the UI or the docs.

| Jig says | Plain word |
|---|---|
| Bench | workspace, one per clamped repo |
| Clamp | attach a repo or docs folder |
| Survey | the read of the repo: stack, screens, components, gauges, data shapes |
| Plate | where the app renders and is clicked |
| Loupe | point at anything and see what it is |
| Mark | a highlighted spot with a request attached |
| Work order | one change: human face + shop face |
| Release | approve a work order; the shop face is filled and the file is written |
| The shop | the connected agents (Claude Code, Claude Desktop) |
| Trial fit | the app with the change, beside the app before it |
| Toolpath | a recorded click sequence, replayable |
| Fixture | a reproducible set of test data |
| Gauges | the design system, measured and categorized |
| Sketch | a screen that does not exist yet, drawn with the gauges |
| Scrap bin | where anything removed goes, counted and regenerable |
| Logbook | the record of everything that happened on the bench |

## Layout

```
packages/core             pure TypeScript, zero I/O — survey/work-order/gauges/fixture models
packages/server           MCP stdio + HTTP/WS + proxy + drafters — imports core
packages/bench            web UI (React + Vite) — imports core types only
packages/cli              the jigbench bin — thin wiring, imports server
packages/adapters/angular SurveyAdapter for Angular — imports core interfaces only
packages/adapters/dotnet  SurveyAdapter for .NET 10 — imports core interfaces only
examples/                 a tiny Angular app + a tiny .NET 10 app — not a workspace package
```

See `MAP.md` for the full repo map and what each folder is the source of truth for.

## Requirements

- Node >= 22
- npm (workspaces; npm 11 or later)
- The dev environment on this project is Windows-first (Git Bash); commands in these docs are bash

## Targets on day one

Angular (frontend) and .NET 10 (APIs and backend). Other stacks are adapters behind the same
`SurveyAdapter` interface; see `CONTRIBUTING.md` for how to add one.

## License and community

Apache-2.0, see `LICENSE`. Contributions follow the Developer Certificate of Origin — sign off
every commit with `git commit -s`. See `CONTRIBUTING.md` for the workflow, `SECURITY.md` for how
to report a vulnerability, and `CODE_OF_CONDUCT.md` for the community standard.

## Plan

The build plan, slices, and locked decisions live in `docs/EXECUTION-PLAN.md`.
