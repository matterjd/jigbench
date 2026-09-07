# HANDOFF — next-session entry point

**seat:** Delivery · **branch:** `main` · **written:** 2026-09-07 (night) · v0.1.0 shipped · Matter first live test → AMENDMENT 1 (the simplification) · v0.2 in flight

## State

Founded 2026-09-05 from the Design seat's commission (now canonical at `docs/design/COMMISSION.md`;
chassis ruled: A · The Surface Plate + steals, see `docs/team/v0.1/CHASSIS.md`). Plan
`docs/EXECUTION-PLAN.md` = #1, APPROVED 13:05 with blanket merge for verified green slices.
**On `main` (`f5c385c` = tag `v0.1.0`):** all ten slices, QA's closing record + demo note, both council fix passes, the CI portability fix and the guard-timeout fix. **CI green on Windows + Ubuntu** (run 34043647335). **Repo PUBLIC** (Matter, 2026-09-06 ~11:00 CDT); GitHub release `v0.1.0` carries `jigbench-0.1.0.tgz` (175 kB, 6 files; `npx --yes ./jigbench-0.1.0.tgz` control PASS from a clean directory). Debt: #2 #3 #4 #5. Delegation records for the amber slice: matter-notes `delegations/2026-09-06-jig-s6-*`.
**Done since:** `jigbench@0.1.0` is on npm (Matter's 2FA, 2026-09-06); registry-verified with a clean-dir `npx --yes jigbench@0.1.0 survey` + `init`. `fix/suite-stability` merged after three clean fresh-checkout runs (CI green on both legs at ee3917a; OrdersService.close() drains background drafts on shutdown). Ollama's tray app is down after the reboot — start it (or `JIG_NO_MODEL=1`) before the demo.

**AMENDMENT 1 (2026-09-07, `docs/design/AMENDMENT-1-the-simplification.md`):** after Matter's first live test (six chassis defects fixed on main at `981ce94`; retest passed 1–4, 6, 17, 19–22) he ruled the simplification — one loop (point/sketch → requirement → **Prompt** → **Build** button runs `claude -p` → refine), Polish on demand, the loop-only default view with everything else under Advanced, `.jig/prompts/` with draft → ready → building → built. **In flight:** S14 retest fixes (22/23: MCP served the wrong repo root — `init` now writes `--repo`; 18 fixtures fill; 5 badge fields) on two branches · S11 prompt model + Build runner (server/core/cli) · concept D · The Quiet Bench (Fable prototyper, `design-book/10-jig/`) for Matter's verdict → S12 the quiet chassis, S13 sketch snapping, S15 ship 0.2.0.

**→ Next session: merge S14 (fresh-checkout control, ff), then S11; put concept D in front of Matter and, on his verdict, build S12 + S13; Tuesday's first clamp runs on whatever is on main that morning with the loop's server side (S11) the priority; then S15 ships 0.2.0 (his OTP).**
