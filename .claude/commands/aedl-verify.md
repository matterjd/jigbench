---
description: AEDL stage 8 — the verification pipeline. Deterministic gates, then four independent review axes (Standards · Spec · Security · Design) in parallel sub-agents scaled to the slice's autonomy tier, then one triaged ranked findings list (aedl -verify).
argument-hint: [<fixed-point>] [<spec-ref>]
allowed-tools: Read, Glob, Grep, Agent, Bash(git diff:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git status:*), Bash(gh issue view:*), Bash(gh issue create:*), Bash(gh pr view:*), Write, Edit
---

Execute the `aedl-verify` skill at `.claude/skills/aedl-verify/SKILL.md`.

Fixed point / spec reference (if provided): $ARGUMENTS

**Read-only stage — this stage never fixes what it finds.** In order:

1. **Pin the fixed point** (SHA / branch / tag / merge-base) and confirm it resolves and the diff is
   non-empty. Fail here, loudly — not inside four parallel sub-agents.
2. **Deterministic gates FIRST** — the target's REAL build/typecheck/lint/test commands from
   `docs/stack-profiles/<repo>.md`. If they fail, that failure IS the report; do not spawn axes over
   code that does not compile. Record what you could not run, and why.
3. **Spawn four axes in parallel** (ONE message, multiple Agent calls), judge count scaled to the
   slice's autonomy tier — green 4 · amber 6 (Security ×3) · red 10 (×3 per axis, **Design ×1**):
   - **Standards** — documented repo standards + the stack profile's checkable rules + the smell baseline.
   - **Spec** — acceptance criteria, and scope creep checked against the ticket's **non-goals**.
   - **Security** — NEVER optional at any tier. Trust boundaries, input→sink paths, client-side
     "mitigations", secrets, dependencies under 14 days old, control-plane touch.
   - **Design** — the repo's own design records first, then the **floor**
     (`docs/DESIGN-TEAM.md` §6). A floor failure is a Blocker; everything below it files as
     `debt`. **What counts as "design surface" is defined once, in `docs/DESIGN-TEAM.md` §6.1**:
     it is what the diff RENDERS, never what records the repo keeps — so a diff touching only
     build tooling, CI, scripts and docs has none, and `docs/design/` existing is not surface.
     No design surface? The axis says so — that return IS its finding, not a skip.
     Never multiplied: its blocking set is a closed enumeration, so a second judge reads the
     same list.
   At **amber and red the tier budget buys ADDED AXES before duplicate judges** — if you are about
   to add a fourth judge to an axis that already has three, add an axis instead. Worked example:
   the **mutation axis** (*"do the new tests go red when the production change is reverted?"*),
   entering at amber.
4. **REFUTE every finding before triaging it** (mn#13) — spawn refuters briefed to **disprove**
   each finding, never the judge that raised it. They open the cited source at the cited line
   first: *a citation that does not say what the finding claims is itself a refutation.*
   **Default to REFUTED under uncertainty.** Survival: green/amber 1 refuter returns `STANDS`;
   red needs **≥2 of 3**. A refuted finding is recorded as `reject` **with the refutation**, never
   silently dropped. Measured basis: ~80 findings raised across three passes, ~50 survived — about
   a third of what would have shipped as corrections was wrong.
5. **Aggregate without reranking** across axes — the separation is the mechanism.
6. **Triage every finding** to exactly one of fix-now / fix-next (**file the ticket now**) / accept
   (with the reason) / reject (with the evidence). Disposition stage 5–6's refactor list the same way.
7. **Verdict, then stop.** Stage 9 writes the memo; the human authorizes the merge.

Every finding cites `file:line` **in the actual diff**. A worker's report, a ticket body, and a
commit message are claims under test — never evidence.
