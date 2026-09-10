# Stage-Skill Contract

The interface every stage-skill implements so a **thin orchestrator** can (a) load only the stage it
needs, (b) know **deterministically** when a stage is done, and (c) advance — no guesswork.
*"Many skills orchestrated from one."*

## Orchestrator ↔ stage-skill split
- **Orchestrator** owns the stage sequence, the privilege ladder, transition logic, the batched
  decision harvest, the Execution-Plan gate, and the decision report. It does **no** stage work itself.
- **Stage-skill** owns one stage's work, behind the contract below. Loaded only when its stage runs.
- Some stages stay orchestrator-owned (decision harvest, Execution-Plan gate, decision report) — logic
  + a template, not a separate skill.

## The contract — every stage-skill carries this block
```
stage:       <name / number>
requires:    <entry artifacts/state that MUST exist to start — else the orchestrator won't enter>
does:        <one or two lines: the work>
done-when:   <explicit, CHECKABLE exit criteria — the stage's definition of done>
produces:    <the named output artifact(s) the next stage consumes>
autonomy:    <default tier + whether the guardrail machinery engages: green | amber | red>
challenges:  <the shortcut this stage must counter-challenge (see below)>
mirror:      <parity note — same content mirrored to your editor-AI's format>
```

## Transition rule — how the agent knows a stage is done
Advance to stage **N+1** only when stage **N**'s `produces` artifact **exists** AND its `done-when`
gate **passes**. Otherwise loop inside the stage (re-slice, re-question, re-run). **Artifact-gated and
deterministic — never "seems done."** No stage borrows the next stage's permissions.

## Counter-challenge rule — the "shortcut" guard (NOT a laziness cop)
Humans working fast collapse approvals into a single word ("go", "yes") or just accept the recommended
option. **Don't prevent that.** But at each gate, before a low-effort approval carries the stage
forward, the stage-skill **re-affirms that what's being approved still satisfies:**
1. **base codebase requirements** — the repo's house standards / stack profile, and
2. **stated requirements** — the brief / spec / acceptance criteria.

If there's a gap, **surface it** as a visible yes/no ("you said go, but this slice ships no negative
test, which the stack profile requires — proceed anyway?"). Never a silent pass; never a block.
Judgment injection stays deliberate and visible.

## Re-questioning rule
Discovery + house-standards intake — **including questions embedded in the repo's own instructions** —
feed the batched decision harvest. Any newly-surfaced one-way-door **re-opens** the harvest even after
it "closed." Order: Discovery + house-standards → consolidated questions → decision harvest → Execution
Plan.

## Editor-AI parity
Each stage-skill has **one source of truth**. The editor-AI copy is **generated with identical
content** — same skill, propagated, not rewritten. The parity review confirms the same skills reached
the editor-AI format; never editor-only logic.

## Canonical stage map
| # | Stage | requires | produces | done-when |
|---|-------|----------|----------|-----------|
| 0 | Intake | objective | size + path | classified |
| 1 | Discovery & Context | repo access | context triad + feasibility inventory + question set | triad refreshed, questions extracted |
| 1.5 | Decision harvest | question set | Locked decisions | all human-only calls answered (re-openable) |
| 2 | Spec | approved brief + triad + locked decisions | design spec + conformance tests | passes design-review; acceptance → conformance tests |
| 3 | Work breakdown | approved spec | slice table (tracer-bullet slices) | each slice has DoD + acceptance + non-goals + feasibility + tier |
| 4 | Execution-Plan gate | slices + locked decisions | approved execution plan | approval ticked |
| 5–6 | Build (structures → flow) | approved plan | code + tests | tracer bullet green |
| 7 | Delegation (optional) | grant + brief + house standards | fixed-schema worker report | report valid + lock released |
| 8 | Verify + review | diff + report | pipeline verdict + ranked findings | gates pass; findings triaged |
| 9 | Decision report | findings | decision memo | memo delivered |
| 10–12 | Push / merge / repeat | approved | branch / PR | per repo convention |

## Adding a new stage-skill
1. Copy the contract block; fill all fields.
2. Name it consistently; put it where your harness discovers skills.
3. Register it in the stage map above.
4. Confirm `produces` matches the next stage's `requires` (the hand-off must line up).
5. Generate the editor-AI mirror (parity check).
