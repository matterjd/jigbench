# HANDOFF — next-session entry point

**seat:** Delivery · **branch:** `main` · **written:** 2026-09-06 04:40 CDT · waves 1–4 + S9 on main · S10 (ship) in flight

## State

Founded 2026-09-05 from the Design seat's commission (now canonical at `docs/design/COMMISSION.md`;
chassis ruled: A · The Surface Plate + steals, see `docs/team/v0.1/CHASSIS.md`). Plan
`docs/EXECUTION-PLAN.md` = #1, APPROVED 13:05 with blanket merge for verified green slices.
**On `main` (`bfacce2`):** every slice but S10 — shell · examples · survey adapters · docs clamp · plate proxy + loupe · chassis A + gauges + palette · marks → work orders (Ollama drafter, held RELEASE, shop face, tray/spine/shop lane) · fixtures · trial fit mirror + toolpath · **S6 MCP on stdio (AMBER, merged on Matter's y/n 2026-09-06)** · **S9 Sketch mode** · two council fix passes. Fresh-checkout control on main with the model unreachable (`JIG_OLLAMA_URL=http://127.0.0.1:9`): 133 files / **1056 tests**, typecheck, build, full-stream stdout guard green. Claude Code 2.1.259 sees `jig ✔ Connected`. Debt: #2 (pdf-parse native transitive), #3 (trial-fit e2e flake under load). Delegation records for the amber slice: matter-notes `delegations/2026-09-06-jig-s6-*`.
**In flight:** S10 ship — one publishable `jigbench` bundle (workspace packages inlined, third-party deps external), `npm pack` tarball + the clean-temp-dir `npx ./jigbench-0.1.0.tgz` control, CI (Windows + Ubuntu, `JIG_NO_MODEL=1`), README/USING/CHANGELOG. **Not yet done:** QA's closing record (`QUALITY.md` numbers beside commands, `docs/quality/v0.1.md`, `docs/team/v0.1/demo-1.md` click-through, RETRO); `npm publish` + the public flip (Matter's word).

**→ Next session: merge S10 after the fresh-checkout control (the packed-tarball `npx` control is the decisive gate), spawn QA for the closing record + demo note, then ask Matter for the two ship calls — `npm publish jigbench@0.1.0` and flipping the repo public — and hand him the demo click-through (`npx jigbench` in `examples/ledger-angular` with Claude Code connected).**
