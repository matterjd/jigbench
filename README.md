# Jig

**Status:** 0.2.0 — the simplification: one loop, one button, one command

Nothing leaves your machine unless you connect an agent. Jig runs locally: no telemetry, no
accounts, no cloud. The only network calls it makes are to the app you point it at, to a local
Ollama instance if one is running, and to Claude Code when you press **Build**.

## What Jig is

Jig is a benchtop for shaping a feature before Claude builds it. You clamp (attach) an existing
app repo into the bench. Jig surveys (reads) it: its stack, components, routes, endpoints and
gauges (design system tokens). The running app lands on the plate (where it renders and is
clicked). You **Point** at something on the plate — or **Sketch** a screen that does not exist
yet — write the requirement the way a PM would, and Jig saves it as a serviceable **prompt**:
your words on top, then what Jig knows about the selection and the app (component, file, gauges,
routes, endpoints, matching docs). Hold **Ready**, press **Build**, and Jig runs Claude Code
itself in the repo with that prompt, streaming its work onto the status line and into the
logbook. Look at the result on the plate — the files Claude touched are on the built line — refine
the words, go again.

Jig never edits application source. Claude Code does, on your word. Jig only writes files under
`.jig/` in the repo you clamped.

## 60-second quick start

No install, no admin, no global anything — `npx` fetches and runs `jigbench` from your own npm
cache. Node 22 or later is the only requirement.

```bash
npx jigbench
```

Run it from anywhere. The bench opens in your browser at `http://localhost:4600` on the **Clamp**
screen: your recent benches (one click re-clamps), a folder browser, or a pasted path. Pick the
repo and the survey runs and shows what it found. Then, on the same screen:

- **Start the app** runs the repo's own dev script (`npm run start`, `ng serve`, …) with its log
  streamed, or paste the URL of an app you already have running;
- **Docs** clamps a folder of documentation (`./docs` is clamped for you when it exists) so the
  prompt can quote the matching chunks;
- **Register with Claude Code** shows what `.mcp.json` will say, then writes it — Claude Code
  reads it automatically and gets `jig` as a local MCP server; the Claude Desktop entry is one
  more click;
- **go to the bench** — Point, Prompts, Build.

Run `npx jigbench` from inside a repo (a folder with a `.git`) and it clamps that repo at once,
skipping the folder browser. A setup checklist stays one click from the status line either way.
The plate proxies the app through `4601`; both ports are configurable with `--port` /
`--plate-port` and bind to loopback only unless you pass `--host`.

The terminal commands stay for scripts and CI — `npx jigbench init` (write `.mcp.json`),
`npx jigbench survey`, `npx jigbench clamp --docs <folder>`, `npx jigbench mcp install
--claude-desktop`, `npx jigbench prompts`, `npx jigbench build <id>` — but the bench never
requires them.

### Ollama (optional — Polish)

**Polish** tightens a requirement and adds acceptance lines using a local model, on demand,
nothing fires by itself. Install [Ollama](https://ollama.com) (no admin needed on Windows), then:

```bash
ollama pull qwen2.5-coder:7b
```

Jig looks for Ollama at `http://127.0.0.1:11434` (override with `JIG_OLLAMA_URL`). No model → no
Polish button, not a stub. Set `JIG_NO_MODEL=1` to skip the probe entirely (this repo's own CI and
tests do; you never need to).

## The tongue

Jig uses its own words for a few ideas. Each pairs with a plain word the first time it comes up in
the UI or the docs (`docs/design/COMMISSION.md` §3, as amended by
`docs/design/AMENDMENT-1-the-simplification.md` §3).

| Jig says | Plain word |
|---|---|
| Bench | workspace, one per clamped repo |
| Clamp | attach a repo or docs folder |
| Survey | the read of the repo: stack, screens, components, gauges, data shapes |
| Plate | where the app renders and is clicked |
| Point | click a component to open the prompt card; the readout lives in **Inspect** |
| Sketch | a screen that does not exist yet, drawn with the gauges; the sheet is a prompt target |
| Prompt | a requirement saved as the prompt Claude will get — draft · ready · building · built |
| Ready | held ~800 ms; what makes a draft the prompt |
| Build | runs Claude Code in the repo with the prompt |
| Built | the plate after the build; the built line lists the files Claude touched |
| Claude | the one status word on the status line |
| Design system | the gauges, categorised; *gauges* stays the word for one token |
| Toolpath | a recorded click sequence, replayable (Advanced) |
| Fixture | a reproducible set of test data (Advanced) |
| Scrap bin | where anything removed goes, counted and regenerable |
| Logbook | the record of everything that happened on the bench |

## Layout

```
packages/core             pure TypeScript, zero I/O — survey/prompt/gauges/fixture models
packages/server           MCP stdio + HTTP/WS + proxy + the Build runner — imports core
packages/bench            web UI (React + Vite) — imports core only (pure TS, no I/O)
packages/cli              the jigbench bin — thin wiring, imports server
packages/adapters/angular SurveyAdapter for Angular — imports core interfaces only
packages/adapters/dotnet  SurveyAdapter for .NET 10 — imports core interfaces only
packages/adapters/web     the generic adapter — any repo with a package.json or a stylesheet
examples/                 a tiny Angular app + a tiny .NET 10 app — not a workspace package
```

See `MAP.md` for the full repo map and what each folder is the source of truth for.

## Requirements

- Node >= 22
- npm (workspaces; npm 11 or later, for contributors)
- The dev environment on this project is Windows-first (Git Bash); commands in these docs are bash

## Targets

Jig works with any app that has a dev server — the loop never depends on a survey adapter, and
adapters only enrich it. Angular and .NET 10 have dedicated adapters (real components, routes,
and API endpoints); the generic `web` adapter is the fallback for everything else — any repo with
a `package.json` or a stylesheet gets CSS/SCSS/Less design tokens, a dev-server guess, and honest
framework hints, with components and routes marked unknown rather than invented. At runtime Point
names components for Angular, React and Vue, and falls back to the tag and DOM path for anything
else. `docs/ROADMAP.md` carries the stacks that come next.

## Learn it end to end

`docs/TEST-RUN.md` is the step-by-step run of the loop on the `examples/` app and then on your
own repo. `docs/USING.md` walks the same loop in prose, in Jig's own words.

## License and community

Apache-2.0, see `LICENSE`. Contributions follow the Developer Certificate of Origin — sign off
every commit with `git commit -s`. See `CONTRIBUTING.md` for the workflow, `SECURITY.md` for how
to report a vulnerability, and `CODE_OF_CONDUCT.md` for the community standard.

## Plan

The build plan, slices, and locked decisions live in `docs/EXECUTION-PLAN.md`; the 0.2 rulings in
`docs/design/AMENDMENT-1-the-simplification.md`; what comes next in `docs/ROADMAP.md`.
