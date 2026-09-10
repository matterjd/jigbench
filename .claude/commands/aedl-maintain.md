---
description: Run a numbered maintenance pass over the agentic harness (aedl -maintain) — mine observer/blocked logs, worklogs, exchange notes, and issues into evidence-backed findings, then fix them under the harness's own rules and record docs/maintenance/maintenance-log-<N>.md. --dry-run = findings only.
argument-hint: [--dry-run | <focus, e.g. "delegation locks" or "review cycle">]
allowed-tools: Read, Glob, Grep, Write, Edit, Task, AskUserQuestion, Bash(git fetch:*), Bash(git status:*), Bash(git switch:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git log:*), Bash(git diff:*), Bash(gh issue:*), Bash(node -e:*), Bash(bash .claude/hooks/preflight-check.sh:*), Bash(bash .claude/hooks/activate-lock.sh:*), Bash(bash .claude/hooks/release-lock.sh:*), Bash(bash .claude/hooks/worklog-append.sh:*), Bash(bash .claude/hooks/worklog-render.sh:*), Bash(bash .claude/hooks/tests/verify-guards.sh), Bash(bash .claude/hooks/tests/verify-worklog.sh)
---

Execute the `harness-maintenance` skill at `.claude/skills/harness-maintenance/SKILL.md`.

Maintenance request (if provided): $ARGUMENTS

The pass (numbered; pass 0 = docs/maintenance/maintenance-log-0.md, the reference run):
1. **Evidence sweep** (read-only): delegations/observer-log.md + blocked.logs + worklogs;
   review-cycles/observer-log.md + state files; agent-exchange notes both directions; open
   issues (dedupe); the previous maintenance log's loose ends first.
2. **Findings:** evidence-backed, classified — (a) control-plane / brain-only, (b) delegable
   skill/doc, (c) out-of-scope → issue. Ranked by observed cost.
3. **Decision harvest:** ONE batched question round (scope, execution mode, §6 preconditions:
   sessions stopped + zero live locks). `--dry-run` STOPS here with the findings report.
4. **Execute:** branch → control-plane fixes brain-direct (tests first, suites green, live
   smoke) → delegable fixes via a T3 `subagent-delegation-workflow` run that doubles as the
   live E2E → review → merge.
5. **Record & land:** write maintenance-log-<N>.md, update issues + memory, squash-merge to
   main per the `-merge` convention, push. Restart sessions only after main carries it.

Guardrails: never weaken a guard to clear a finding; control-plane edits only under
SUBAGENT-AUTHORIZATION §6 conditions; every pass numbered + logged; findings that balloon
become issues, not scope. Do NOT auto-sync — the pass lands via the merge convention.
