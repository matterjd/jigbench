# Standups — v0.1

## 2026-09-05

**Done:** commission ruled, repo founded, plan written.
**Doing:** awaiting approval, S1 next.
**Blockers:** approval.

## 2026-09-06

**Done:** all ten slices (S1–S10) on `main` at `36995e4`; QA's closing record built in
`jigbench-qa` — every gate re-run and reproduced (typecheck, 1059/3-skipped root suite + six
per-package counts, build, stdout guard, all four smokes, the release tarball + npx-control,
the DCO check, four named floor tests, both example-app test suites), `QUALITY.md` and
`docs/quality/v0.1.md` written, `docs/team/v0.1/demo-1.md` walked live against the Ledger
fixture, two new debt issues filed (#4 esbuild advisory, #5 karma's qs/body-parser advisory).
**Doing:** handing the closing record + demo note to Matter for the four Matter-only checks
(the work laptop, a real repo, the Claude Desktop installer, the RELEASE hold's fill/ember
visual) and the two ship calls — `npm publish jigbench@0.1.0` and the public flip.
**Blockers:** none from QA. Four open `debt` issues (#2 #3 #4 #5), all non-critical, none
blocking; burn-down is a Lead/Matter scope call before the next feature opens.
