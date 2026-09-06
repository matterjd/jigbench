# HANDOFF — next-session entry point

**seat:** Delivery · **branch:** `main` · **written:** 2026-09-06 10:35 CDT · all ten slices + QA record on main · CI RED on both legs · suite-stability fix in flight

## State

Founded 2026-09-05 from the Design seat's commission (now canonical at `docs/design/COMMISSION.md`;
chassis ruled: A · The Surface Plate + steals, see `docs/team/v0.1/CHASSIS.md`). Plan
`docs/EXECUTION-PLAN.md` = #1, APPROVED 13:05 with blanket merge for verified green slices.
**On `main` (`034c903`):** all ten slices (S1–S10) + QA's v0.1 closing record (`QUALITY.md`, `docs/quality/v0.1.md`, `docs/team/v0.1/demo-1.md` — Matter's click-through, sent to him in chat). Local fresh-checkout controls were green up to S10 (1059 tests; tarball `npx` control PASS). **The first real CI run (34039471247) is RED on both legs** — three portability items (backslash-path test Windows-shaped; bench-dist fallback lookup on Linux; a Windows temp-dir race with the shop heartbeat) fixed on `fix/ci-portability` (3 commits, unmerged) — but the brain's controls on that branch flake ~1 test per full run on a quiet machine (server-boot e2e files, file-level load failures), so it is NOT merged. **In flight:** `fix/suite-stability` (worktree `../jigbench-stab`, branched from `fix/ci-portability`): root-cause the flakes; bar = five consecutive clean full runs. The Ollama-tray app on this desk stays up; ports 4200/5210/4600–4602 must be free before any smoke. Debt: #2 #3 #4 #5.

**→ Next session: land `fix/suite-stability` (five clean fresh-checkout runs, then merge to main and watch CI go green on Windows + Ubuntu), then Matter's ship calls — `npm login` + `npm publish` of `packages/cli` (`jigbench@0.1.0`; this desk is NOT logged in to npm), the public flip, the `v0.1.0` tag — and his Sunday click-through per `docs/team/v0.1/demo-1.md`; Tuesday he clamps his prototype repo and the work app.**
