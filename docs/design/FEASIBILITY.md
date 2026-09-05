# FEASIBILITY — Jig

date: 2026-09-05
seat: Design
role: Architect + Principal read, T4

---

## A. Architect — the resource map

Lens cited per line: [local-llm], [mcp], [prior-art], [render-inspect], [extract], [oss].

### External dependencies (pin lines)

| Slice | Package | Pin | Why this line |
|---|---|---|---|
| S1/S6 | `@modelcontextprotocol/sdk` | `^1.30.x` (v1, not v2) | v1 stays supported 6+ months; current Claude Code stdio path negotiates against it — v2 is 5 weeks old [mcp]. PRESUMED default; PROVEN only once `claude mcp list` on Matter's machine confirms negotiated revision. |
| S3 | (none — vanilla loupe script) | n/a | Framework-free by design; avoids a per-target build dep [render-inspect]. |
| S5 | `ollama` (external binary, not npm) | detect at `localhost:11434` | Per-user Windows installer, no admin, portable zip exists — verified [local-llm]/[render-inspect]. PROVEN (research), PRESUMED on Matter's actual laptop until run. |
| S2 | `ts-morph` | `^28.x` | Standard AST path to `@Component` decorators [extract]. |
| S2 | `ts-json-schema-generator` | latest | Actively maintained over `typescript-json-schema` [extract]. |
| S7 | `json-schema-faker` + `@faker-js/faker` | pin `seed` | Deterministic fixtures [extract]. |
| S1 | npm workspaces (npm 11, already installed) | n/a | No new tooling; defensible for 3-4 packages on deadline [oss]. |
| S10 | Changesets, DCO Action | latest | Community-standard release + lightweight contributor gate [oss]. |

### Services / processes

- **One Node process, two mouths** (commission §5): stdio MCP server (agent) + HTTP/WS (bench UI), one in-process store. All logs to stderr/file — a stray stdout write breaks the JSON-RPC stream [mcp, holds].
- **The target's own dev server** (`ng serve`, `dotnet run`) runs unmodified; Jig's proxy sits in front, same-origin, HTML-rewriting to inject the loupe script [render-inspect].
- **Ollama**, if present, is a sibling process Jig calls over HTTP — never spawned/managed by Jig.

### Configs

`.mcp.json` (project-scoped, Claude Code reads it directly):
```json
{
  "mcpServers": {
    "jig": {
      "command": "npx",
      "args": ["jigbench", "mcp"],
      "env": {}
    }
  }
}
```
`claude_desktop_config.json` entry (same stdio shape, different host file):
```json
{
  "mcpServers": {
    "jig": {
      "command": "npx",
      "args": ["jigbench", "mcp"]
    }
  }
}
```
Both PRESUMED shapes — match the documented `command`+`args` stdio form [mcp, high-confidence finding]; not yet round-tripped against a live `claude mcp add`.

### Infra

- GitHub Actions matrix: Windows + Ubuntu, Node LTS, on every PR (S10).
- `npm publish jigbench` with provenance (OIDC) once CI exists; manual publish acceptable for v0.1 same-week [oss].

### Environments — what differs

| | RTX 4060 desktop | No-admin CPU laptop |
|---|---|---|
| Local model | Ollama or node-llama-cpp CUDA prebuilt, 7-9B@Q4 | Ollama CPU path only, ~4B model (Phi-4-mini) [local-llm] |
| Install | Admin available, more headroom | Ollama's per-user installer/portable zip is the only PROVEN no-admin path; node-llama-cpp native binaries have documented corporate-lockdown install failures — PRESUMED risk, not cleared [local-llm] |
| Target app | `ng serve` + `dotnet run` locally, assume yes | Unconfirmed — commission §7 Q2 flags this as an open question for Matter |

### One-way doors

| Door | Why one-way | Recommended default | What reverses it |
|---|---|---|---|
| Bare npm name `jigbench` | Registry names don't transfer casually once published/starred | Ship as `jigbench` (confirmed free 2026-09-05) [oss] | Scope under `@org/` later; existing installs break |
| MCP SDK v1 vs v2 | Tool/resource registration API differs; switching mid-flight touches every `registerTool` call | v1 stable now | Migrate post-Tuesday once client adoption of 2026-07-28 is confirmed broadly [mcp] |
| License Apache-2.0 vs MIT | Relicensing after external contributors join needs consent from all | Apache-2.0 (patent grant) [oss] | Matter's one-word override, pre-first-external-PR only |
| Reverse-proxy injection vs dev-server plugin | Proxy is zero-repo-change; a plugin touches target build config — once contributors depend on the plugin path, dropping it breaks them | Proxy first, plugin opt-in later [render-inspect] | Never remove proxy path; plugin is additive |

### Risk register (ranked)

1. **Proxy vs CSP/X-Frame-Options** — target's own headers can block the iframe or inline script outright; strip/rewrite selectively, never blanket-strip (breaks target's own security model) [render-inspect].
2. **HMR WebSocket through the proxy** — Vite/Angular CLI dev-server sockets need explicit pass-through and origin allowlisting or live-reload breaks silently [render-inspect].
3. **Angular CLI's Vite-based dev server host checks** — `allowedHosts`/origin checks can reject the proxy's rewritten host; needs an explicit dev-server config note to Matter, not a silent workaround.
4. **.NET OpenAPI path when API isn't running** — survey falls back to regex-lite C# parsing, which "says so" (per §5) rather than silently guessing [commission §5].
5. **Ollama absent** — Drafter seam degrades to agent-pull or human-fill; never blocks a work order (§F7 default already covers this).
6. **stdout pollution on stdio** — any `console.log` in a dependency corrupts the MCP stream; needs a lint/CI guard, not just discipline [mcp, holds].

## B. Principal — structure and cost

### 1. Monorepo layout and boundary rules

```
packages/core             pure TS, zero I/O — survey/work-order/gauges/fixture models
packages/server           MCP stdio + HTTP/WS + proxy + drafters — imports core
packages/bench            web UI (React+Vite, F15 default) — imports core TYPES only
packages/cli              `jigbench` bin — thin wiring, imports server
packages/adapters/angular  SurveyAdapter impl — imports core interfaces only
packages/adapters/dotnet   SurveyAdapter impl — imports core interfaces only
examples/                 tiny Angular app + tiny .NET 10 app — NOT a workspace pkg
```

| Package | Must NOT import | Why |
|---|---|---|
| `core` | server, bench, cli, adapters, any Node I/O module | keeps the model testable with no process, matches §5 "pure core" |
| `server` | bench (UI code), cli | server is a library the cli wires up, not an app |
| `bench` | server, adapters, `fs`/`child_process` | browser-sandboxed; talks to server only over HTTP/WS, never in-process |
| `cli` | anything but `server`'s public API | no business logic in the bin — one wiring layer, easy to re-home into a Tauri shell later without rewrite |
| `adapters/*` | server, bench, each other | one stack = one package (F16); a new stack adds a package, touches nothing else |
| `examples/*` | (nothing imports it) | it's a fixture the adapters' tests spawn a dev server against, not a dependency of anything |

### 2. Cost table, S1–S10 (Sonnet Senior, test-first)

| Slice | Hrs | Depends on | Tier | Why the tier | Deterministic gate |
|---|---|---|---|---|---|
| S1 shell | 4 | — | green | pure scaffolding, no target-repo contact | typecheck + unit (cli args, server boot) + smoke (`npx jigbench` serves localhost) |
| S2 survey | 8 | S1 | green | read-only AST/regex over `examples/`, no writes | unit vs `examples/` fixtures (ts-morph decorator hits, DTO→schema) + typecheck |
| S3 proxy+loupe | 6 | S1 | green* | zero target-repo edit, but CSP/X-Frame/HMR risk (§A risk 1–3) — *needs a fast bail, not a tier bump | e2e smoke: proxied `examples/` Angular app loads with loupe script present |
| S4 gauges | 5 | S1, S2 | green | read + render only | unit (token selectors) + component test (click swatch → lit set) |
| S5 marks→work order | 10 | S1, S2 | green | writes only inside `.jig/`, never app source | unit (frontmatter schema valid) + integration (Ollama stubbed, degrade path exercised) |
| S6 MCP stdio | 6 | S5 | **amber** | boundary another program crosses (commission's own call) | integration: MCP test client against stdio (`tools/list`,`tools/call`) + CI lint that stdout carries only JSON-RPC |
| S7 fixtures | 6 | S2 | green | deterministic generation, read-only against app | unit (same seed → same output) + integration (proxy serves fixture on `/api/*`) |
| S8 trial fit + toolpath | 8 | S3, S5, S6 | green | replays recorded events, no new write surface | e2e smoke: record→replay reaches identical DOM state |
| S9 sketch (stretch) | 6 | S1, S4 | green | isolated new mode, nothing else depends on it | unit + manual click-through |
| S10 OSS hygiene | 5 | all | green | docs/CI only | CI green on Windows+Ubuntu matrix, `npm pack --dry-run` |

**~64h total** if run serially by one Sonnet Senior — does not fit a weekend. It fits Tuesday only by fanning S2–S7 out to parallel Sonnet Senior workers once S1 lands (build order: S1 first and alone; S2/S3 in parallel; S4/S5/S7 in parallel after S2; S6 after S5; S8 last before it; S9/S10 trail).

### 3. Defer / stub

**DEFER past Tuesday:** node-llama-cpp in-process driver (native-binary lockdown risk, [local-llm] REFUTED-corrected but still untested here) · React/Expo/Blazor adapters · Tauri wrapper · Changesets+provenance CI (manual `npm publish` covers v0.1) · Tailwind v4 `@theme` parsing · Angular Material M3 token enumeration (needs Sass JS-API compile) · Vue adapter · Sketch mode if S1–S8 run long.

**STUB — must say so in the UI, never guess silently:** .NET survey without a live `/openapi/v1.json` (regex-lite fallback, badge it) · any mark drafted with no Ollama present (badge "drafted by shop" vs "drafted by model") · Sketch mode if unbuilt (placeholder, not a blank tab) · the S1 SIM strip itself (commission §4, already required).

### 4. PROVEN / PRESUMED — the claims §4–§5 rely on

| Claim | Status | Evidence / the experiment that would prove it |
|---|---|---|
| Angular `ng.getComponent`/`getOwningComponent` dev globals exist | PROVEN (research, high-conf) | PRESUMED on Matter's Angular 20 zoneless app until run against `examples/` |
| .NET 10 auto-serves `/openapi/v1.json` | PRESUMED | not checked against Matter's actual API config (could be disabled) — run `curl` against his API |
| Ollama no-admin Windows install | PROVEN (portable zip + per-user installer documented) | PRESUMED on the actual locked-down laptop until installed there |
| Ollama + `qwen2.5-coder:7b` structured output on the RTX 4060 desk | **PROVEN 2026-09-05 13:45** | winget per-user install; `/api/generate` with a JSON-schema `format` returned a valid `{what, why, acceptance[]}` — 81 tokens in 5.05 s (~16 tok/s, first call), cold load 36.6 s. The drafter must show the load as a stated cost (Law III.2). |
| Reverse-proxy HTML-rewrite needs zero target-repo change | PRESUMED | target's CSP/X-Frame-Options/SRI unverified against Matter's Angular dev server — load it through the proxy and read response headers |
| Angular CLI's Vite dev-server tolerates the proxy's rewritten origin | PRESUMED | `allowedHosts`/origin check unverified — run `ng serve` behind the proxy |
| MCP v1 SDK stdio interop with today's Claude Code build | PRESUMED | research flags Claude Code may already run the v2 runtime and auto-negotiate 2026-07-28 — check with `claude --version` / `claude mcp list` |
| ts-morph decorator walk covers Matter's actual component patterns (standalone, signals) | PRESUMED | not run against `examples/` or his repo yet |
| `json-schema-faker` seeded output is deterministic across runs/OS | PROVEN | documented `seed` option |
| `jigbench` is free on npm | PROVEN | registry check, HTTP 404, 2026-09-05 |
| Matter's work laptop can run `ng serve` + `dotnet run` locally | PRESUMED/UNKNOWN | commission §7 Q2 — unanswered |

## C. The three questions the build cannot answer itself

1. **Which folder is the prototype repository?** `cli` needs a `--repo` path or trustworthy cwd-detection wired into S1 before anything else can point at real code.
2. **The work laptop's actual capability profile** (Claude Code installed? Node version? can Ollama install there? does the work app run locally at all?) — this alone decides which Drafter driver and which adapters exist for him on Tuesday.
3. **Bench UI framework — React+Vite or Angular 20?** This fixes `packages/bench`'s entire dependency tree at S1; changing it after S4 is a rewrite, not a patch.
