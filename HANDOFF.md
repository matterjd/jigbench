# HANDOFF — next-session entry point

**seat:** Delivery · **branch:** `main` · **written:** 2026-09-07 14:18 CDT · code at `f391e74`, CI green on both legs (run 34154660552) · **next hand: a REMOTE session — paste `docs/team/v0.2/REMOTE-KICKOFF.md`**

## State

Founded 2026-09-05 from the Design seat's commission (`docs/design/COMMISSION.md`, F1–F22; the plan is #1, APPROVED 13:05 with blanket merge for verified green slices). **v0.1.0** (`f5c385c`, tag + GitHub release with the tarball, `jigbench@0.1.0` on npm, repo PUBLIC): ten slices, both council fix passes, CI on Windows + Ubuntu. Matter's first live test → six chassis defects and retests 22/23/5/18 fixed → **AMENDMENT 1** (`docs/design/AMENDMENT-1-the-simplification.md`, rulings A1–A6, binding): one loop, a Build button that runs `claude -p`, Polish on demand, the loop-only default view, the artifact is a Prompt; any app with a dev server (A5); setup happens in the app (A6). Concept D · The Quiet Bench ruled CHASSIS as is.

**On `main` at `f391e74` (every merge from a detached integration worktree, CI cited per sha; the record is issue #1):**
- **S11** prompt model + Build runner (`d469028`): `.jig/prompts/`, `POST /api/prompts/:id/build` spawns `claude -p`, Polish, MCP aliases, `jigbench build|prompts`.
- **S16** any-app (`a785b11`, run 34151686639): `@jigbench/adapter-web`, nested workspaces, the loupe resolves Angular → React → Vue, survey-first `--target`.
- **S12** the quiet bench (`a1c10a1`, run 34154264789): concept D built — rail Point · Sketch · Hand, the prompt card (Polish → held Ready → Build), Prompts · Inspect · Design system, one status line, the Advanced drawer; sketch snaps; `docs/team/v0.2/{CHASSIS,LOOP-TEST-RUN}.md`.
- **S17a** setup, server side (`f391e74`, run 34154660552): the Bench host (`POST /api/clamp|unclamp`), folder browser (`/api/fs/*`), target runner (`/api/target/*`, `target-log` over WS), setup checklist (`/api/setup*`, `/api/docs/clamp`), recent benches; `jigbench` with no repo serves `bench: null` — the Clamp screen (S17b) is not built yet.

**Debt:** #2 pdf-parse native · #3 trial-fit e2e flake · #4 esbuild advisory · #5 karma qs · #6 work-order log on round-trip · **#7 the bench mirrors S11's Prompt types · #8 Advanced mirror switch unwired · #9 logbook has no source · #10 CLI setup refactor.**

**Rules of record:** integrate only in a detached worktree (`git worktree add --detach ../jigbench-int origin/main`), push `HEAD:main`, verify `git log -1 origin/main`, cite the CI run's sha; never edit `examples/` source, `QUALITY.md`, `docs/quality/`; no real `claude -p`, `npm link`, or `claude mcp add` in tests; publish and visibility are Matter's. While the desk is his: no local test control — CI decides, one merge at a time.

**Matter owes the desk:** the Clamp-screen + loop retest (after S17b), `npm publish` 0.2.0 with his OTP and the `v0.2.0` tag/release, delete `wo/0003-days-overdue`, start the Ollama tray app (or `JIG_NO_MODEL=1`).

**→ Next session (REMOTE — paste `docs/team/v0.2/REMOTE-KICKOFF.md`): build S17b, the Clamp screen on S12's chassis over S17a's `/api/fs`, `/api/clamp`, `/api/target` and `/api/setup` routes, folding #7 and #9; then S15 ships 0.2.0 (TEST-RUN for the loop, ROADMAP, CHANGELOG, version, `npx-control.sh` green) — each through a PR with both CI legs green and recorded on #1; tag, publish and visibility stay Matter's.**
