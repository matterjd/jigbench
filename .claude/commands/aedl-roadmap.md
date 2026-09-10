---
description: Reconcile open issues against roadmap surfaces — orphan issues, orphan rows, stale-delivered rows, zombie rows — across one repo or all registered ones. Read-first, one batched approval round, never closes an issue (aedl -roadmap).
argument-hint: [<repo> | all] [--dry-run]
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh pr view:*), Bash(git log:*), Bash(git show:*), Bash(ls:*)
---

Execute the `aedl-roadmap` skill at `.claude/skills/aedl-roadmap/SKILL.md`.

Target repo (or `all`), and flags: $ARGUMENTS

Read-first. In order:

1. **Enumerate both sides and record the counts first** — open issues via the issue-tracker
   adapter (never a direct API call), and roadmap rows from **every** surface the repo has:
   `docs/aedl-roadmap.md` · `ideas/<project>/ROADMAP.md` · `ideas/<project>/BACKLOG.md` ·
   `ideas/parking-lot.md` · any in-repo `ROADMAP.md`. A repo legitimately has more than one.
2. **Match** — prefer explicit `#N` links; fall back to title similarity and mark those matches
   **inferred**, because an inferred match means the link isn't written down anywhere.
3. **Classify** every unmatched item into exactly one class: **orphan issue** (open, no row — the
   class that hides work) · **orphan row** (no issue — often correct; the defect is a row whose
   status is *unknowable*, not one without a ticket) · **stale-delivered** (row says shipped, issue
   still open) · **zombie row** (row open, issue closed). (An issue carrying the debt label is
   planned-by-policy — report it on the DEBT line, never as an orphan.)
4. **Verify the claims** — a row saying "delivered" is a claim; check it against the closing
   commit/PR. "Built but unproven live" is a real, honest status.
5. **ONE batched approval round** — rows to add, rows to re-status, issues to propose closing,
   matches to make explicit. Mark one-way doors (closure, deletion) distinctly. Do not trickle.
6. **Write the approved roadmap changes.** Each repo's roadmap belongs to that repo.
7. **Report the slate** — coverage **per repo**, never one blended number, and name anything
   unreachable rather than omitting it.

**Never close an issue** — propose it with evidence and hand over a paste-ready `bash` command.
**Never mass-file issues to make the table symmetric** — the metric is coverage, not symmetry, and
issue spam inflates the very count the clean-slate figure depends on.
