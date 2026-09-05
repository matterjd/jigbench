# Jig v0.1 — sprint plan

## Goal

Ship `npx jigbench` usable against an Angular + .NET 10 repo: survey, plate with the loupe,
gauges, marks that become work orders, MCP over stdio for Claude Code and Claude Desktop, and the
trial fit when the shop reports a work order done.

## Slices, waves, and owners

Each slice is one Sonnet Senior in its own worktree on `delegate/build-sN`, test-first. QA gates
the wave before the next one starts. The brain (Fable) leads: diff-verifies every report against
the diff and re-runs the headline gate before merging to `main`.

| Wave | Slices | Owner | QA gate |
|---|---|---|---|
| 1 | S1 — shell | Sonnet Senior | typecheck + unit + smoke (`npx jigbench` serves localhost); QA signs off before wave 2 opens |
| 2 | S2 — survey, S3 — plate | Sonnet Senior (one per slice, parallel) | S2: unit against `examples/` fixtures; S3: e2e smoke through the proxy; QA signs off before wave 3 opens |
| 3 | S4 — gauges, S5 — marks→work orders, S7 — fixtures | Sonnet Senior (one per slice, parallel) | component tests (S4), unit + integration (S5), unit + integration (S7); QA signs off before wave 4 opens |
| 4 | S6 — MCP, then S8 — trial fit + toolpath | Sonnet Senior | S6: MCP test client over stdio + stdout-purity CI guard, amber tier (brain reviews plan and diff); S8: e2e smoke record→replay |
| 5 | S9 — sketch (stretch), S10 — OSS + ship | Sonnet Senior | S9: unit + manual click-through; S10: CI green on Windows + Ubuntu, `npm pack --dry-run` clean |

## Acceptance per slice

- **S1:** `npm i && npm test` green; `npx jigbench` from `examples/ledger-angular` serves the
  bench on localhost and the SIM strip says what is not wired; `.jig/` schema golden tests pass;
  CI guard confirms `jigbench mcp` writes nothing but JSON-RPC to stdout.
- **S2:** every Ledger component found with its file, at least one route, every SCSS custom
  property a gauge, every API DTO a schema, the .NET fallback path sets `stub:true`.
- **S3:** `ng serve` of `examples/ledger-angular` behind the proxy loads in the plate with the
  loupe present; clicking an invoice row names the component and its file; HMR still reloads.
- **S4:** clicking a swatch lights the set equal to the survey's usages; clicking a component
  lights its gauges.
- **S5:** frontmatter schema valid, ladder transitions legal only; Ollama stubbed produces a
  draft; Ollama absent degrades to queued/human with a badge.
- **S6:** an MCP test client over stdio lists tools, reads a work order, submits a draft, reports
  done, and the ladder moves; the stdout-purity guard is red-first; `claude mcp list` shows `jig`.
- **S7:** the same seed produces identical fixture output; the proxy serves the fixture on
  `/api/invoices`; the Ledger form fills.
- **S8:** record then replay reaches the same DOM state; reporting a work order done shows two
  frames with the ladder at trial fit.
- **S9:** unit tests and a manual click-through pass, or — if unbuilt — the tab is a labeled
  placeholder, never blank.
- **S10:** CI is green on the Windows + Ubuntu matrix; `npx jigbench` works from a clean clone
  against `examples/`.

Full detail: `docs/EXECUTION-PLAN.md` §4.
