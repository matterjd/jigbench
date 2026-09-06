# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project does not yet follow
semantic versioning strictly (pre-1.0).

## [0.1.0] - 2026-09-06

The Tuesday cut — `docs/EXECUTION-PLAN.md`'s full slice table, S1 through S10. One line per
slice:

- **S1 · shell** — the npm-workspaces monorepo; `@jigbench/core`'s pure survey/work-order/gauges/
  fixture/toolpath types; `@jigbench/server`'s HTTP/WS boot and stderr-only logger; the
  `jigbench` CLI (`jigbench`, `mcp`, `init`, `survey`); the bench's chassis-neutral shell; the
  `examples/ledger-angular` + `examples/ledger-api` fixture apps.
- **S2 · survey** — `@jigbench/adapter-angular` (ts-morph over `@Component`, routes, SCSS/CSS
  gauges) and `@jigbench/adapter-dotnet` (OpenAPI fetch first, a regex-lite C# fallback that
  badges itself as a stub).
- **S2b · docs clamp** — `jigbench clamp --docs <folder>` reads markdown/text/PDF into
  `.jig/survey/docs.json`, heading-chunked with file+line provenance; the drafter ranks chunks
  by keyword overlap with the mark.
- **S3 · plate** — the reverse proxy in front of a target app's own dev server: HTML rewrite
  injects the loupe script, WebSocket/HMR pass-through, selective `CSP`/`X-Frame-Options`
  handling that reports what it changed.
- **S4 · gauges** — the Gauges panel (colour · type · space · radius · shadow · motion · z),
  two-way lit with the plate; the component list with instance counts.
- **S5 · marks → work orders** — the `Drafter` seam (Ollama → a connected agent → a human,
  always something); the human face; release as an ~800ms hold; the shop face filled from the
  survey on release; the work-order ladder, logbook, and scrap bin.
- **S6 · MCP** — `jigbench mcp` on stdio (MCP SDK v1): `jig_survey`, `jig_gauges`,
  `jig_work_orders`, `jig_work_order`, `jig_fixture`, `jig_draft`, `jig_claim`, `jig_report`;
  `jigbench init` writes `.mcp.json`; `jigbench mcp install --claude-desktop` writes the Desktop
  config entry, diff-first.
- **S7 · fixtures** — seeded test data from the survey's schemas (`json-schema-faker` +
  `@faker-js/faker`), applied by the proxy answering `/api/*` and the loupe filling forms.
- **S8 · trial fit + toolpath** — recorded click/input toolpaths, replayable; the trial fit's
  before/after mirror once the shop reports a work order done.
- **S9 · sketch** — a plate mode for a screen that doesn't exist yet, drawn with the gauges,
  saved under `.jig/sketches/`.
- **S10 · ship** — `packages/cli` bundles `@jigbench/core`/`server`/both adapters into one
  publishable `jigbench` package (third-party deps external); `npm run build:release` +
  `npm run pack:release` produce a clean tarball (verified: `npx --yes ./jigbench-0.1.0.tgz`
  survey/init/serve/mcp all green in a clean directory outside this repo); CI on Windows +
  Ubuntu (typecheck, tests, build, the stdout-purity guard, the packed-tarball npx control, a
  DCO check on pull requests) and a manual `release.yml` that builds and uploads the tarball as
  an artifact, never publishing; README/CONTRIBUTING/MAP/`docs/USING.md` brought back in line
  with what the shipped commands actually do.

Publishing to npm and flipping this repo public are Matter's own explicit calls, made by hand
after this version — not part of this changelog entry.
