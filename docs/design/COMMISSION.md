---
title: "COMMISSION — Jig: a local-first benchtop for shaping a feature before an agent builds it"
date: 2026-09-05
seat: Design
status: RULED — F1–F4 by Matter in batch 1 (2026-09-05 11:40 CDT); F5–F22 defaults ACCEPTED AS WRITTEN and F15 ruled React + Vite in batch 2 (2026-09-05 12:35 CDT); §7 answered; concepts A–C built and FLOOR CLEAR; VERDICT 2026-09-05 — A chassis, steals from B (spine, shop lane) and C (mirror + scrubber); GRADUATED to jigbench/docs/design/COMMISSION.md (canonical from now; this copy is the round's record) · AMENDED 2026-09-07 by AMENDMENT-1-the-simplification.md (Matter, after the first live test: one loop, one Build button, Polish on demand, the loop-only default view, the artifact is a Prompt) — rows F5/F6/F7/F11/F13/F14/F20 read through the amendment
supersedes: nothing. A NEW PRODUCT (DESIGN-TEAM decision 9 — the grill fires first).
tracker: matterjd/jigbench (founded 2026-09-05, private until Matter flips it at ship)
---

# COMMISSION — Jig

**Matter's ask, 2026-09-05 (verbatim):** *"I need you to build me a prototype editor for web &
mobile applications that uses an AI model (llama or something small) to wright agent ready
implementation details and requirements on how the feature works. It's duty is manly to create
files locally. This tool should be able to review the repository for an existing application or
take in documentation. How will it be able to do this? I would like an mcp server that runs
locally that other tools, like Claude, can connect to an implement changes. The view in the
application should be what ever is simplest to render and allow clicks to be performed to show
how features work, an ability to auto populate test data, a translation layer for the
application's required tech stack on feature approval, ability to highlight components, text,
etc. and request changes via a prompt, the ability to demo the application with the change, show
the design system of the application categorized and interactable. I want to see what we can come
up with this weekend. … My goal is to be able to start using this Tuesday with my prototype
repository + our real application's repository."* And: *"use your best, artistic work with this.
Lead with UX and ease of use. i want it do be like a benchtop, think a photoshop / illustrator /
CAD / etc. Make sure it is setup for open source work."*

**Deadline:** usable **Tuesday 2026-09-08** on the personal desktop (Windows 11, RTX 4060 8 GB,
Node 24) and the work laptop (Windows, Git Bash, likely no admin) against **his prototype repo and
the real work application (Angular + .NET 10)**.

---

## 1. The decisions this is built on

Rows marked **RULED** are Matter's, 2026-09-05. Rows marked **DEFAULT** were the seat's stated
inference with its one-line reason; **Matter accepted every default as written in one reply
(2026-09-05 12:35 CDT, "Accept all defaults")**, so each DEFAULT row below now binds exactly as a
RULED row does — the marker is kept so the record shows which rows he authored and which he
ratified. F15 he ruled directly (React + Vite). The design book's floor is not a row: it binds
every surface (`docs/DESIGN-TEAM.md` §6).

| # | Question | Answer |
|---|---|---|
| F1 | Which agents connect over MCP on Tuesday? | **RULED: Claude Code and Claude Desktop.** Both speak stdio MCP; both register a local server from a config file. Copilot and Cursor are welcome later but shape nothing now. |
| F2 | Which app stacks must Jig survey and render on Tuesday? | **RULED: Angular (frontend) + .NET 10 (APIs and backend).** React/Next, Expo and Blazor are post-Tuesday adapters behind the same plugin seam. |
| F3 | How does Jig itself run? | **RULED: a local server + a browser UI.** `npx jigbench` in a repo starts the server, serves the bench at `http://localhost:<port>`, and speaks MCP on stdio to whichever agent launched it. No install, no admin, no Rust toolchain. A desktop wrapper is a later decision, not a default. |
| F4 | The name | **RULED: Jig.** A jig guides the tool so every cut lands the same — what an agent-ready work order does. The bare npm name `jig` is a dead 2022 Jenkins-IRC bot (one version, unmaintained), so the package and repo are **`jigbench`** — *"the Jig bench"* — free on npm and GitHub (checked 2026-09-05). The product says **Jig**; the command says `npx jigbench`. |
| F5 | What Jig writes, and where | **DEFAULT: files in the clamped repo under `.jig/`** — `survey/`, `gauges.json`, `fixtures/`, `work-orders/NNNN-<slug>.md`, `toolpaths/`, `sketches/`; `.jig/cache/` gitignored. *Reason:* the ask is "mainly to create files locally", and the team shares them through the repo they already share. Jig **never edits application source** — agents do. |
| F6 | The agent-ready artifact | **DEFAULT: the work order** — one markdown file with two faces: the *human face* (what, why, where on the surface, acceptance, fixture) and the *shop face* (the implementation brief in the app's own stack idiom, filled on approval by the translation layer: files to touch, patterns the survey found, tests to write). One file, one change, frontmatter carries state. |
| F7 | Where the drafting model lives | **DEFAULT: a local small model first, the connected agent as a boost — pull, never push.** A `Drafter` seam with three drivers, tried in order: (1) a running **Ollama** at `localhost:11434` — its Windows installer is per-user (no admin) and a portable zip exists; its JSON-schema `format` gives structured output — default model **Qwen2.5-Coder-7B-Instruct** (Apache-2.0) on the 4060, **Phi-4-mini-instruct** (MIT, 3.8B) on a CPU laptop; (2) the **agent drafter** — when Claude is connected it calls `jig_draft` on an open mark and hands the draft back (MCP sampling is *deprecated* in the 2026-07-28 spec and unconfirmed in Claude Code, so the agent pulls); (3) no model → the mark still becomes a work order the human fills. In-process `node-llama-cpp` is a post-Tuesday driver: native binaries are the install risk on a locked-down laptop. *Reason:* his words say local; the boost costs nothing when the agent is already attached. *(Research sweep 2026-09-05, verified.)* |
| F8 | How Jig renders an existing app | **DEFAULT: the app's own dev server, through Jig's local proxy, in a frame on the plate.** The proxy injects the *loupe script* into HTML responses so the target repo changes **nothing**. Angular dev mode exposes `ng.getComponent` / `ng.getOwningComponent`, so a click resolves to a live component; the clicked element then walks up to the nearest tag matching a **surveyed selector**, so the survey — not source maps — names the file. *Fallback:* paste one script tag. *Known risks (sweep):* a target's `X-Frame-Options` / CSP, and the dev server's HMR WebSocket, both pass through the proxy and must be handled, not stripped blindly. |
| F9 | Screens that do not exist yet | **DEFAULT: a Sketch mode** — low-fidelity screens drawn on the plate with the app's own gauges (tokens), clickable through hotspots, so a UX partner can prototype a new feature before code. Sketches are files (`.jig/sketches/`). *Stretch for Tuesday; chassis for the product.* |
| F10 | Test data | **DEFAULT: fixtures generated from the survey's data shapes** — .NET DTOs / OpenAPI → JSON Schema → seeded faker — applied two ways without touching app code: the proxy serves fixture responses for `/api/*` when a fixture is loaded, and the loupe fills forms by dispatching the input events Angular honours. Seeds make every fixture reproducible. |
| F11 | The demo of the change | **DEFAULT: the trial fit** — when the agent reports a work order done over MCP, the plate reloads and shows the app *with* the change beside the app *before* it (two frames, Law II's fate mirror). A recorded **toolpath** (click sequence) replays on both. |
| F12 | The design system view | **DEFAULT: Gauges** — the survey's tokens categorized (colour · type · space · radius · shadow · motion · z) and *interactable*: click a swatch and every place it is used lights on the plate; click a component on the plate and its gauges light in the panel. Components list with their inputs/outputs and instance counts; Storybook is used when the repo has it, never required. |
| F13 | Jig's own design register | **DEFAULT: Obsidian & Ember from `tokens/starter.css`, dark first** (floor items 8–9), tokens named so a light theme is a swap, not a rewrite. *Reason:* every benchtop Matter named — Photoshop, Illustrator, CAD — is a dark cockpit; the book's floor already binds a new surface to the starter. A light theme is a post-Tuesday decision with a record. |
| F14 | Jig's tongue | **DEFAULT: the shop tongue (§3), each term paired with its plain word at first encounter.** *Reason:* the meta-law says an app names its elements in its own words; the ask says ease of use for engineers **and** UX teams — so the pairing is the compromise, and the banned list keeps the generic words out of the UI. |
| F15 | Bench UI framework | **RULED: TypeScript, React + Vite** (Matter, batch 2). *Reason offered:* the widest open-source contributor pool and the richest panel/canvas ecosystem; the loupe script injected into target apps is framework-free vanilla either way. Angular 20 was the stated alternative and was not taken. |
| F16 | Monorepo shape | **DEFAULT: npm workspaces** — `packages/core` (survey, work orders, gauges, fixtures; pure TS, no I/O), `packages/server` (HTTP + WebSocket for the bench, MCP on stdio, the proxy, the drafters), `packages/bench` (the web UI), `packages/cli` (`jigbench`), `packages/adapters/*` (one per stack: `angular`, `dotnet`). npm 11 is on both machines; pnpm is not. |
| F17 | License and hygiene | **DEFAULT: Apache-2.0**, Contributor Covenant code of conduct, `CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates, **DCO** sign-off via one Action (no CLA), GitHub Actions CI on Windows + Ubuntu, changesets for releases, `npm publish jigbench` with provenance. *Reason:* the sweep's call over MIT — Apache's patent grant matters for a tool that runs inside corporate laptops; the weights are downloaded at first run and never redistributed under either. MIT stays the one-word override. |
| F18 | Privacy posture | **DEFAULT: nothing leaves the machine unless an agent is connected; no telemetry; no accounts.** The README states it in the first screen. |
| F19 | The harness inside the OSS repo | **DEFAULT: the control plane stays in matter-notes.** `jigbench` is registered in `config/workspace.yml` `repos[]` as a delegation target; it carries `AGENTS.md`, `HANDOFF.md`, `QUALITY.md`, and `docs/team/` (honest process docs), but **not** the vendored `.claude/hooks` kit — contributors should not inherit our guards. |
| F20 | What Tuesday must do (the cut list) | **DEFAULT:** `npx jigbench` in the prototype repo → the bench opens → the survey completes for Angular + .NET 10 → Gauges shows the tokens → the plate shows the running app with the loupe → a mark becomes a drafted work order → approve → the file lands in `.jig/work-orders/` → Claude Code (via `.mcp.json`) reads and implements it → the trial fit shows the change → one fixture fills a form or an API. Toolpath record/replay if time; Sketch is stretch. |
| F21 | Non-goals, on record | Jig never edits app source · no cloud, no accounts, no multi-user · no Figma import · no React/Expo/Blazor adapter before Tuesday · no Tauri wrapper · no code generation of the *feature* itself (that is the shop's job). |
| F22 | Who builds what | **DEFAULT:** concepts by Fable Prototypers (DESIGN-TEAM decision 4); research and feasibility by Sonnet workers; the build by Sonnet Seniors in a Delivery seat on `jigbench`; adversarial verification per `aedl-verify`; the brain on Fable. *Reason:* Matter, 2026-09-05: "Save our usage with fable, use the other models where needed, like our harness wants." |

---

## 2. What the product is

**Jig is a benchtop for shaping a feature before an agent builds it.** You *clamp* an existing app
— its repo, or a folder of its docs — into the bench. Jig *surveys* it: stack, screens, components,
gauges, data shapes. The app lands on the *plate* as a working, clickable surface. You put the
*loupe* on anything, say what should change, and Jig's local model drafts a *work order*: the
requirement, the acceptance, the fixture, and — on approval — the shop brief in the app's own
stack idiom. The work order is a file in the repo; any connected agent picks it up over MCP,
builds it, and Jig shows the *trial fit*. Nothing leaves your machine unless you connect an agent.

Jig is deliberately **not** a code generator and not a design tool. It is the fixture between the
two — the thing a UX partner and an engineer both hold while deciding what to build.

## 3. The tongue

Jig's own words, with the plain word each pairs with at first encounter. Generic words in the
right column are **banned as the name of anything on the surface** — a panel, a button, a state,
a file — but each may appear **once, as the plain-word pairing** beside the shop word where it is
first met (*"Release — approve it"*), and freely in prose and docs. *(Clarified 2026-09-05 after
concept A's prototyper found the pairing column and the banned column overlapping for Bench and
Release and dodged both; the pairing was always the point.)*

| Jig says | Plain word (first encounter) | Never |
|---|---|---|
| **Bench** | workspace — one per clamped repo | project, workspace |
| **Clamp** | attach a repo or docs folder | import, open, connect |
| **Survey** | the read of the repo: stack, screens, components, gauges, data shapes | scan, analysis, index |
| **Plate** | where the app renders and is clicked | preview, canvas, viewport |
| **Loupe** | point at anything and see what it is | inspector, select, selection |
| **Mark** | a highlighted spot with a request attached | annotation, comment, selection |
| **Work order** | one change: human face + shop face | ticket, issue, task, spec |
| **Release** *(a work order)* | approve it — the shop face is filled and the file is written | approve, submit |
| **The shop** | the connected agents (Claude Code, Claude Desktop) | AI, assistant, bot |
| **Trial fit** | the app with the change, beside the app before it | demo, preview, diff |
| **Toolpath** | a recorded click sequence, replayable | flow, journey, recording |
| **Fixture** | a reproducible set of test data | mock data, seed, dummy data |
| **Gauges** | the design system, measured and categorized | tokens, theme, styles |
| **Sketch** | a screen that does not exist yet, drawn with the gauges | wireframe, mockup |
| **Scrap bin** | where anything removed goes, counted and regenerable (Law II) | trash, delete |
| **Logbook** | the record of everything that happened on the bench | history, activity, audit log |

## 4. The Tuesday cut, in slices

Ordered by dependency, each a tracer bullet. Autonomy tiers are proposed; the Execution Plan
fixes them.

| Slice | What lands | Tier |
|---|---|---|
| S1 | `packages/cli` + `server` + `bench` shell: `npx jigbench` opens the bench on an empty plate with the tool rail, panels, logbook; SIM strip honest about what is not wired | green |
| S2 | Survey: `adapters/angular` (components via ts-morph on `@Component`, routes, tokens from SCSS/CSS custom properties and Angular Material) + `adapters/dotnet` (controllers / minimal APIs → endpoints; DTOs → JSON Schema; `openapi.json` when present) → `.jig/survey/` | green |
| S3 | Plate: the proxy in front of the app's dev server, loupe script injected, click → component → file | green |
| S4 | Gauges panel, two-way lit against the plate | green |
| S5 | Marks → work orders: the `Drafter` seam, Ollama driver, the human face, release → shop face → `.jig/work-orders/` | green |
| S6 | MCP on stdio: tools + resources for survey / gauges / work orders / fixtures / report-done; `.mcp.json` writer for Claude Code; a `jigbench mcp install --claude-desktop` helper | amber (it is the boundary another program crosses) |
| S7 | Fixtures: schema → seeded data; proxy-served API fixtures; loupe form-fill | green |
| S8 | Trial fit + toolpath record/replay | green |
| S9 | Sketch mode | green · stretch |
| S10 | OSS hygiene, CI, `v0.1.0` on npm | green |

## 5. Architecture defaults (pending the feasibility note)

- **One Node process, two mouths.** MCP on stdio for the agent that launched it; HTTP + WebSocket
  on localhost for the bench. All logging goes to stderr or a file — a stray `console.log` on
  stdio corrupts the MCP stream. MCP rides the stable v1 TypeScript SDK
  (`@modelcontextprotocol/sdk` 1.x — the 2026-07-28 v2 spec is five weeks old); **the agent
  pulls** through tools and resources, and Jig never depends on push notifications or sampling.
- **The .NET survey reads OpenAPI first.** .NET 9+ serves `/openapi/v1.json` when the API runs;
  the C#-parsing fallback (controllers, minimal-API maps, DTO records) is regex-lite and says so.
- **Pure core.** `packages/core` has no I/O; adapters and drafters are seams
  (`SurveyAdapter`, `Drafter`, `PlateHost`) so a new stack or model is one package.
- **The proxy is the trick that costs the target nothing.** It rewrites HTML responses to add the
  loupe script and, when a fixture is loaded, answers `/api/*` from the fixture. Everything else
  passes through.
- **Files are the state.** `.jig/` is the store of record; the server holds indexes it can rebuild.
  A work order's state lives in its frontmatter.

## 6. Feasibility note

The six-lens research sweep (local model · MCP · prior art · render/inspect · extraction · OSS),
each lens adversarially verified by a skeptic, is recorded in
[RESEARCH-sweep-2026-09-05.md](RESEARCH-sweep-2026-09-05.md). The Architect's and Principal's
costed read of the slices — buildable / one-way door / defer, with the PROVEN / PRESUMED table —
is [FEASIBILITY.md](FEASIBILITY.md).

**The gap is real (prior-art lens, verified):** no surveyed tool is at once local-first,
design-system-aware, click-through on an *existing* repo, and emitting agent-ready specs over
MCP. Closest neighbours each hold one axis — Onlook (local visual editing with an MCP layer, but
React/Next + Tailwind only, and it edits code rather than writing specs), dev-inspector-mcp
(click-to-inspect over MCP, no specs), Storybook / Style Dictionary / Figma Dev Mode MCP (design
truth, no click-through of the app), spec-kit / Kiro / Task Master (specs for agents, no rendered
app, no design system).

## 7. Questions only Matter could answer — answered (batch 2, 2026-09-05)

1. **The prototype repository is not on this machine yet.** Jig therefore ships its own tiny
   Angular + .NET 10 example app under `examples/` — the build's test target and the open-source
   demo — and Matter clamps his real repos on Tuesday.
2. **The work laptop has everything:** Claude Code runs there, Node 22+ is installed, Ollama is
   allowed (per-user install or portable zip), and the work app runs locally (`ng serve` +
   `dotnet run`). So `.mcp.json` in the repo is the registration path at work, and no runtime
   needs bundling.
3. **Bench UI framework: React + Vite** (now F15 RULED).

## 8. The weekend, as critique windows

| When (CDT) | What Matter sees | What he rules |
|---|---|---|
| Sat evening | Three benchtop concepts, floor-passed, at 1440×900 | Chassis + steals |
| Sun midday | `npx jigbench` on the prototype repo: survey + gauges + plate + loupe | Does the plate feel right on his repo? |
| Sun night | Mark → work order → Claude Code implements → trial fit | Is the work order agent-ready? |
| Mon | Fixtures, toolpaths, docs, `v0.1.0` | Ship / hold |
| Tue | The work app | — |

---

*Concepts land in this folder as `concept-<letter>-<slug>.html` + `.md`; the verdict lands in
`README.md` as a dated section. On approval this commission graduates to `jigbench/docs/design/`
per the book's graduation path.*
