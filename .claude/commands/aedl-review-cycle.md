---
description: Drive a PR through the Copilot review loop (aedl -review-cycle) — request a Copilot review, watch for comments, delegate a scoped fix pass under a signed grant, verify green, then request merge authorization. Never auto-merges. Resumable per PR.
argument-hint: [status] <PR#> [--repo <owner/name>] [--max-rounds N] [--tier T1]
allowed-tools: Read, Glob, Grep, Write, Edit, Task, AskUserQuestion, Bash(bash .claude/skills/pr-review-cycle/scripts/copilot-review.sh:*), Bash(gh pr view:*), Bash(gh api:*), Bash(gh run view:*), Bash(bash .claude/hooks/preflight-check.sh), Bash(bash .claude/hooks/release-lock.sh), Bash(git fetch:*), Bash(git switch:*), Bash(git rev-parse:*), Bash(git merge:*)
---

Execute the `pr-review-cycle` skill at `.claude/skills/pr-review-cycle/SKILL.md`.

Review-cycle request (if provided): $ARGUMENTS

The loop (resumable per PR via `review-cycles/<repo>-<pr>/state.yml`):
1. **request-review** — `copilot-review.sh request <repo> <pr>` (adds Copilot as reviewer). If it fails, hand off to the human. Re-requesting after a fix pass is a **UI pause that needs a human step** (the API re-request is unreliable) — post the required operator notification (below) rather than waiting silently.
2. **await-review** — poll for Copilot's review in the BACKGROUND; resume on the notification.
3. **triage** — fetch comments, judge each real vs false-positive; name anything you skip. A dry round (zero real findings) + green CI is **convergence** — record `converged_at_round` and go straight to merge-auth rather than spending another round.
4. **fixing** — run `subagent-delegation-workflow` (T1) to fix the real comments on the PR branch; never brain-write cross-repo.
5. **verify** — CI green → loop to another round only because the prior round had ≥1 real finding (adaptive, not just "rounds remain"), up to `--max-rounds` (default 3, hard cap); CI red → diagnose (a "flaky" test may be a real bug) and fix. Hitting the cap while findings are still arriving is a distinct, weaker outcome — record it explicitly as "cap reached, NOT converged".
6. **await-merge-auth** — present the structured summary (PR link, rounds + convergence state, per-round fixes w/ shas, skipped false positives, CI + mergeable) and **ask the human to authorize the merge. Do NOT merge.**

**Required operator notification.** Whenever the cycle needs a human to trigger a re-review, post exactly: "Copilot re-review needs a human step: run `gh pr ready <pr> -R <owner/repo>` OR open the PR → Reviewers → Copilot → 'Re-request review'. Reply here when clicked; the cycle resumes polling with a fresh `since`." Never wait silently through a UI pause.

Guardrails: never auto-merge; fixes go through the signed-grant delegation (locks are per-work-repo now — a fix delegation only contends with another lock already covering the *same* work repo; unrelated repos run concurrently); bounded rounds with adaptive convergence; honest triage; verify-don't-assume; every phase writes state so the cycle resumes rather than restarts.
