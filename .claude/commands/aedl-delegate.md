---
description: Delegate a scoped task to a worker sub-agent under a signed tier grant (T1–T4) with mechanical guardrails (aedl -delegate). Sets a lock, spawns the worker, collects its report, clears the lock. Guardrail-level containment, not a sandbox.
argument-hint: [status | log <id> | release <id> [--force] | resume <id> | <tier T1-T4> <objective> [--branch <name>] [--expiry <minutes>]]
allowed-tools: Read, Glob, Grep, Write, Edit, Task, Bash(git fetch:*), Bash(git status:*), Bash(git switch:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(node -e:*), Bash(bash .claude/hooks/preflight-check.sh:*), Bash(bash .claude/hooks/activate-lock.sh:*), Bash(bash .claude/hooks/release-lock.sh:*), Bash(bash .claude/hooks/worklog-append.sh:*), Bash(bash .claude/hooks/worklog-render.sh:*)
---

Execute the `subagent-delegation-workflow` skill at `.claude/skills/subagent-delegation-workflow/SKILL.md`.

Delegation request (if provided): $ARGUMENTS

Subcommands: `status` (list every live lock in `config/delegation-locks/`, one per concurrent delegation), `log <id>` (render the delegation work log timeline via `bash .claude/hooks/worklog-render.sh <id>`), `release <id> [--force]` (end that specific run by its delegation id / stale-lock recovery), and `resume <id>` (worker died mid-run but the lock + brain session are alive — respawn under the same grant; see the skill's "Worker death / resume (A3)" section) — see the skill's Subcommands section for full detail.

Delegation lifecycle:
1. Resolve `repo_path`; gather objective + tier (default T4) + work-branch + expiry (default 120m, mandatory) + work repo (default = control-plane repo).
2. Refuse if a live lock already covers this **work repo**, or this session already owns a live lock elsewhere (one grant per work repo, one lock per session — non-overlapping delegations on different work repos run concurrently); `git fetch origin`.
3. Mint `delegations/<id>/`, write the filled `grant.md` (`scope_confirmed: true`); append a `created` work-log line (`worklog-append.sh`).
4. `git switch -c <branch> origin/main` (HARD RULES 2+3).
5. **Preflight: `bash .claude/hooks/preflight-check.sh` — if it FAILS, STOP (do not run a worker unenforced).**
6. Generate + hash a release token (bare commands), then `bash .claude/hooks/activate-lock.sh <id> <tier> <work_repo|""> <branch> <expiry> <hash>` — this writes `config/delegation-locks/<id>.yml` atomically, enforces the per-work-repo/per-session invariants, prunes any expired locks, and appends its own `lock-set` work-log line. Immediately append the `spawn` work-log line (still the brain's job) — last brain action before spawning. (Guards auto-append `block` / `peer-allowed` / `expiry` while the lock is live; `release-lock.sh` appends `released`.)
7. Spawn ONE worker (Task) with the grant + tier table + HARD RULES + objective + the worker report schema (`references/worker-report-schema.md`, embedded verbatim) — it reports as its final message in that shape.
8. Release the lock: `bash .claude/hooks/release-lock.sh <id> <token>` (both args mandatory, even on failure — deletes only that lock file, idempotent if already gone).
9. Persist `report.md`, append a `report` work-log line + `observer-log.md`, refresh `MAP.md`; summarize, confirming `config/delegation-locks/<id>.yml` is gone.

If the worker dies mid-run, use `resume <id>` rather than starting over — it re-hashes the release token and re-spawns under the identical grant, pointed at the existing worklog so finished work isn't redone.

Guardrail-level containment only — do NOT delegate out-of-repo-writing skills (brain-only) or adversarial work needing hard isolation. Do NOT auto-sync — issue `/aedl-sync` when ready.
