---
name: harness-maintenance
description: Run a numbered maintenance pass over the agentic harness — mine operational evidence (delegation/review-cycle observer logs, blocked logs, worklogs, agent-exchange notes, open issues), compile workflow stoppages and conflicts into evidence-backed findings, fix them under the harness's own rules (control-plane changes brain-direct per the SUBAGENT-AUTHORIZATION §6 runbook, skill/doc changes via a T3 delegation that doubles as a live E2E), and record docs/maintenance/maintenance-log-<N>.md. Use for the @aedl -maintain command (/aedl-maintain), "run a maintenance pass", "what's been breaking in the harness", or "--dry-run" for findings-only.
---

# Harness Maintenance Pass

The harness maintains itself with the same discipline it imposes: evidence first, decisions
front-loaded, control-plane edits human-supervised, everything else delegated under a grant,
every pass numbered and logged. **Pass 0** (2026-07-05) is the reference run — see
[`docs/maintenance/maintenance-log-0.md`](../../../docs/maintenance/maintenance-log-0.md).

## When To Use

- Periodically: after a batch of delegations/review cycles, when `blocked.log` entries
  accumulate, or when observer-log lines start describing workarounds instead of work.
- On request: "analyze what's been going wrong", "compile harness improvements".
- `--dry-run`: phases A–C only — findings report, no changes.

**Not for:** feature work (that's `@aedl -lifecycle`), fixing one known bug (just fix it),
or note-vault housekeeping (sync/MAP upkeep belongs to `sync-workflow`).

## Standard Process

### Phase A — Evidence sweep (read-only)
Read, in order, skipping anything already covered by a prior `docs/maintenance/` log:
1. `delegations/observer-log.md` + each recent `delegations/<id>/{blocked.log,worklog.md,report.md}`
   — stoppages, false blocks, workarounds, under-reported deviations.
2. `review-cycles/observer-log.md` + `review-cycles/*/state.yml` — stalled phases, cap-vs-converged,
   manual steps that surprised the human.
3. Agent-exchange notes, BOTH directions (`agent_exchange.exchange_path` from config) — peer
   learnings not yet applied here.
4. Open issues (`gh issue list`) — to dedupe, not to re-find.
5. Delivery-team retros — `docs/team/*/RETRO.md` in this repo AND in each provisioned repo
   (`repos[]` from config): the "What the harness should change" section is a pre-written
   findings list (DELIVERY-TEAM.md §5; a retro no process consumes is decoration).
6. The previous `maintenance-log-<N-1>.md` — carried-forward loose ends come first.
7. `notes/ai-usage/claude/usage-log.md` (v2 rows: Scale·Lane + task slugs) and the observe
   kit's `time-log.md` (`session_close.observe_kit` from config) — where the hours actually
   went. The harness-vs-product lane ratio is a standing health metric: **a week under 50%
   pure-product hours is a finding.** *(Added 2026-08-21: both artifacts were write-only for
   99 and 107 rows respectively — this item is their named consumer.)*

### Phase B — Findings
One evidence-backed line per finding: **what stopped/conflicted, the evidence (file:line or
log line), the fix surface**. Classify each: **(a) control-plane** (guards, hooks, settings,
lock machinery — brain-only), **(b) delegable** (skills, commands, docs — T3 worker),
**(c) out-of-scope** (file/annotate an issue instead). Dedupe against open issues. Rank by
observed cost (sessions lost > friction > polish).

### Phase C — Decision harvest (one round)
Batch every human call into ONE `AskUserQuestion` round (scope depth, execution mode,
anything irreversible). For a full pass over control-plane findings, confirm the §6
preconditions explicitly: **all other sessions stopped, zero live locks**. `--dry-run`
ends here: report findings + proposed split, change nothing.

### Phase D — Execute (the pass itself)
1. **Branch** from fresh `origin/main` (e.g. `maint/<slug>`).
2. **Control-plane fixes brain-direct** under the §6 runbook: tests FIRST
   (`verify-guards.sh` red → green), `*.sh.new` + `bash -n` + `mv` for live hooks, both
   suites green, live smoke (replay the offending commands; probe a true positive).
3. **Delegable fixes via `subagent-delegation-workflow`** (T3, work repo = this repo,
   base = the maintenance branch tip, documented HR3 deviation) — the delegation doubles
   as the live E2E of whatever Phase D.2 changed. Worker reports via
   `references/worker-report-schema.md`.
4. **Review** (evidence-based, security first), merge worker branch, final suites.

### Phase E — Record & land
1. Write `docs/maintenance/maintenance-log-<N>.md` — copy the shape of log 0: trigger,
   evidence reviewed, findings→outcomes table, incidents & lessons, verification counts,
   loose ends carried forward.
2. Update/close the issues each finding mapped to; update memory.
3. Land the changes on main, then push. **The route depends on the repo, and only one of the
   two exists here:** in the **vault** (matter-notes) that is this repo's `-merge` convention,
   a squash-merge. In a **kit-provisioned project repo** `@aedl -merge` does not exist and
   merges are **PR-gated and the Product Owner's** (`DELIVERY-TEAM.md` §3.3) — open a PR and
   request merge authorization; never auto-merge. *(Corrected 2026-08-20: this step named the
   vault route unconditionally, and this skill ships to project repos.)*
   Restart sessions only after main carries the changes (preflight freshness depends on it).

## Expected Output

- Dry run: findings list (classified a/b/c) + proposed execution split. No file changes.
- Full pass: the maintenance log, commits on main, suites green, issues updated, and a
  closing summary with the pass number and what the next pass should watch.

## Guardrails

- **Never weaken a guard to clear a finding.** A false positive is fixed by better
  targeting, not by removing the rule (pass 0's target-based rewrite is the pattern).
- **Control-plane edits only under §6 conditions** — sessions stopped, zero live locks,
  human approval on record. If the user can't stop sessions now, do the dry run and stop.
- **Tests before guards.** No guard edit lands without a failing-then-green suite case.
- **Every pass gets a number and a log.** No silent maintenance — the logs are the
  longitudinal record that makes the next pass cheaper.
- **One pass at a time; bounded scope.** Findings that balloon become issues, not scope.

## Learning Notes

- **Pass 0 (2026-07-05):** the A3 respawn path got its first real exercise mid-pass (host
  restart killed the doc worker; resume + partial-work handover worked, and the resumed
  worker caught 2 gaps in its predecessor's edits). Two harness-env lessons now encoded as
  tests: MSYS path-form mismatches (argv/env converted, file contents not — harness uses
  `cygpath -m`) and bash `read` collapsing empty tab-separated fields (locks.js emits `-`
  placeholders).
