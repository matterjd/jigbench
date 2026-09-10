---
name: pr-review-cycle
description: Drive a pull request through an automated Copilot review loop — request a Copilot code review, watch for its comments, delegate a scoped fix pass under a signed grant, verify green, and (never auto-merging) request merge authorization from the human. Resumable across sessions via a per-PR state file. Use for the @aedl -review-cycle command (/aedl-review-cycle), "run the review cycle on PR #N", or after opening a PR that should go through the standard review→fix→merge-auth loop.
---

# PR Review Cycle

## Description

Codifies the **request-review → watch → delegate-fix → verify → request-merge-auth** loop
this workspace runs on every PR. It orchestrates an **external reviewer (GitHub Copilot)** on
a PR in a registered sibling repo, triages the comments with judgment, fixes the real ones
through a tier-granted **delegation** (never a raw brain write), re-reviews until clean, and
then **stops at the human merge gate** — it never merges. State is persisted per PR so the
cycle is **resumable** after an interruption, a new session, or a long async wait.

Complements `/code-review` (which reviews your *local working diff* before you push). This
skill drives the *Copilot round-trip on the pushed PR*; run `/code-review` first if you want a
local pass before requesting Copilot.

**Never auto-merges.** Merge is the human's decision (consistent with the delegation harness:
promotion is always human-gated). The cycle ends by *asking* for merge authorization.

## When To Use

- `@aedl -review-cycle <PR#> [--repo <owner/name>] [--max-rounds N] [--tier T1]` — run/resume the
  loop for one PR.
- `@aedl -review-cycle status <PR#>` — report the persisted phase without advancing.
- After opening a draft PR from a delegation, to take it from "opened" to "review-clean + green,
  awaiting your merge."

## Inputs

| Input | Default | Notes |
| --- | --- | --- |
| PR number | — | Required. |
| Repo | inferred from the PR / current work repo | `owner/name`; must be a registered sibling in `config/workspace.yml` `repos:` (fix passes write there under a grant). |
| Max rounds | `3` | Review→fix iterations before escalating to the human (avoids infinite loops). |
| Fix tier | `T1` | Tier for the fix delegation (T1 = commit+push to the PR branch). |

## State & resumability

Persist one file per PR: `review-cycles/<owner>-<name>-<pr>/state.yml` (gitignored, like
`delegations/`). Shape:

```yaml
repo: "matterjd/axis-grim"
pr: 124
head_sha: "<sha last acted on>"
phase: "awaiting-review"   # requested|awaiting-review|reviewer-unavailable|triaging|fixing|verifying|awaiting-merge-auth|done|aborted
round: 1                    # current review→fix iteration
max_rounds: 3
converged_at_round: 0      # set to the round number once a round yields zero real findings + green CI; 0 = not yet converged
since: "2026-07-05T04:15:01Z"  # the review-request timestamp the poll waits past
fix_delegation_id: ""      # link into delegations/<id>/ when a fix pass ran
reviewer_unavailable: ""   # "" | why the degraded path was taken (verbatim), set when phase hits reviewer-unavailable
verify_record: ""          # path to the aedl-verify record that stood in for the external review
notes: ""                  # e.g. "2 real, 1 false-positive"
updated_at: "…"
```

On invocation: if the state file exists, **read `phase` and resume there**; else create it at
`requested`. Rewrite the file at every phase transition. `status` just prints it.

## Standard Process (the state machine)

Helper: `bash .claude/skills/pr-review-cycle/scripts/copilot-review.sh {request|poll|comments|checks} <repo> <pr> [since]`.

### Phase 0 — request-review
Confirm the PR exists and the repo is a registered sibling. Record `head_sha` and `since` (the request
time); set `phase: awaiting-review`.

**Trigger reliability — this is the fiddly part (validated 2026-07-05):**
`POST …/requested_reviewers reviewers[]=Copilot` reliably triggers a Copilot review on a **first** review of
a PR, but on an **already-reviewed** and/or **draft** PR the request is *consumed without producing a new
review* (GitHub clears the pending reviewer, Copilot re-runs nothing). So:
- **First review of the PR** → `copilot-review.sh request <repo> <pr>` is enough.
- **Re-review after a fix pass** → the API POST is unreliable. Prefer to **mark the PR ready-for-review**
  (`gh pr ready <pr>` — Copilot reliably reviews ready PRs on new commits), OR have the human click
  **"Re-request review"** on Copilot in the PR UI (works where the API doesn't). Note in state which was used.
  This is a **UI pause that needs a human step** — send the REQUIRED notification template below rather than
  waiting silently.
- **If it prints `REQUEST_FAILED`** (Copilot not enabled / no permission), STOP and hand off to the human.
Never fake a review; resume at `awaiting-review` once one is genuinely requested.

> **Required operator notification (UI pause).** Whenever the cycle needs the human to trigger a re-review,
> post exactly this shape (fill in `<pr>` / `<owner/repo>`) — never wait silently:
> "Copilot re-review needs a human step: run `gh pr ready <pr> -R <owner/repo>` OR open the PR → Reviewers →
> Copilot → 'Re-request review'. Reply here when clicked; the cycle resumes polling with a fresh `since`."

### Phase 1 — await-review (async, background)
Run the poll **in the background**: `copilot-review.sh poll <repo> <pr> <since>` via a background Bash task —
it exits when a Copilot review submitted at/after `since` lands (or times out ~30 min). You are re-invoked
on exit. On `REVIEW_READY` → `phase: triaging`.

On `POLL_TIMEOUT`, **distinguish two cases** with `copilot-review.sh pending <repo> <pr>`:
- **Copilot still pending** → the review is just slow; re-poll (offer to keep waiting).
- **Copilot NOT pending and no new review since `since`** → the request was *consumed without a review*
  (the already-reviewed/draft case above). Do NOT keep spinning — surface it and post the **required operator
  notification** above (`gh pr ready` or UI "Re-request review"), then resume the poll with a fresh `since`
  once the human replies.

**After the SECOND consumed-without-review on the same round, stop asking and change state:** set
`phase: reviewer-unavailable`, record the reason verbatim in `reviewer_unavailable`, and go to Phase 1b.
Two consumed requests is enough evidence; a third notification just moves the stall from the poller to
the human. Never silently time out into "assume approved."

### Phase 1b — reviewer-unavailable (the named degraded path)

**The external reviewer being unavailable is a first-class outcome, not an improvisation.** It was
the harness's single biggest workflow-stopper: sessions either spun in the poll or invented an ad-hoc
route each time. It is the same path that correctly landed axis-grim #134, #135, and #107 — now
written down so it runs identically every time.

The cycle does **not** stop and does **not** lower its bar. It substitutes an equivalent one:

1. **Brain review — run `aedl-verify` (stage 8) against the PR's diff**, at the slice's own autonomy
   tier, with **all core axes** (four since 2026-08-15: Standards · Spec · Security · Design).
   This is a *stronger* substitute than the row that proposed it assumed:
   stage 8 runs its axes in independent sub-agent context, so it is not the same self-review the
   external reviewer existed to avoid. Record the verdict where the seat's records live (ruled
   2026-08-14): Delivery-seat work → the project repo's `docs/quality/<feature>/`; Portfolio-seat
   and harness work → `notes/reviews/`. Put its path in `verify_record`.
2. **CI must be green** — `copilot-review.sh checks <repo> <pr>`, actual output, not an assumption.
   A degraded review path with a red or unknown CI is not a path; it is a stop.
3. **Any fix-now finding runs the normal loop** — Phase 3 fix delegation, Phase 4 verify, then back
   here. Degraded mode changes *who reviews*, never *whether findings get fixed*.
4. **Explicit owner authorization**, requested with the degradation stated plainly. The merge-auth
   summary MUST say **"reviewer unavailable — brain review substituted"**, name the reason verbatim
   from `reviewer_unavailable`, and link `verify_record`. → `phase: awaiting-merge-auth`.

**This is a third, distinct outcome.** Do not report it as `converged` and do not report it as
"cap reached" — both of those describe an external review that ran. Ranked weakest-to-strongest the
outcomes are: *cap reached, not converged* < *reviewer unavailable, brain review substituted* <
*converged at round N*. Say which one it was, every time.

**Still never auto-merge.** Degraded mode reaches merge *authorization*, exactly like every other
path. The human merges.

### Phase 2 — triage
`copilot-review.sh comments <repo> <pr>` → the review state + inline comments. Triage EACH with judgment
(the same bar used all along): is it a real correctness/security/robustness issue, or a false positive?
Record a one-line verdict per comment. Then branch:
- **Review state APPROVED, or zero actionable comments** (all false positives / nits you deliberately skip)
  **AND CI is green** → this round has **converged**: set `converged_at_round: <this round>`, note
  "converged at round N" in `notes`, and go straight to `phase: awaiting-merge-auth`. Convergence means
  the loop stops because the review ran dry, not because it hit the round cap — say so explicitly.
- **≥1 real comment** → record the fix list in `notes`; `phase: fixing`.
Always state which comments you are NOT fixing and why (don't silently drop a real one; don't blindly fix a
false positive — but a trivial consistency tweak to clear a nit is fine).

### Phase 3 — fixing (delegated)
Run the **`subagent-delegation-workflow`** skill: a `T1` review-fix pass on the PR's head branch, built on
its current tip, addressing ONLY the triaged real comments. The worker commits + pushes to the same branch
and keeps the PR's draft/ready state unchanged. Record `fix_delegation_id`. Do **not** brain-write the fix —
cross-repo writes go through the signed grant + guards. (Model per `[[token-efficient-subagents]]`: Haiku for
mechanical comment fixes; Sonnet when a comment needs real diagnosis — e.g. a flaky test that turns out to be
a real bug.) → `phase: verifying`.

### Phase 4 — verify
`copilot-review.sh checks <repo> <pr>` until CI settles.
- **CI green** → loop to another round **only because the previous round produced ≥1 real finding** (Phase 2
  fixing branch), not just because rounds remain: `round++`, back to **Phase 0** (re-request Copilot to
  confirm the fixes pass a fresh review). `max_rounds` stays the hard cap regardless (raisable via
  `--max-rounds`). If `round == max_rounds` and findings are still arriving, go to `awaiting-merge-auth`
  but the notes and the merge-auth summary MUST say **"cap reached, NOT converged"** — this is a distinct,
  weaker outcome than `converged_at_round` (evidence: PR #125 hit the cap while every round still found
  real bugs; that is not the same as the review running dry).
- **CI red** → inspect the failing job (`gh run view --job <id> --log`). Treat it like a review comment: if it's
  a real failure (even a "flaky" test can be a real product bug — verify, don't assume), run another `fixing`
  delegation; then re-verify. Never weaken/skip a test to go green.

### Phase 5 — await-merge-auth (the human gate)
Present a **structured** summary, in this shape:
- **PR:** link.
- **Rounds run:** N. **Convergence:** `converged_at_round: <N>` (review ran dry + CI green), or
  **"cap reached, NOT converged"** (findings were still arriving when `max_rounds` was hit).
- **Per round:** what was fixed, with commit shas.
- **Skipped false positives:** each one named, with why it was judged not real.
- **CI + mergeable:** final check state (all green) and GitHub's `mergeable` status.
- **Explicit ask:** "Authorize merge?" — via `AskUserQuestion` or an equally clear request.
**Do not merge.** Set `phase: awaiting-merge-auth`. When the human authorizes, they merge (or run
`/aedl-merge`-style promotion); on confirmation set `phase: done`.

### Upkeep
Append one plain-English line per completed cycle to `review-cycles/observer-log.md` (round count, PRs, verdict,
merge-auth requested). Do not auto-`/aedl-sync`.

## Guardrails

- **Never auto-merge.** The cycle always ends by *requesting* authorization; the human merges.
- **Fixes are delegated, not brain-written.** Reuse `subagent-delegation-workflow` so every PR write is under a
  signed grant with the mechanical guards (locks are per-work-repo now — a fix delegation only contends with
  another lock already covering the **same** work repo; unrelated repos' delegations run concurrently; see
  that skill).
- **Bounded loops.** Honor `max_rounds`; escalate to the human instead of looping forever.
- **Honest triage.** Skipped comments are named with a reason; a "false positive" claim must be defensible
  (e.g. CI proves it compiles). Never silently ignore a real finding.
- **Verify, don't assume.** A red check or a "flaky" test may be a genuine bug — diagnose before dismissing.
- **Resumable & idempotent.** Every phase writes state; re-running mid-cycle continues, it doesn't restart.
- **Trigger honesty.** If Copilot review can't be requested (permissions), stop and hand off to the human — never
  pretend a review happened.

## Related Skills

- `subagent-delegation-workflow` — the fix pass in Phase 3 (T1 grant, guards, lock).
- `agentic-development-lifecycle` — the full build loop; this skill is its review→merge-auth tail, usable standalone.
- `notes-merge-workflow` / `/aedl-merge` — the human-run promotion once merge is authorized.
- `token-efficient-subagents` (memory) — worker model choice for fix passes.

## Expected Output

A PR taken to **review-clean + CI-green + mergeable**, a per-PR `state.yml` at `phase: awaiting-merge-auth`
(then `done`), fix-pass records under `delegations/`, one `review-cycles/observer-log.md` line, and an explicit
merge-authorization request to the human. Never a merge performed by the agent.

## Learning Notes

- Trigger validated 2026-07-05: `gh api --method POST repos/<repo>/pulls/<pr>/requested_reviewers -f 'reviewers[]=Copilot'`
  returns 200 and adds Copilot as a reviewer. The posted review's author login matches `/copilot/i`.
- **Caveat (learned the hard way, same day):** that POST only reliably yields a review on the PR's *first*
  Copilot review. On an **already-reviewed** and/or **draft** PR it is *consumed without producing a review*
  (Copilot dropped from pending, no new review) → the Phase-1 poll times out. Re-reviews need
  `gh pr ready <pr>` (mark ready) or the UI **"Re-request review"** button. Hence Phase 1 checks `pending`
  on timeout to tell "slow" from "consumed-no-review."
- Copilot reviews land ~1–5 min after a genuine request; poll ~45s.
- The helper does all JSON filtering inside `gh api --jq` — there is **no standalone `jq`** in this environment.
