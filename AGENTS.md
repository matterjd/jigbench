# AGENTS.md — agent entry point for jigbench

Read this file first, before any tool call that touches a file path or runs a terminal command in
this repo. It applies to any AI agent working here — Claude Code, Claude Desktop, or anything
else.

## What this repo is

`jigbench` is Jig: a local-first benchtop that clamps an existing app repo, surveys it, and turns
a marked-up change into an agent-ready work order. See `README.md` for the product,
`docs/EXECUTION-PLAN.md` for the build plan, and `CONTEXT.md` for locked decisions and vocabulary.

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

Full map with source-of-truth notes: `MAP.md`.

## Boundary rules (law, not convention)

- `core` imports nothing else in this repo and no Node I/O module.
- `server` never imports `bench` or `cli`.
- `bench` never imports `server`, `adapters`, `fs`, or `child_process` — it talks to `server` only
  over HTTP/WS.
- `cli` imports nothing but `server`'s public API.
- `adapters/*` import core interfaces only — never `server`, `bench`, or each other.
- `examples/*` is a fixture. Nothing imports it.

Full table with reasons: `CONTRIBUTING.md`.

## The `.jig/` convention

Jig's own state lives under `.jig/` inside whatever repo it clamped — not inside this repo, unless
you are working in `examples/`. Its shape:

```
.jig/
  survey/                  what the survey found: stack, screens, components, tokens
  gauges.json              the design system, categorized
  fixtures/                reproducible test data
  work-orders/
    NNNN-slug.md           one work order per file; state lives in its frontmatter
  toolpaths/               recorded click sequences
  sketches/                screens drawn before they exist
```

**Jig never edits application source.** It only ever writes under `.jig/`. If a change you are
making would have Jig write anywhere else in a clamped repo, stop — that is out of scope, not an
edge case to handle.

## Test-first

A change lands red before it lands green. Write the failing test, then the code that passes it.
See `CONTRIBUTING.md`.

## stdout is reserved

`packages/server` and `packages/cli` speak MCP over stdio. stdout carries JSON-RPC only. Never
write to stdout in a server or CLI code path — no `console.log`, no stray print. Log to stderr or
a file instead.

## Dev environment

Development on this project is Windows-first. The shell is Git Bash. Every command in these docs
is bash, not PowerShell — run it as written.

## Where to look next

- The build plan and locked decisions: `docs/EXECUTION-PLAN.md`
- Locked decisions and shared vocabulary in one place: `CONTEXT.md`
- Where things are: `MAP.md`
- The current session baton: `HANDOFF.md`
- How to contribute: `CONTRIBUTING.md`
