---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker — edges as text in one file per ticket locally, or native blocking links on a real tracker.
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

> **Provenance.** The method below (tracer-bullet slicing, blocking edges, expand–contract wide
> refactors, the quiz round, the ticket templates) comes from the third-party `to-tickets` skill in
> the global `~/.claude/skills/`, refreshed from `mattpocock/skills` @ `ed37663` on 2026-07-25.
> **Upstream deleted `to-issues`** — it was merged with `to-plan` into this skill — so the previous
> vendored copy is retired. This repo-local copy is the **AEDL source of truth**: it carries the
> stage contract, routes the tracker through this workspace's adapter, and is version-controlled
> here so a re-install of the global skill set cannot silently rewrite a lifecycle stage. That
> protection is not hypothetical — the 2026-07-25 refresh deleted this stage's upstream skill
> outright. Keep the method in sync deliberately.

> **This is a stage-skill.** It implements AEDL stage 3 behind the
> [stage-skill contract](../../../docs/aedl-v2/stage-skill-contract.md). The orchestrator
> (`agentic-development-lifecycle`) loads it only when stage 3 runs; it is equally valid
> standalone to break a plan into tickets.

## Contract

```
stage:       3 — Work breakdown
requires:    an approved spec (stage 2, `to-spec`) OR a plan the human accepted; the context triad
             + feasibility inventory (stage 1); the Locked decisions list (stage 1.5)
does:        cut the plan into tracer-bullet vertical slices with explicit blocking edges, quiz the
             human on granularity + edges, publish each approved ticket via the issue-tracker adapter
done-when:   EVERY ticket carries: DoD/acceptance criteria · non-goals · a feasibility verdict
             carried from stage 1's inventory (file:line PLUS the name at that line — a bare number
             is not a citation; not the spec's word) · an autonomy tier ·
             blocking edges. AND the human approved the breakdown. AND the tickets exist in the
             tracker in dependency order (blockers first, so the edges cite real ids).
produces:    the ticket table + published issue numbers + the blocking graph
             (→ stage 4 Execution-Plan gate)
autonomy:    green while drafting + quizzing (read-only), amber at publish (tracker writes).
             Tracker writes go through the adapter — never a direct tracker API call.
challenges:  "slice it by layer, it's cleaner" — a horizontal slice can't be demoed, so it can't be
             verified, so it isn't a slice. The ONE exception is a wide refactor, which is
             sequenced expand–contract instead — see Reference;
             "the spec says that endpoint exists, mark it feasible" — feasibility is stage 1's
             file:line inventory, never the spec text. An infeasible ticket never goes forward to
             build: it loops back HERE to be re-cut, or back to stage 2 if the SPEC itself assumed
             the missing layer;
             "file them all now, sort the edges later" — dependency order IS the publish order,
             because blocking edges need real ids;
             "everything blocks everything" — an over-connected graph has no frontier, which means
             nothing can start; challenge any edge that isn't a genuine gate.
mirror:      tickets land as tracker issues plus the plain-markdown ticket table in the execution
             plan — no Claude-specific state; another editor-AI reads the same issues.
```

## Tracker access

The issue tracker is reached **only** through the active issue-tracker adapter — read
`issue_tracker.adapter` in [`config/workspace.yml`](../../../config/workspace.yml), then the
adapter's `ADAPTER.md` for the interface and its local `field-map.yml` for concrete ids and label
vocabulary. Never call a tracker API directly from this skill, and never inline real field ids
here (AGENTS.md → Configuration, Safety rules). In this workspace the adapter is GitHub Issues
(`github-gh`), so the "real issue tracker" branch of step 5 applies — not the local-files branch.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

> In an AEDL run this step is usually already done: stage 1 produced the context triad
> (`CONTEXT.md` + `MAP.md` + the stack profile) and the feasibility inventory. Read those instead
> of re-exploring — and carry the inventory's `file:line` verdicts into each ticket's **Feasibility**
> field. If no triad exists, that is a signal to run `@aedl -discovery` first, not to explore ad hoc.

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets, following the [Vertical slice rules](#vertical-slice-rules) in Reference.

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing** — see [Wide refactors](#wide-refactors) in Reference.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work
- **Tier**: the autonomy tier it would build under (green / amber / red → T4…T1)
- **Feasibility**: ✅/❌ from stage 1's inventory, with the `file:line` that proves it

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

**Counter-challenge (contract §Counter-challenge rule).** A one-word approval is fine — but before
it carries the stage forward, re-affirm that what's being approved still satisfies the stack
profile's house standards and the stated acceptance criteria. If a ticket ships no negative test,
has an ❌ feasibility row, has no non-goals, or **cites a bare line number with no name at that
line**, surface that as a visible yes/no rather than passing silently.

### 5. Publish the tickets

Publish the approved tickets **through the adapter**, in dependency order (blockers first) so each
ticket's blocking edges reference real identifiers. Use the platform's native blocking / sub-issue
relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues.
Apply the `ready-for-agent` triage label unless instructed otherwise. Use the
[ticket template](#ticket-template) in Reference.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means
top to bottom. On a real tracker the frontier can be worked in parallel — which is what makes the
blocking edges worth recording rather than implying.

Do NOT close or modify any parent issue.

## Reference

### Vertical slice rules

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

### Wide refactors

A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### Ticket template

The upstream template plus the three fields the AEDL contract's `done-when` requires. Without
**Non-goals**, **Feasibility**, and **Autonomy tier** the stage cannot close, and stage 4 has
nothing to put in the execution plan's slice rows.

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Non-goals

What this ticket deliberately does NOT do — the scope fence that stops a build agent from widening
the slice. "None" is a valid answer only if you actually considered it.

## Feasibility

✅/❌ per assumption this ticket makes, each citing the `file:line` that proves it (from stage 1's
inventory). An ❌ here means the ticket is infeasible **as written** and must be re-cut before build.

## Autonomy tier

green / amber / red — and the delegation tier that implies (T4 → T1). Drives whether the build
runs brain-direct or under a grant.

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

</issue-template>

**Every `file:line` carries the name of what is at that line** — an identifier, a document heading
(`§11.5`, `R3`, `AC 3's Control`), a selector, or a verbatim quote — because the number is
invalidated *silently* by the next edit to that file, while the name re-finds the anchor in one
grep. A bare `:516` is not a citation; if you cannot name what sits at the line, you have not read
it. Prefer a name that is **unique** in the file: check it, and if it has many hits, anchor on the
enclosing function or heading instead and say so.

Measured 2026-08-10 on cc#125: **10 of 12 anchors had drifted in four days**, none was wrong when
written, and the same file carried **three different drift bands** (+0/+3/+29) — so no single offset
repairs a ticket. One drifted anchor landed mid-comment on unrelated prose, which reads as plausible
and never announces itself as wrong.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can
(state machine, reducer, schema, type shape), inline it and note briefly that it came from a
prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Expected Output

```
BREAKDOWN — <source> @ <YYYY-MM-DD>
TICKETS:     <n> approved   FRONTIER: <the ones with no blockers — these can start now>
FEASIBILITY: <n> ✅ / <n> ❌   (each ❌ re-cut, not carried forward)
PUBLISHED:   #<id> … in dependency order via <adapter>
NEXT:        stage 4 (Execution-Plan gate) — tickets + locked decisions → templates/execution-plan.md
```

## Anti-Patterns

- **Horizontal slices** ("do all the schema work first"). Not demoable, not verifiable, not a slice
  — unless it is a genuine wide refactor, which gets expand–contract instead.
- **Marking a ticket feasible from the spec text.** The spec is the claim under test; stage 1's
  inventory is the evidence.
- **Publishing before the human approves the granularity.** The quiz round is the cheap gate;
  re-cutting published issues is the expensive one.
- **Calling the tracker API directly** instead of going through the adapter.
- **Tickets with no non-goals.** An unfenced ticket is how a "thin" slice becomes a two-day build.
- **A blocking graph with no frontier.** If every ticket is blocked, nothing can start — the edges
  are wrong, not the work.

## Learning Notes

- **Medium-path calibration** (from the orchestrator's Learning Notes): a single slice of an
  existing program with a complete design contract → skip `to-spec`/`to-tickets` and file ONE
  implementation issue. Zero ceremony beats correct ceremony on a one-slice change; the stage-0
  small path exists precisely so this stage can be skipped.

## Change Log

- 2.0.0 — Re-vendored (2026-07-25) after the upstream refresh **deleted `to-issues`** and merged it
  with `to-plan` into `to-tickets`. Method updated: blocking edges, the frontier, prefactoring, and
  expand–contract wide refactors. Contract rebased; `HITL/AFK` dropped from `done-when` (upstream
  moved that classification to `wayfinder`, and the autonomy tier already carries it).
- 1.0.0 — Vendored as `to-issues` (2026-07-25), AEDL v2 Phase 0: stage-3 contract block, adapter
  routing, and the non-goals / feasibility / autonomy-tier template fields.
