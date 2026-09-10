---
description: AEDL stage 1 — read-only Discovery & Context. Produce or refresh a repo's context triad (CONTEXT.md + MAP.md + stack profile), inventory feasibility against the real code, and extract the batched question set for the decision harvest (aedl -discovery).
argument-hint: [<repo>] [<objective> | refresh]
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(git status:*), Bash(git log:*), Bash(git rev-parse:*), Bash(ls:*), Bash(bash .claude/hooks/tests/verify-guards.sh), Bash(bash .claude/hooks/tests/verify-worklog.sh)
---

Execute the `aedl-discovery` skill at `.claude/skills/aedl-discovery/SKILL.md`.

Target repo / objective (if provided): $ARGUMENTS

Read-only stage. In order:

1. Resolve the repo from `repos[]` in `config/workspace.yml` — **exact on-disk path**, never the
   display name. Read the repo's OWN instruction/config files first; they are authoritative.
2. Refresh the **context triad**: `MAP.md` (structure — required per repo) · `CONTEXT.md` (domain
   language + load-bearing decisions and *why*) · `docs/stack-profiles/<repo>.md` (checkable house
   standards, each citing its source file). Every artifact carries `Last refreshed`.
3. Run the repo's real test/build commands once and record the **verified** baseline in the profile.
   Never state a suite count you did not observe.
4. **Feasibility inventory** (if an objective was given): for each layer/endpoint/table/component the
   objective assumes, read the code and record ✅/❌ with `file:line`. Never trust the ticket text.
5. **Extract** every human-only question — including ones embedded in the repo's own instructions —
   and write the set down. Do NOT ask them here; stage 1.5 asks them in ONE batched round.
6. Report and stop. No code, no branch, no tracker writes — those are later stages.

Only writes: `CONTEXT.md`, `MAP.md`, the stack profile. Where the profile and the repo's instruction
files disagree, **the repo wins** — fix the profile.
