# Execution Plan — Jig v0.1 · the Tuesday cut

> The single human-approved artifact that **gates the build**. Nothing in S1–S10 runs until the
> approval line below is ticked. Stage 4 of `@aedl -lifecycle`; consolidates the commission
> (stage 1.5, ruled 2026-09-05) and the feasibility read. Source of truth for the *why* is the
> commission in matter-notes (`design-book/10-jig/COMMISSION.md`, graduating to `docs/design/`
> here on approval); this file owns the *what, in what order, verified how*.

- **Work item:** jigbench#1 · Jig v0.1 — the Tuesday cut · **Type:** initiative
- **Size / path:** large (full lifecycle; fan-out build)
- **Target repo:** `matterjd/jigbench` (`C:\Users\matte\source\repos\jigbench`) · **Host:** GitHub · **Tracker:** GitHub Issues
- **Stack profile:** none yet — greenfield. `CONTEXT.md` + `MAP.md` are authored in S1; the stack profile (`matter-notes/docs/stack-profiles/jigbench.md`) is owed at the first discovery refresh after S1 lands.
- **Author / date:** the Design→Delivery session (Fable brain) / 2026-09-05
- **Approval:** ☑ **approved by Matter on 2026-09-05 (13:05 CDT)** — "Approved — build starts at S1"; decision 15 ruled *blanket merge for verified green slices*, decision 16 ruled *install Ollama + pull `qwen2.5-coder:7b` on the desktop*. Recorded on jigbench#1. **Counter-challenge surfaced at approval:** the ask names "or take in documentation" and no slice covered it → **S2b · docs clamp added** (below); Matter may cut it by saying so.

## 1. Objective & context

- **Problem / objective:** ship a local-first benchtop (`npx jigbench`) that clamps an Angular +
  .NET 10 repo, surveys it, renders the running app on a plate with a loupe, turns a mark into an
  agent-ready **work order** file under `.jig/`, exposes it over **MCP (stdio)** to Claude Code /
  Claude Desktop, and shows the **trial fit** when the shop returns — usable Tuesday 2026-09-08 on
  the desktop and the work laptop.
- **Why now / value:** rapid prototyping between engineers and UX; the gap is real (prior-art
  lens, verified): nothing local, design-system-aware, click-through on an *existing* repo, and
  spec-emitting over MCP exists.
- **Context triad read:** `CONTEXT.md` ☐ (authored in S1) · `MAP.md` ☐ (authored in S1) · stack-profile ☐ (owed)
- **Discovery findings that shape the work** (commission §6, `FEASIBILITY.md`, research sweep):
  - MCP **sampling is deprecated** (spec 2026-07-28) and unconfirmed in Claude Code → the agent
    **pulls** drafts and work orders through tools/resources; Jig never depends on push.
  - Use the **v1 MCP TypeScript SDK** (`@modelcontextprotocol/sdk` 1.x) on stdio; stdout carries
    JSON-RPC only → a CI guard, not discipline.
  - Angular dev mode exposes `ng.getComponent` / `ng.getOwningComponent`; the **survey's selectors
    name the file** — no source maps.
  - .NET 9+ serves `/openapi/v1.json` when the API runs → OpenAPI first, regex-lite C# fallback that
    **badges itself** as a stub.
  - Ollama's Windows installer is **per-user, no admin**; a portable zip exists → Ollama-first
    drafter; `node-llama-cpp` deferred (native-binary install risk on the laptop).
  - The reverse proxy is the zero-target-change injection route; its risks are the target's CSP /
    `X-Frame-Options` and the dev server's HMR WebSocket — handle, never blanket-strip.
  - ~64 Senior-hours serial → the build **fans out** in waves (below) or it does not land Tuesday.

## 2. Locked decisions *(one batched round — the commission; every row binds)*

| # | Decision | Chosen answer | Reversibility | Decided by |
|---|---|---|---|---|
| 1 | Agents on Tuesday | Claude Code + Claude Desktop (stdio MCP) | cheap-to-undo (add clients) | Matter, F1 |
| 2 | Target stacks on Tuesday | Angular + .NET 10 | cheap-to-undo (adapters are packages) | Matter, F2 |
| 3 | Shell | local Node server + browser UI, `npx jigbench` | cheap-to-undo (Tauri wrapper later) | Matter, F3 |
| 4 | Name | product **Jig**, package/repo **`jigbench`** | **one-way door** (npm name) | Matter, F4 |
| 5 | Store of record | files under `.jig/` in the clamped repo; Jig never edits app source | cheap-to-undo | Matter (ratified), F5 |
| 6 | Drafter order | Ollama → agent pull (`jig_draft`) → human fill; `node-llama-cpp` deferred | cheap-to-undo | Matter (ratified), F7 |
| 7 | Render route | the app's own dev server through Jig's proxy; loupe injected; selector→file via survey | cheap-to-undo (plugin route is additive) | Matter (ratified), F8 |
| 8 | Bench UI | TypeScript, **React + Vite** | **one-way door** by S4 (rewrite after) | Matter, F15 |
| 9 | Monorepo | npm workspaces: core · server · bench · cli · adapters/angular · adapters/dotnet · examples/ | cheap-to-undo | Matter (ratified), F16 |
| 10 | License | **Apache-2.0**, DCO, no CLA | **one-way door** after the first external PR | Matter (ratified), F17 |
| 11 | Register | Obsidian & Ember from `starter.css`, dark first | cheap-to-undo (tokens) | Matter (ratified), F13 |
| 12 | Repo visibility | **private now; Matter flips public at ship** | cheap-to-undo | this plan (default) |
| 13 | Example app | `examples/ledger-angular` + `examples/ledger-api` (.NET 10) — the build's target and the OSS demo | cheap-to-undo | Matter, §7 Q1 |
| 14 | MCP SDK | v1 (`^1.30`) | **one-way door** mid-flight (touches every registration) | feasibility A |
| 15 | Merge authority for the weekend | **RULED: blanket** for verified green slices into `main` of `jigbench`; S6 (amber) and the `v0.1.0` tag/publish/public flip stay per-item y/n | cheap-to-undo | Matter, 2026-09-05 13:05 |
| 16 | Ollama on this desktop | **RULED: install** Ollama (winget, per-user) and pull `qwen2.5-coder:7b` (~4.7 GB); S5 is tested against the real model here | cheap-to-undo (uninstall) | Matter, 2026-09-05 13:05 |
| 17 | Documentation intake | **S2b · docs clamp** — `jigbench clamp --docs <folder>` reads markdown / text / PDF text into `.jig/survey/docs.json` (heading-chunked) and the drafter retrieves from it (keyword rank for v0.1; embeddings later) | cheap-to-undo | plan amendment at approval (counter-challenge); Matter may cut |

## 3. Design spec reference

- **Design spec:** the commission (`COMMISSION.md` §2 product, §3 tongue, §4 slices, §5 architecture)
  + `FEASIBILITY.md` §B layout and boundaries. The **bench chassis** (which panels, where) is ruled
  tonight from concepts A/B/C in `design-book/10-jig/` — S1 builds chassis-neutral primitives; S4/S5's
  UI takes the verdict.
- **Module / structure impact:** new repo. Boundary rules (feasibility §B.1) are law: `core` has no
  I/O and imports nothing else; `bench` imports core *types* only and talks to `server` over HTTP/WS;
  adapters import core interfaces only; `cli` wires `server`. `examples/` is a fixture, imported by nothing.
- **Contracts / interfaces:** `SurveyAdapter` · `Drafter` · `PlateHost` (server seams);
  the `.jig/` file formats (survey JSON, gauges in DTCG shape, work-order markdown + frontmatter,
  fixture JSON, toolpath JSON) — **versioned, golden-tested**.
- **ADR needed?** ☑ two, short: ADR-001 pull-not-push MCP + v1 SDK; ADR-002 proxy-injection over
  dev-server plugin. Written in S1 (`docs/adr/`).

## 4. Slice table *(tracer-bullet vertical slices; waves = parallel groups)*

| Slice | Definition of done | Testable acceptance | Non-goals | Feasibility | Tier |
|---|---|---|---|---|---|
| **S1 · shell** (wave 1, alone) | Monorepo + `core` types and pure functions (survey, gauges, mark, work-order ladder + frontmatter, fixture, toolpath) + `server` boot (HTTP/WS, stderr-only logger) + `cli` (`jigbench`, `jigbench mcp`, `jigbench init`, `jigbench survey`) + `bench` chassis-neutral shell (panel primitives, WS client, SIM strip, tokens from `starter.css`) + `examples/` (Angular 20 Ledger: list/detail/form, standalone, signals, SCSS tokens; .NET 10 minimal API with OpenAPI + recorded `openapi.json`) + `CONTEXT.md`, `MAP.md`, `docs/adr/001-002` | `npm i && npm test` green; `npx jigbench` from `examples/ledger-angular` serves the bench on localhost and the SIM strip says what is not wired; `.jig/` schema golden tests pass; CI guard: `jigbench mcp` writes nothing but JSON-RPC to stdout | no real survey, no proxy, no model | layers exist: greenfield | green |
| **S2 · survey** (wave 2) | `adapters/angular` (ts-morph over `@Component`: selector, class, file, inputs/outputs, templateUrl/styleUrls; routes; tokens from SCSS/CSS custom properties, DTCG output) + `adapters/dotnet` (OpenAPI fetch first; regex-lite C# fallback badged STUB: controllers, minimal-API maps, DTO records → JSON Schema) → `.jig/survey/*.json`, `.jig/gauges.json` | unit against `examples/` fixtures: every Ledger component found with its file; ≥1 route; every SCSS custom property a gauge; every API DTO a schema; the fallback path sets `stub:true` | Angular Material M3 tokens, Tailwind v4, Vue, Blazor | ts-morph ^28, ts-json-schema-generator: PROVEN available; coverage of standalone/signals: PRESUMED → proven by the fixture test | green |
| **S2b · docs clamp** (wave 2) | `jigbench clamp --docs <folder>`: markdown + plain text + PDF text (`pdf-parse`) → `.jig/survey/docs.json` as heading-chunked sections with file + line provenance; the drafter's context builder ranks chunks by keyword overlap with the mark and the app's surveyed names; the bench lists clamped docs in the survey panel | unit: a fixture folder (3 md, 1 txt, 1 pdf) yields chunks with provenance; a mark about "invoice due date" retrieves the chunk that mentions it first; a folder with no docs yields an empty, honest list (not an error) | embeddings, OCR, docx, web pages | `pdf-parse` available; keyword rank is pure TS | green |
| **S3 · plate** (wave 2) | Reverse proxy in `server` in front of the target dev server: HTML rewrite injects the loupe script; WebSocket pass-through for HMR; selective header handling (`X-Frame-Options`, CSP) that **reports** what it changed; the loupe script (vanilla): hover outline, click → `ng.getComponent` → nearest surveyed selector → component + file over postMessage; the plate frame in `bench` | e2e smoke: `ng serve` of `examples/ledger-angular` behind the proxy loads in the plate with the loupe present; clicking an invoice row names `InvoiceListComponent` and its file; HMR still reloads | React/Vue/Expo, source maps | proxy: PROVEN pattern; Angular CLI Vite host check through the proxy: PRESUMED → proven by the smoke | green (fast bail rule: if the host check blocks, the fix is a documented dev-server note, never a silent workaround) |
| **S4 · gauges** (wave 3) | Gauges panel: categories (colour · type · space · radius · shadow · motion · z), two-way lit with the plate (swatch → instances; component → gauges); components list with inputs/outputs and instance counts; "printed" affordance | component tests: click swatch → lit set equals survey usages; click component → its gauges lit | Storybook integration (read `index.json` only if present — one afternoon later) | S2 outputs exist | green |
| **S5 · marks → work orders** (wave 3) | Mark on the plate (numbered, persisted); `Drafter` seam with `OllamaDrafter` (JSON-schema `format`), `AgentDrafter` (pull via MCP tool in S6; until then a queued state), `HumanDrafter`; the human face; **release = held ~800 ms** (Law I); on release the shop face is filled (Angular idiom from the survey: files, patterns, tests to write) and `.jig/work-orders/NNNN-<slug>.md` is written; state ladder in frontmatter; logbook + scrap bin (Law II); every drafted order badges *who* drafted it | unit: frontmatter schema valid, ladder transitions legal only; integration: Ollama stubbed → draft; Ollama absent → degrade to queued/human with the badge; golden test on the work-order file | editing app source; multi-user | Ollama structured outputs: PROVEN (docs); on this desktop: pending decision 16 | green |
| **S6 · MCP** (wave 4) | `jigbench mcp` on stdio (v1 SDK): tools `jig_survey`, `jig_gauges`, `jig_work_orders`, `jig_work_order`, `jig_fixture`, `jig_draft` (agent submits a draft for an open mark), `jig_claim`, `jig_report` (done + summary → trial-fit state); resources `jig://work-orders/*`; prompt `implement-work-order`; `jigbench init` writes `.mcp.json`; `jigbench mcp install --claude-desktop` writes the Desktop config entry (shows the diff first) | integration: an MCP test client over stdio lists tools, reads a work order, submits a draft, reports done and the ladder moves; **stdout-purity CI guard red-first**; `claude mcp list` on the desk shows `jig` | HTTP transport, sampling, push notifications, elicitation | v1 SDK interop with today's Claude Code: PRESUMED → proven by `claude mcp list` + one real call | **amber** — brain reviews plan and diff; per-item merge y/n |
| **S7 · fixtures** (wave 3) | Fixture = seeded data from the survey's schemas (`json-schema-faker` + faker, fixed seed); apply two ways: proxy answers `/api/*` from the fixture when loaded; loupe fills forms (native setter + events); fixtures persisted in `.jig/fixtures/` | unit: same seed → identical output; integration: proxied `/api/invoices` returns the fixture; e2e: the Ledger form fills | MSW, DB seeding | schemas from S2 | green |
| **S8 · trial fit + toolpath** (wave 4) | Toolpath = recorded click/input sequence on the plate (our own event log, not rrweb), replayable; trial fit = when `jig_report` marks done, the plate reloads and a second frame shows *before* beside *after*, the toolpath replays on both | e2e smoke: record → replay reaches the same DOM state; report-done → two frames, ladder at `trial fit` | video export, pixel diff | S3 + S5 + S6 | green |
| **S9 · sketch** (stretch) | A plate mode: blank sheet drawn with the gauges; hotspots link screens; saved to `.jig/sketches/` | unit + click-through; if unbuilt the tab is a labeled placeholder, never blank | free-form drawing tools | S1 + S4 | green |
| **S10 · OSS + ship** | CI matrix (Windows + Ubuntu) green; README quick-start; `npm pack --dry-run` clean; `v0.1.0` tag; **publish + flip public only on Matter's word** | CI green on `main`; `npx jigbench` from a clean clone of `examples/` works on the desk | changesets/provenance (manual publish for v0.1) | — | green (publish/public: Matter's y/n) |

**Fan-out and merge:** each slice is one Sonnet Senior in its own worktree on `delegate/build-sN`, test-first; the brain diff-verifies every report against the diff and re-runs the headline gate itself before merging to `main` (decision 15). **S1 splits in two parallel workers** from the founding commit: **S1a** (skeleton · core · server · cli · bench shell · ADRs) and **S1b** (`examples/ledger-angular` + `examples/ledger-api`), since `examples/` is not a workspace package. Waves: **S1a ‖ S1b** → **S2 ‖ S2b ‖ S3** → **S4 ‖ S5 ‖ S7** → **S6 → S8** → **S9 · S10**.

**Autonomy-tier legend:** green → host-native controls + the review gate, delegate freely. amber → tier grant (lock + guard hooks); human reviews the plan **and** the diff. red → not used in this plan.

## 5. Verification plan

- Deterministic gates per slice: typecheck ☑ · unit ☑ · integration where named ☑ · e2e smoke where named ☑ · **stdout-purity guard** (S1 onward, red-first) ☑ · `npm pack --dry-run` (S10) ☑
- Conformance tests: the golden `.jig/` files; the survey fixture test over `examples/`; the ladder transition table.
- Adversarial probing ☑ on S6 (the boundary) and S3 (the proxy's header handling) · Mutation testing ☐ (post-Tuesday)
- Council of judges per `aedl-verify`: four core axes — Standards · Spec · Security (never optional) · Design (the floor, `docs/DESIGN-TEAM.md` §6) — judge count scaled to tier (green 4 / amber 6); run per **wave**, on the accumulated diff `origin/main...HEAD`, Sonnet judges; any unanimous security finding is a hard stop.
- Security + supply-chain screen ☑: OWASP Top-10 on the proxy (header rewriting, path traversal in `.jig/` writes, no shell from user input); dependency check — no package younger than 14 days without a stated reason.

## 6. Risk & rollback

- **Top risks:** (1) the target's CSP / `X-Frame-Options` blocks the plate — mitigation: selective handling that reports itself; fallback is the one-line script-tag paste (F8). (2) Angular CLI host check rejects the proxied origin — mitigation: documented dev-server note. (3) Ollama absent or slow on the laptop — drafter degrades to agent pull / human fill by design. (4) Serial time — mitigated by the wave fan-out; **S9 is the first thing cut.** (5) stdout pollution — CI guard.
- **Rollback plan:** every slice is a branch; `main` only receives verified slices; `.jig/` is regenerable (survey) or human-authored (work orders) — nothing in the target app is ever modified by Jig.
- **One-way doors (surfaced, never silently defaulted):** decisions 4, 8, 10, 14 above — all already ruled by Matter or the commission; **publishing to npm and flipping the repo public are Matter's explicit y/n at ship.**

## 7. Out of scope (whole plan)

- React / Next / Expo / Blazor adapters · Tauri wrapper · `node-llama-cpp` driver · Tailwind v4 and Angular Material M3 token extraction · Storybook beyond reading `index.json` · rrweb · cloud, accounts, telemetry · editing application source · a light theme (recorded as a later decision).
