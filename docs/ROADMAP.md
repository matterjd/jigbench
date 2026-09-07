# ROADMAP — beyond 0.2.0

The table `docs/design/AMENDMENT-1-the-simplification.md` §6 ruled (A5, 2026-09-07), carried
forward as the plan of record for what comes after 0.2.0. Every row keeps the two rules the
amendment set: **the loop never depends on a survey adapter, and adapters only enrich** (component
names and files, gauges, routes, endpoints, docs). Where no adapter matches, the survey says so
honestly and the loop still runs — the plate proxies the dev server, Point selects by DOM path and
tag, the prompt carries what Jig knows, Build runs Claude Code in the repo.

The tongue (`docs/design/COMMISSION.md` §3, as amended) and the design floor do not change with
any of this.

## Shipped in 0.2.0

| Layer | What landed | Slice |
|---|---|---|
| The loop | Point → requirement → Polish (on demand) → held Ready → Build (`claude -p` in the repo) → Built with *before* one click away; the artifact is a Prompt under `.jig/prompts/` | S11, S12, S13 |
| The quiet bench | Concept D: rail Point · Sketch · Hand, the prompt card, Prompts · Inspect · Design system, one status line, the Advanced drawer housing every v0.1 instrument | S12 |
| Any app with a dev server | the generic `web` adapter (CSS/SCSS/Less gauges, a dev-server guess, honest framework hints, components and routes marked unknown rather than invented); runtime component naming Angular → React → Vue; nested workspaces (`apps/*`, `packages/*`) | S16 |
| Setup in the app | one command (`npx jigbench`); the Clamp screen (recent benches, the folder browser, the survey shown as it runs, Start the app, Docs, Register with Claude Code); the setup checklist one click from the status line; MCP stays the secondary door | S17a, S17b |

## v0.3 — the next stacks

| Layer | How it generalises | Notes |
|---|---|---|
| **React / Next / Vite** adapter | components via react-docgen-typescript; routes via React Router / the Next app dir; tokens via the web adapter plus Tailwind (v3 `resolveConfig`; v4 `@theme` CSS) | the runtime naming (React fiber walk) already exists from S16 — this row is the *survey* side |
| **Vue / Svelte** | vue-component-meta; Svelte via the compiler's metadata | the loupe already names Vue components via `__vueParentComponent`; Svelte stays tag + DOM path until the adapter lands |
| **Expo / React Native** | Expo web on the plate; components via the same React resolver | the plate needs a dev server; Expo web gives it one |
| **Server-rendered** (Blazor/Razor, Rails, Django, PHP) | templates/partials by file scan, routes from the framework's table, gauges via the web adapter; the plate proxies the running site | no runtime component naming — Point names by tag + DOM path, honestly |
| **APIs beyond .NET** | OpenAPI/Swagger documents first (framework-neutral); regex-lite fallbacks per language only where a spec is absent | the .NET adapter's `openapi-file` → `openapi-live` → `regex-stub` ladder is the pattern |

## Debt carried forward (open issues)

| # | Debt | Where it bites |
|---|---|---|
| #2 | `pdf-parse` pulls a native transitive dependency | the docs clamp on a locked-down machine |
| #3 | the trial-fit e2e flakes under load | CI, occasionally |
| #4 | esbuild advisory | `npm audit` noise, no runtime exposure |
| #5 | karma `qs` advisory in the Angular example | the fixture's own dev deps, not Jig's |
| #6 | the work-order log on a round-trip | migrated prompts only |
| #8 | the Advanced mirror switch is not wired to a built Prompt's before/after | Advanced → the mirror |
| #10 | `cli init` / `mcp install` duplicate the server's setup functions | maintenance, not behaviour |

## Not planned

Cloud, accounts, telemetry, editing application source, a light theme, a Tauri wrapper, a
`node-llama-cpp` driver, rrweb — unchanged from `docs/EXECUTION-PLAN.md` §7.
