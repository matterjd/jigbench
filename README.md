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

No install, no admin, no global anything — `npx` fetches and runs `jigbench` from your own npm
cache.

```bash
cd your-app-repo
npx jigbench
```

This starts the local server, clamps the current repo, and opens the bench in your browser at
`http://localhost:4600` (the plate — where a clamped app renders — proxies through `4601`; both
are configurable with `--port`/`--plate-port` and bind to loopback only unless you pass `--host`).

To wire up Claude Code:

```bash
npx jigbench init
```

This writes `.mcp.json` at the repo root (so Claude Code registers `jig` as a local MCP server on
stdio, launched as `npx jigbench mcp`) and creates the `.jig/` folder. Open the repo in Claude
Code — it reads `.mcp.json` automatically, connects to Jig over stdio, lists the open work orders
as MCP resources, and can claim and implement one. When it reports a work order done, the bench
shows the trial fit.

Claude Desktop has no per-project `.mcp.json` of its own, so it needs a separate step:

```bash
npx jigbench mcp install --claude-desktop
```

This prints the diff to Claude Desktop's `claude_desktop_config.json` without writing anything;
add `--yes` to actually write it.

### Ollama (optional, local drafting)

Jig drafts a work order's human face itself when a local model is reachable — no agent required
to get a first draft. Install [Ollama](https://ollama.com) (no admin needed on Windows), then:

```bash
ollama pull qwen2.5-coder:7b
```

Jig looks for Ollama at `http://127.0.0.1:11434` by default (override with `JIG_OLLAMA_URL`). If
Ollama isn't reachable, Jig falls back to a connected agent (`jig_draft` over MCP), then to a
human filling the work order by hand — always something, never a hard stop. Set `JIG_NO_MODEL=1`
to skip the Ollama probe entirely (used by this repo's own CI and tests, never needed day to day).

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

Jig works with any app that has a dev server — the loop never depends on a survey adapter, and
adapters only enrich it. Angular and .NET 10 have dedicated adapters (real components, routes,
and API endpoints); a generic `web` adapter is the fallback for everything else — any repo with a
`package.json` or a stylesheet gets CSS/SCSS/Less design tokens, a dev-server guess, and honest
framework hints, with components and routes marked unknown rather than invented. Other stacks are
adapters behind the same `SurveyAdapter` interface; see `CONTRIBUTING.md` for how to add one.

## Learn it end to end

`docs/USING.md` walks the whole loop in Jig's own words — clamp, survey, the plate and the
loupe, a mark, a work order, release, the shop, the trial fit — against the `examples/` app.

## License and community

Apache-2.0, see `LICENSE`. Contributions follow the Developer Certificate of Origin — sign off
every commit with `git commit -s`. See `CONTRIBUTING.md` for the workflow, `SECURITY.md` for how
to report a vulnerability, and `CODE_OF_CONDUCT.md` for the community standard.

## Plan

The build plan, slices, and locked decisions live in `docs/EXECUTION-PLAN.md`.
