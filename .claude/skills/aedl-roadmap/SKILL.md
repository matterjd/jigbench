---
name: aedl-roadmap
description: Reconcile a repo's open issues against its roadmap surfaces — find issues with no roadmap row, rows with no issue, rows claiming delivered while their issue is open, and rows for work already closed. Read-first; writes only after one batched approval round; never closes an issue. Use for the @aedl -roadmap command (/aedl-roadmap), "reconcile the roadmap", "what's open that isn't planned", "are we near a clean slate", or as the triage pass before deciding what to work on next.
---

# Roadmap ↔ Issue Reconciliation

The harness's answer to *"is everything that's open actually planned, and is everything planned
actually still open?"* — asked mechanically, across every repo, instead of by memory.

> **Why this exists.** On 2026-07-25 a manual reconciliation found **four open `matter-notes`
> issues with no roadmap row at all** (#6, #7, #8, #9). They had been open and invisible to every
> planning pass since they were filed — inside the repo that *owns* the roadmap. The roadmap's own
> header carried the invariant ("update both together") as prose. Prose invariants drift; that is
> the whole finding. This skill is the mechanical version.

## When To Use

- `@aedl -roadmap [<repo>|all] [--dry-run]` / `/aedl-roadmap` — reconcile one repo or every
  registered one.
- Before a planning session, to decide what to work on from evidence rather than recall.
- Before claiming progress toward a **clean slate** — the number is only meaningful if the two
  sides agree.
- As a step inside `@aedl -maintain`'s evidence sweep (roadmap row P2.10).

Do **not** use for: creating the work itself (that is `to-tickets`), or for deciding *priority* —
this skill reports divergence and proposes homes; ordering stays the human's.

## Inputs To Gather

1. **Target repo(s)** — resolve from `repos[]` in `config/workspace.yml`, plus this repo itself.
   Use the **exact on-disk path**, never the display name. `all` = every registered repo with a
   reachable tracker.
2. **The tracker** — via the issue-tracker adapter (`issue_tracker.adapter`), never a direct API call.
3. **The roadmap surfaces** for that repo (see below). A repo may legitimately have several.

## Roadmap surfaces — a repo usually has more than one

Do not force everything into one file. Locate, in this order, and treat each as a valid home:

| Surface | Typical path | Holds |
|---|---|---|
| **Harness roadmap** | `docs/aedl-roadmap.md` | prioritized P-rows for the harness itself |
| **Project roadmap** | `ideas/<project>/ROADMAP.md` | phases; each phase-PRD issue *is* a row |
| **Project backlog** | `ideas/<project>/BACKLOG.md` | the scope-creep pen — deferred, with an unblock trigger |
| **Parking lot** | `ideas/parking-lot.md` | captured-not-yet-triaged; a legitimate waypoint, not a home |
| **In-repo roadmap** | `<repo>/ROADMAP.md`, `<repo>/docs/roadmap.md` | sibling repos that carry their own |

If a repo has **no** roadmap surface, say so plainly and propose the smallest one that would work.
Do not invent an elaborate structure for a repo with four issues.

## The four divergence classes

Every finding is exactly one of these. Naming the class is what makes the report actionable.

| Class | Means | Default disposition |
|---|---|---|
| **Orphan issue** | Open issue, no roadmap row anywhere | Propose a row, in the surface that fits. This is the class that hides work. |
| **Orphan row** | Roadmap row with no issue | **Often correct** — see below. Confirm it is deliberate, don't reflexively file. |
| **Stale-delivered** | Row says shipped/✅, its issue is still open | Either the row is optimistic or the issue wants closing. Report both readings; decide with the human. |
| **Zombie row** | Row still open, its issue is closed | Mark the row delivered, citing the closing PR/commit. |

**An orphan row is not automatically a defect.** Plenty of roadmap content should never be an
issue: watch items, standing risks, "revisit if X" triggers, and rows that are a *theme* rather than
a unit of work. The failure is not "a row without an issue" — it is **a row whose status is
unknowable**. So the check is: *can a reader tell whether this row is tracked elsewhere, deliberately
untracked, or forgotten?* If not, that is the finding. Mark it `roadmap-only` and move on.

**Debt issues are planned-by-policy, not orphans.** An open issue carrying the debt label
(`debt_label` from the tracker field-map; default `"debt"`) is an auto-filed non-critical finding
under the Delivery Team charter (`docs/DELIVERY-TEAM.md` §7/§10): its roadmap home is the
feature-end burn-down queue, by policy, so it never needs a row. Do not classify it as an orphan
issue and do not propose a row for it — but ALWAYS report its count on its own output line and
count it as covered in HOME COVERAGE. Silently excluding it would hide the very debt the burn-down
exists to clear.

**Never mass-file issues to make the table symmetric.** Issue spam is a worse failure than an
untracked row: it buries the real work and inflates the open count the clean-slate metric depends on.

## Standard Process

1. **Enumerate both sides.** Open issues from the adapter; roadmap rows from every surface found.
   Record the counts before any analysis — they are the baseline the report cites.

2. **Match.** Prefer explicit links (a row citing `#N`, an issue citing a row id). Fall back to
   title/subject similarity, and mark every fallback match as **inferred** — an inferred match is a
   finding in itself, because it means the link is not written down anywhere.

3. **Classify** every unmatched item into one of the four classes above. For each, name the
   **surface** it should live in (a deferred item belongs in BACKLOG, not the P-tables). Before
   calling an open issue an orphan, check its labels — the debt label routes it to the DEBT line
   instead.

4. **Check the claims, don't trust them.** A row saying "delivered" is a claim: verify against the
   closing commit/PR or the code, exactly as stage 1 verifies a ticket's `file:line`. A roadmap that
   only ever moves toward ✅ is a marketing document. Where a row overstates, say so and propose the
   honest status — including **"built but unproven live,"** which is a real state and not a failure.

5. **One batched approval round.** Present the proposed reconciliation as a single decision set:
   rows to add, rows to re-status, issues to close, matches to make explicit. **Do not trickle.**
   Mark any **one-way door** (closing an issue, deleting a row) distinctly.

6. **Write the approved changes.** Roadmap edits are the write; **issue closure is proposed, never
   performed** (see Guardrails). Re-run the counts afterwards and report the delta.

7. **Write the snapshot — on every run, including a run that changed nothing.** Hand the records
   gathered in step 1 to `scripts/write-snapshot.sh write`. It writes
   `docs/roadmap-snapshots/<YYYY-MM-DD>-issues.json` and re-stamps its mtime, and that mtime *is*
   `distilledAt` for every consumer downstream. So a pass that finds no divergence, writes nothing
   to any roadmap surface, and skips this step leaves a genuinely fresh reconciliation reading as
   stale — which is the one thing the artifact exists to prevent. The script **writes; it never
   fetches**: records arrive on stdin, already gathered through the adapter. Shape, field rules and
   the consumer's side of the deal: [`references/snapshot-contract.md`](references/snapshot-contract.md).

   Do **not** hand-assemble the payload issue by issue — that is where the label and state
   normalization quietly gets skipped. Shape it adapter-side; with the `github-gh` adapter one
   call per repo emits a whole `repos[]` record, already normalized:

   ```bash
   W=.claude/skills/aedl-roadmap/scripts/write-snapshot.sh
   repo=<owner/name>
   rec=$(gh issue list --repo "$repo" --state open --limit 500 \
           --json number,title,state,labels \
           --jq "{repo: \"$repo\", open: length, unreachable: false,
                  issues: [.[] | {number, title, state, repo: \"$repo\",
                                  labels: [.labels[].name]}]}")
   printf '{"schemaVersion":1,"generatedAt":"%s","repos":[%s]}\n' \
     "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rec" | bash "$W" write
   # -> SNAPSHOT_WRITTEN file=<YYYY-MM-DD>-issues.json ... distilledAtMs=... distilledAt=...
   ```

   For several repos, collect one `$rec` per repo and join them with commas inside `repos[]`.
   A repo whose tracker did not answer still gets a record —
   `{"repo": "<owner/name>", "open": null, "unreachable": true, "issues": []}`.

   The writer refuses a payload that breaks the contract rather than writing a malformed one, so
   read its exit code: `0` written, `3` refused (nothing written, any existing file untouched).
   An unreachable repo goes in as `"open": null, "unreachable": true` — **never as zero open
   issues**, which is the same lie one layer down that the UNREACHABLE output line exists to stop.

8. **Report the slate.** Emit the Expected Output. The clean-slate figure is
   `open issues with a roadmap home / total open issues` **per repo** — never a single blended
   number across repos, which hides exactly the repo that is drifting.

## Guardrails

- **Never close an issue.** Closure is the human's call, always. Propose it with the evidence
  (the shipping commit, the superseding issue) and hand over a paste-ready `bash` command. *(A
  `gh issue close` was refused by the platform classifier mid-pass once; the response is to hand
  the command over, not to retry-loop — roadmap row P1.7.)*
- **Never create an issue without confirmation**, and never create one for a row that is
  deliberately `roadmap-only`.
- **Enumerate before creating.** Before proposing a new row or issue, list the existing ones and
  check the gap is not already covered under a different name. A conditional "if it doesn't exist"
  is a check to perform, not a formality.
- **Tracker access only through the adapter.** That includes the snapshot writer, which takes its
  records on stdin and never reaches for the tracker itself.
- **Read-only until the approval round.** `--dry-run` never writes at all.
- **The snapshot is written on every real run — and `--dry-run` still writes nothing.** Two rules,
  not one; do not merge them. `--dry-run` is a promise to the human that the pass touches nothing,
  and it keeps that promise here too — use `write-snapshot.sh validate` if you want the payload
  checked without writing it. A **no-change run** is a different animal: a real pass that happened
  to find no divergence still writes and re-stamps the snapshot, because `distilledAt` measures
  *when the reconciliation ran*, not when it last found something to change.
- **Other repos' roadmaps belong to them.** Reconciling `axis-grim` writes to *its* roadmap, not to
  this repo's. The harness roadmap covers the harness only.
- **Report what you could not reach.** A repo whose tracker is unreachable, or that has no remote
  at all (`wisp`), is reported as **unreconciled** — never silently omitted, which would read as
  clean.

## Expected Output

```
ROADMAP RECONCILIATION — <repo|all> @ <YYYY-MM-DD>

<repo>
  ISSUES:     <n> open        SURFACES: <the roadmap files found>
  MATCHED:    <n> explicit · <n> inferred (inferred = link not written down)
  ORPHAN ISSUES:   <n>   -> proposed rows: <ids + surface>
  DEBT (planned-by-policy): <n> open, label "<debt_label>" -> feature-end burn-down queue
  ORPHAN ROWS:     <n>   -> <n> confirmed roadmap-only · <n> status unknowable
  STALE-DELIVERED: <n>   -> <row, and which reading is right>
  ZOMBIE ROWS:     <n>   -> <row, closing ref>
  HOME COVERAGE:   <n>/<n> open issues have a roadmap home
  UNREACHABLE:     <what could not be checked, and why>

CLEAN SLATE: <per-repo coverage lines; never one blended number>
SNAPSHOT: <docs/roadmap-snapshots/<YYYY-MM-DD>-issues.json> @ <distilledAt>
          <n> repos · <n> open issues · <n> unreachable   (written on EVERY run)
ONE-WAY DOORS: <closures/deletions proposed — each needs an explicit yes>
NEXT: <the single highest-value thing this pass surfaced>
```

## Anti-Patterns

- **Mass-filing issues to make the numbers match.** The metric is coverage, not symmetry.
- **Trusting a row that says "delivered."** Verify against the commit, the same way a feasibility
  inventory verifies a ticket.
- **A single blended clean-slate percentage.** It hides the one repo that is drifting, which is the
  only repo the number was supposed to find.
- **Closing issues to improve the count.** The count is a thermometer, not a target.
- **Forcing every row into the priority tables.** Deferred work belongs in BACKLOG with its unblock
  trigger; captured-not-triaged belongs in the parking lot.
- **Reconciling only the repo you happen to be in.** Drift concentrates in the repos nobody opens.

## Related Skills

- `harness-maintenance` — calls this as an evidence-sweep step (roadmap P2.10).
- `to-tickets` — where a confirmed orphan row becomes real work; this skill never slices.
- `aedl-discovery` — same read-first, verify-the-claim, batch-the-questions shape.

## Learning Notes

_Populate after each run — especially which divergence class produced the most value, and any repo
that turns out to have no usable roadmap surface at all._

- **Run 1 — full estate, 2026-07-25.** 59 open issues across 6 repos; coverage went 28/59 → 59/59.
  Four things the run taught the skill:
  1. **"Orphan issue" was the most valuable class by a distance** — 31 of the 31 gaps were orphan
     issues. Zero stale-delivered, zero zombie rows. Worth knowing: the expensive-to-check classes
     found nothing, and the cheap one found everything. Lead with orphan issues on a first pass.
  2. **A stale roadmap is more dangerous than a missing one.** `axis-grim` scored 0/28 with a
     roadmap that *looked* maintained but described a project that had since moved repos. A reader
     trusts a document that exists. **Check the roadmap's own last-modified date early** — it is one
     `git log -1` and it reframes everything after it.
  3. **Full structural coverage can still hide the thing that matters.** Two repos scored 7/7 and
     5/5 while their real state (a stacked-PR retarget trap; two slices blocked on the human's
     sample files) lived only in a memory file. **Coverage answers "is it planned," not "is it
     knowable."** Consider a fifth check: for each open issue, can a cold reader tell what is
     blocking it? Status-opacity is a distinct defect from roadmap-absence.
  4. **The repo whose tree is parked on a stale branch is the one that has drifted.** `axis-grim`'s
     working tree sat on a July-5 delegation branch. Cut fresh off `origin/main`; never commit onto
     whatever a previous session left checked out.
  Not resolved by design, and correctly so: an epic overlap (`axis-grim` #154 ↔ #119) and an issue
  that is itself a roadmap request (#88). The skill reports divergence; it does not adjudicate scope.

## Change Log

- 1.1.0 — Snapshot writer (2026-08-15, `matter-notes#15` / `MN-GATE8`). Standard Process step 7
  writes `docs/roadmap-snapshots/<YYYY-MM-DD>-issues.json` on every run through
  `scripts/write-snapshot.sh`; the consumer's contract is pinned by a validated example under
  `references/`. The write step is a **script rather than a prose instruction** on purpose: this
  skill exists because an invariant written as prose drifted (see "Why this exists"), and shipping
  its own determinism requirement as prose would repeat that failure inside the fix. The rule the
  script holds is that selection and stamping are separate clauses — lexicographic max of the
  basename, then *that* file's mtime — which agree on an ordinary day and disagree exactly when it
  matters.
- 1.0.0 — Initial (2026-07-25). Unparked from the 2026-07-07 parking-lot row on Matter's directive
  ("AEDL should strive to stay on top of issues and work in the roadmap"), and prompted by the
  manual reconciliation that found four orphaned `matter-notes` issues. `command-center` Phase 9
  plans the human UI over this engine — build them against the same four divergence classes.
