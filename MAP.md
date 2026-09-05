# MAP.md

Repo map. Each folder names what it is the source of truth for.

```
packages/core                pure TypeScript, zero I/O.
                              Source of truth for: the survey, work-order, gauges, and fixture
                              data models.

packages/server               MCP stdio + HTTP/WS + proxy + drafters; imports core.
                              Source of truth for: how the bench and the shop talk to the running
                              process.

packages/bench                web UI (React + Vite); imports core types only.
                              Source of truth for: what the bench looks like and how it is clicked
                              through.

packages/cli                  the jigbench bin; imports server.
                              Source of truth for: how Jig is launched (jigbench, jigbench init,
                              jigbench mcp, jigbench survey).

packages/adapters/angular     SurveyAdapter for Angular; imports core interfaces only.
                              Source of truth for: how Angular apps are surveyed.

packages/adapters/dotnet      SurveyAdapter for .NET 10; imports core interfaces only.
                              Source of truth for: how .NET 10 apps are surveyed.

examples/                     a tiny Angular app + a tiny .NET 10 app; not a workspace package.
                              Source of truth for: the fixture every adapter's tests run against.

docs/                         Source of truth for: the execution plan, ADRs, and the v0.1 team
                              plan.

.github/                      Source of truth for: issue templates, the PR template, and CI.
```

## Root files

| File | Source of truth for |
|---|---|
| `README.md` | what Jig is and the 60-second quick start |
| `AGENTS.md` | the agent entry point — any AI agent reads this first |
| `CLAUDE.md` | the Claude-specific pointer into `AGENTS.md` and the harness relationship |
| `CONTEXT.md` | locked decisions and shared vocabulary |
| `MAP.md` | this file |
| `QUALITY.md` | the living quality dashboard (QA-owned) |
| `HANDOFF.md` | the session baton |
| `CONTRIBUTING.md` | how to build, test, and submit a change |
| `SECURITY.md` | how to report a vulnerability |
| `CODE_OF_CONDUCT.md` | the community standard |
| `LICENSE` | Apache-2.0 |
| `.gitignore` | what never gets committed |
