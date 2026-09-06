# QUALITY.md

Living quality dashboard. QA-owned — do not edit outside a QA pass.

Each number sits beside the command that produced it.

**Last measured:** 2026-09-06, at `main` `36995e4` (all ten slices merged), by QA in worktree
`jigbench-qa` (branch `qa/v0.1-record`). Env for every test run below:
`JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9` (model made unreachable — matches the brain's
own fresh-checkout control on every merge from S8 onward).

## Packages

| Package | Test files | Tests | Coverage | Open defects | Command |
|---|---|---|---|---|---|
| core | 15 passed | 131 passed | not measured | 0 | `npx vitest run --project core` |
| server | 56 passed \| 1 skipped (57) | 504 passed \| 1 skipped (505) | not measured | 0 | `npx vitest run --project server` |
| cli | 11 passed \| 2 skipped (13) | 60 passed \| 2 skipped (62) | not measured | 0 | `npx vitest run --project cli` |
| bench | 38 passed | 305 passed | not measured | 0 | `npx vitest run --project bench` |
| adapters/angular | 6 passed | 28 passed | not measured | 0 | `npx vitest run --project adapter-angular` |
| adapters/dotnet | 5 passed | 31 passed | not measured | 0 | `npx vitest run --project adapter-dotnet` |
| **root total** | **134** (131 passed / 3 skipped) | **1062** (1059 passed / 3 skipped) | not measured | 4 open (#2 #3 #4 #5) | `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9 npm test` |

Per-package counts sum exactly to the root total (131+504+60+305+28+31 = 1059 passed;
15+56+11+38+6+5 = 131 files passed, +1 server +2 cli skipped = 3 skipped files, matching root's
"3 skipped"). Root command's exact deciding line:

```
 Test Files  131 passed | 3 skipped (134)
      Tests  1059 passed | 3 skipped (1062)
```

**Coverage: not measured.** `@vitest/coverage-v8` is not installed (`npx vitest run --project core
--coverage` → `MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'`; confirmed absent
from `node_modules/@vitest/`). Per QA's write scope, no new dependency was installed to produce a
number — this row stays honest rather than green.

## Gates

Command, result, and the commit each was measured at — all `36995e4` unless noted.

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | Typecheck | `npm run typecheck` | exit 0, clean across core/server/cli/bench/adapter-angular/adapter-dotnet |
| 2 | Unit + integration (root) | `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9 npm test` | `Test Files 131 passed \| 3 skipped (134)` · `Tests 1059 passed \| 3 skipped (1062)` |
| 3 | Build | `npm run build` | exit 0, clean; bench bundle 353.74 kB JS / 34.06 kB CSS |
| 4 | stdout-purity guard | `npm run check:stdout` | `OK: jigbench mcp completed a real initialize -> tools/list round trip (9 tools); the ENTIRE stdout stream ... carried JSON-RPC only ... exited 0` |
| 5 | plate-smoke (S3) | `bash scripts/plate-smoke.sh` | `SMOKE: PASS` — 5/5 checks (loupe injected, loupe.js servable, deep route proxied, `/api/plate` up, no `X-Frame-Options`). **Prereq:** `cd examples/ledger-angular && npm ci` — the script's own header names this; a first run without it fails "ledger-angular never started listening on :4200" |
| 6 | fixture-smoke (S7) | `bash scripts/fixture-smoke.sh` | `SMOKE: PASS` — 9/9 checks (survey, create/load fixture, `/api/plate` reports it, proxied `/api/invoices` carries `x-jig-fixture`, differs from the real API, unload reverts) |
| 7 | trialfit-smoke (S8) | `bash scripts/trialfit-smoke.sh` | `SMOKE: PASS` — 11/11 checks (mark → human face → drafted → released → claimed → reported done → trial-fit; mirror up on :4602; toolpath saved + read back byte-for-byte) |
| 8 | mcp-smoke, read-only (S6) | `bash scripts/mcp-smoke.sh` (no `JIGBENCH_SMOKE_GLOBAL`) | `PASS: mcp-smoke (read-only)` — build OK, stdout-purity + tools/list round trip OK, real SDK Client + StdioClientTransport e2e OK; global-state step (`npm link` / `claude mcp add`) `SKIPPED` by design (opt-in only) |
| 9 | Release build + pack | `npm run build:release && npm run pack:release` | `jigbench-0.1.0.tgz` — 175.7 kB packed / 633.2 kB unpacked, 6 files (matches the S10 merge record exactly) |
| 10 | npx-control (S10) | `bash scripts/npx-control.sh "$(pwd)/jigbench-0.1.0.tgz"` | `PASS: npx control -- survey, init, serve+health+html, and mcp all green against the packed tarball in a clean directory` — survey 7 components · 5 routes · 7 endpoints · 13 schemas · 30 gauges |
| 11 | DCO check (full history) | `bash scripts/check-dco.sh a33755b HEAD` | `FAIL` on exactly **one** commit, `1a24e2a` — already known and accepted at wave-1 council (finding #8, disposition "accept: fix-forward — every merge from here is `-s`; no rewrite of pushed history"). Not a new finding; CI's own DCO job only runs on `pull_request` diffs, never this full-history range |
| 12 | Floor tests by name | `JIG_NO_MODEL=1 npx vitest run --project bench floor-motion floor-button-reset floor-colour-literals tongue` | `Test Files 4 passed (4)` · `Tests 18 passed (18)` |
| 13 | `examples/ledger-api` — dotnet | `cd examples/ledger-api.tests && dotnet test` | `Passed! - Failed: 0, Passed: 12, Skipped: 0, Total: 12` (note: the actual xUnit project is the sibling `ledger-api.tests/`, not `ledger-api/` itself — `examples/README.md` "Build & test" already documents the correct path) |
| 14 | `examples/ledger-angular` — Angular | `npm ci && npx ng test --watch=false --browsers=ChromeHeadless` | `TOTAL: 30 SUCCESS` (Chrome Headless 152, Karma). `node_modules` removed after (not tracked; keeps the fixture directory clean) |

Deterministic gates ☑ typecheck · unit · integration · e2e smoke · stdout-purity · `npm pack
--dry-run`-equivalent (`pack:release`) — all green. Conformance (golden `.jig/` files, survey
fixture test, ladder transition table) — covered inside the per-package suites above (not
separately re-run; no separate command exists for them). Adversarial probing on S6/S3 — covered
by the wave-3/wave-4 verify councils (`docs/quality/v0.1.md` §3), not re-run by QA this pass.
Mutation testing — post-Tuesday, not yet built.

## Open defects

`gh issue list -R matterjd/jigbench --label debt --state open` (2026-09-06):

| # | Title | Filed | Severity |
|---|---|---|---|
| [#2](https://github.com/matterjd/jigbench/issues/2) | pdf-parse pulls a native `@napi-rs/canvas` binary transitively — install risk on locked-down laptops | 2026-09-05 (S2b) | Medium |
| [#3](https://github.com/matterjd/jigbench/issues/3) | `http.trialfit` e2e test is timing-sensitive under full-suite load (1 failure in 3 fresh runs) | 2026-09-06 (S6 merge) | Medium |
| [#4](https://github.com/matterjd/jigbench/issues/4) | tsup's bundled esbuild (0.27.3–0.28.0) has a Windows dev-server arbitrary file-read advisory | 2026-09-06 (QA closing pass) | Low (dev-tooling only, not shipped) |
| [#5](https://github.com/matterjd/jigbench/issues/5) | `examples/ledger-angular`'s karma pulls a vulnerable transitive qs/body-parser (moderate) | 2026-09-06 (QA closing pass) | Moderate (dev-tooling only, fixture app) |

Query at zero is the goal before the next feature opens (charter §7). Four open, all non-critical,
none blocking v0.1.

## Council rounds (verify pipeline)

Four rounds ran across the ten-slice build — waves 1, 3, and 4 (wave 2 folded straight through with
no separate council comment on jigbench#1). Full findings tables, severities, and dispositions are
in `docs/quality/v0.1.md` §3 — not duplicated here to avoid a second copy going stale.
