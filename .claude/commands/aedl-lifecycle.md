---
description: Run the Agentic & Engineering Development Lifecycle — Discovery/context triad → decision harvest → PRD → issues/todos → Execution-Plan gate → build structures → build flow → TDD delegation → security-first brain review → decision memo → push → permissioned merge (aedl -lifecycle). Thin orchestrator: every stage routes to its own skill. Least privilege by default, guardrails tiered to blast radius.
argument-hint: [<objective> | resume | status]
allowed-tools: Read, Glob, Grep, Write, Edit, Task, Bash(git fetch:*), Bash(git status:*), Bash(git switch:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git push origin:*), Bash(gh issue:*), Bash(bash .claude/hooks/preflight-check.sh), Bash(bash .claude/hooks/release-lock.sh)
---

Execute the `agentic-development-lifecycle` skill at `.claude/skills/agentic-development-lifecycle/SKILL.md`.

Objective (if provided): $ARGUMENTS

The loop — **stage numbers match the skill's stage map**; each stage routes to its own skill,
never re-implemented inline:

- **Stage 0 — Intake.** Classify small vs large; state the path.
- **Stage 1 — Discovery & Context** *(read-only; T4 if delegated)* — **route to `aedl-discovery`.**
  It produces the repo's context triad (`CONTEXT.md` + `MAP.md` + `docs/stack-profiles/<repo>.md`),
  a feasibility inventory citing `file:line`, and the question set for the harvest. Then
  `grill-me` / `deep-research` to stress-test the framing.
- **Stage 1.5 — Decision harvest.** Before the PRD, batch Discovery's question set plus every
  human-only call (artifact locations, platform, cost ceilings, naming, one-way doors) into ONE
  `AskUserQuestion` round; record as "Locked decisions" that later stages cite instead of
  re-asking. A new one-way door re-opens the harvest.
- **Stages 2–3 — spec + work breakdown.** `to-spec` → tracker; `to-tickets` for slices, each with
  its blocking edges (todos for small items).
- **Stage 4 — Execution-Plan gate.** Consolidate the locked decisions + slice table into ONE
  approved artifact (`templates/execution-plan.md`; inline in the issue for small/medium work).
  Every slice row = DoD + testable acceptance + non-goals + feasibility (**from stage 1's
  inventory, never the ticket text**) + **autonomy tier** (green/amber/red). Infeasible or
  untestable slices go back to stage 3. **No build runs until `☐ approved` is ticked.**
- **Stages 5–6 — Build.** Data structures, then the flow — tracer bullet first, TDD throughout.
- **Stage 7 — Delegation.** `subagent-delegation-workflow` (T3 grant; **worker runs TDD first** —
  encode in the grant objective; the worker's final report follows the worker-report-schema).
- **Stage 8 — Verify + review.** Evidence-based, in order: security/OWASP → accessibility → code
  smells → tech-debt risk. Cite file:line; run tests/`verify`.
- **Stage 9 — Decision report.** Findings by severity + a decision table (default, risk,
  reversibility; one-way doors never defaulted).
- **Stages 10–12 — Push / merge / repeat.** Branch push (never main) → merge strictly per repo
  permissions → next slice re-enters at stage 4.

Privilege ladder is mandatory — escalate one rung at a time; skipping a gate requires the user's say-so. Transitions are **artifact-gated**: advance only when the stage's `produces` artifact exists and its `done-when` passes, never on "seems done."

**Tier the machinery to blast radius, not uniformly** — green (host-native controls + review gate, no lock/hook machinery) is the default; amber = tier grant + human reviews plan *and* diff; red = full stack + per-slice checkpoint, for one-way doors and control-plane work. Control-plane slices are brain-only builds.

**Counter-challenge**, don't rubber-stamp: when the human approves with one word, re-check it against the repo's stack profile and the stated requirements and surface any gap as a visible yes/no. Challenge, never block.

Do NOT auto-sync — issue `/aedl-sync` when ready.
