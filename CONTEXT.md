# CONTEXT.md

Living record of locked decisions and shared vocabulary.

## Locked decisions

Copied from `docs/EXECUTION-PLAN.md` §2. Every row binds.

| # | Decision | Chosen answer | Reversibility |
|---|---|---|---|
| 1 | Agents on Tuesday | Claude Code + Claude Desktop (stdio MCP) | cheap-to-undo (add clients) |
| 2 | Target stacks on Tuesday | Angular + .NET 10 | cheap-to-undo (adapters are packages) |
| 3 | Shell | local Node server + browser UI, `npx jigbench` | cheap-to-undo (Tauri wrapper later) |
| 4 | Name | product Jig, package/repo `jigbench` | one-way door (npm name) |
| 5 | Store of record | files under `.jig/` in the clamped repo; Jig never edits app source | cheap-to-undo |
| 6 | Drafter order | Ollama → agent pull (`jig_draft`) → human fill; `node-llama-cpp` deferred | cheap-to-undo |
| 7 | Render route | the app's own dev server through Jig's proxy; loupe injected; selector→file via survey | cheap-to-undo (plugin route is additive) |
| 8 | Bench UI | TypeScript, React + Vite | one-way door by S4 (rewrite after) |
| 9 | Monorepo | npm workspaces: core · server · bench · cli · adapters/angular · adapters/dotnet · examples/ | cheap-to-undo |
| 10 | License | Apache-2.0, DCO, no CLA | one-way door after the first external PR |
| 11 | Register | Obsidian & Ember from `starter.css`, dark first | cheap-to-undo (tokens) |
| 12 | Repo visibility | private now; Matter flips public at ship | cheap-to-undo |
| 13 | Example app | `examples/ledger-angular` + `examples/ledger-api` (.NET 10) — the build's target and the OSS demo | cheap-to-undo |
| 14 | MCP SDK | v1 (`^1.30`) | one-way door mid-flight (touches every registration) |
| 15 | Merge authority for the weekend | RULED (Matter, 2026-09-05 13:05): blanket for verified green slices into `main`; S6 (amber) and the `v0.1.0` publish / public flip stay per-item y/n | cheap-to-undo |
| 16 | Ollama on this desktop | RULED (Matter, 2026-09-05 13:05): install Ollama (winget, per-user) and pull `qwen2.5-coder:7b`; S5 is tested against the real model here | cheap-to-undo (uninstall) |
| 17 | Documentation intake | S2b · docs clamp added at the gate (counter-challenge): markdown / text / PDF text into `.jig/survey/docs.json`, drafter retrieves by keyword rank; Matter may cut | cheap-to-undo |

## Shared vocabulary

Jig's own words, with the plain word each pairs with at first encounter. Generic words in the
right column are banned from the UI.

| Jig says | Plain word (first encounter) | Never |
|---|---|---|
| Bench | workspace — one per clamped repo | project, workspace |
| Clamp | attach a repo or docs folder | import, open, connect |
| Survey | the read of the repo: stack, screens, components, gauges, data shapes | scan, analysis, index |
| Plate | where the app renders and is clicked | preview, canvas, viewport |
| Loupe | point at anything and see what it is | inspector, select, selection |
| Mark | a highlighted spot with a request attached | annotation, comment, selection |
| Work order | one change: human face + shop face | ticket, issue, task, spec |
| Release (a work order) | approve it — the shop face is filled and the file is written | approve, submit |
| The shop | the connected agents (Claude Code, Claude Desktop) | AI, assistant, bot |
| Trial fit | the app with the change, beside the app before it | demo, preview, diff |
| Toolpath | a recorded click sequence, replayable | flow, journey, recording |
| Fixture | a reproducible set of test data | mock data, seed, dummy data |
| Gauges | the design system, measured and categorized | tokens, theme, styles |
| Sketch | a screen that does not exist yet, drawn with the gauges | wireframe, mockup |
| Scrap bin | where anything removed goes, counted and regenerable | trash, delete |
| Logbook | the record of everything that happened on the bench | history, activity, audit log |
