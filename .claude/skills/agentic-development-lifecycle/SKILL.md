---
name: agentic-development-lifecycle
description: Run the Agentic & Engineering Development Lifecycle (AEDL) as a THIN ORCHESTRATOR — route the full build loop from Discovery/context triad through decision harvest, PRD, issues, the Execution-Plan gate, TDD build, tier-granted delegation, brain review (security-first), decision report, push, and permissioned merge. Use for the @aedl -lifecycle command (/aedl-lifecycle), "run the lifecycle", "take this from idea to merged", or when starting any non-trivial feature that should flow through the standard harness. The guide at least privilege, the guardrail tiered to blast radius.
---

# Agentic & Engineering Development Lifecycle (AEDL)

One repeatable loop from **idea → merged**, with a permission ladder so an agent runs
least-privilege by default and mechanically guarded when running full throttle. This
skill is a **thin orchestrator**: each stage routes to a skill/adapter — it never
re-implements them.

> **Trust is the bottleneck, not code generation.** The metric is *first-pass acceptance of
> agent changes* — merged without a senior having to rewrite them. That is why decisions are
> front-loaded behind a plan gate and why verification is a pipeline, not a read-through.

## What this skill owns — and what it doesn't

The orchestrator owns **only**: stage sequence, the privilege ladder, artifact-gated transition
logic, the batched decision harvest, the Execution-Plan gate, and the decision report. **It does
no stage work.** Stage-skills are loaded only when their stage runs.

| # | Stage | Routes to | Contract? | Orchestrator-owned? |
|---|-------|-----------|-----------|---------------------|
| 0 | Intake | — | — | ✅ (classify size) |
| 1 | **Discovery & Context** | `aedl-discovery` | ✅ | — |
| 1.5 | Decision harvest | — | — | ✅ (one batched round) |
| 2 | PRD / spec | `to-spec` (+ issue-tracker adapter) | ☐ | — |
| 3 | Work breakdown | `to-tickets`, `epic-story-hamburger`, `epic-estimate` | ✅ (`to-tickets`) | — |
| 4 | **Execution-Plan gate** | `templates/execution-plan.md` | — | ✅ (gate logic + template) |
| 5–6 | Build | `tdd` | ✅ | — |
| 7 | Delegation | `subagent-delegation-workflow` | ✅ | — |
| 8 | **Verify + review** | `aedl-verify` (+ `pr-review-cycle` on PRs) | ✅ | — |
| 9 | Decision report | — | — | ✅ (memo + decision table) |
| 10–12 | Push / merge / repeat | `sync-workflow`, `notes-merge-workflow`, `pr-review-cycle` | ☐ | — |

**Transition rule.** Advance to stage N+1 only when stage N's `produces` artifact **exists** AND
its `done-when` gate **passes**. Artifact-gated and deterministic — never "seems done." A stage
never borrows the next stage's permissions.

**Migration status (AEDL v2).** Stages **1, 3, 5–6, 7, and 8** carry the
[contract block](../../../docs/aedl-v2/stage-skill-contract.md) — their `done-when` is a checkable
gate. Only **stage 2** (`to-spec`) and the 10–12 tail still route to skills whose `done-when` is
prose. Extract one at a time — the hand-off keeps working because each honors the same
`produces → requires` shape.

> **Vendored stage-skills.** `to-tickets` and `tdd` originally existed **only** in the global
> `~/.claude/skills/` (third-party, untracked, and overwritten by a re-install of that skill set).
> Both are now vendored into this repo's `.claude/skills/` — the repo-local copy is the AEDL
> source of truth and is the one this stage map means. The global copies are upstream method
> references, not lifecycle stages.
>
> **This is not hypothetical.** The 2026-07-25 upstream refresh **deleted `to-issues`** (merged
> with `to-plan` into `to-tickets`), renamed `to-prd` → `to-spec`, and rewrote `tdd`. Vendoring is
> the reason stage 3 survived a skill that no longer exists. When re-vendoring after a refresh,
> re-read the method for doctrine changes, not just wording — the same refresh moved **refactoring
> out of the TDD loop** into the review stage, which changed stage 5–6's `done-when`.

## When To Use

- `@aedl -lifecycle <objective>` / `/aedl-lifecycle` — start (or resume) the loop for a
  feature, epic, or fix.
- "Take this idea to a merged PR", "run the full build loop on this".

Do **not** use for: single small edits (just do them), pure research questions
(`deep-research` / `grill-me` directly), or notes-vault operations (their own commands).
If a stage's skill is missing in a repo, stop and report the gap — don't improvise the
stage inline.

## The privilege ladder (least privilege → full throttle)

| Stage band | Actor | Write scope | Delegation tier |
| --- | --- | --- | --- |
| Plan / research / define | Brain (or worker) | none (read-only) | T4 |
| PRD / issues | Brain | tracker only | — |
| Build (structures, flow, tests) | Worker under grant | work branch only | T3 |
| Push branch | Worker or brain | branch, never main | T2 |
| Review / report / decisions | Brain + human | report files | — |
| Merge | Per repo permissions | main | human (or brain only where the repo's merge convention explicitly allows, e.g. single-owner notes repos) |

Escalate one rung at a time; a stage never borrows the next rung's permissions.

## Autonomy tiers — calibrate machinery to blast radius, not uniformly

Each slice in the Execution Plan carries a tier. The tier decides which machinery engages —
**this is a dial, not a policy**, and over-engaging it is how the harness gets bypassed.

| Tier | Engages | Use for |
| --- | --- | --- |
| **green** | host-native controls (permission modes, deny rules, push protection) + the review gate. **No lock/hook machinery.** | most slices: notes ops, art prep, low-risk features and bugs |
| **amber** | tier grant (lock + guard hooks); human reviews the plan **and** the diff | feature builds touching real logic, multi-file |
| **red** | full lock/hook stack + a human checkpoint per slice | one-way doors, migrations, **control-plane / harness** work |

The `.claude/hooks/` machinery already no-ops with no active lock — **the green path exists
today**, it just wasn't named. Green is also the **work-parity** tier: it behaves identically on
Claude Code and on the work editor-AI, so anything green is portable. Amber/red depend on
Claude-Code-specific hooks and stay personal-only.

**Guardrails are not a sandbox** at any tier — genuinely untrusted work needs OS-level isolation.

## Counter-challenge rule — at every gate

When the human approves with one word ("go", "yes") or just accepts the recommended option,
**don't prevent that** — but before it carries the stage forward, re-affirm that what's being
approved still satisfies (1) the repo's **stack profile** / house standards and (2) the **stated
requirements**. If there's a gap, surface it as a visible yes/no ("you said go, but this slice
ships no negative test, which the stack profile requires — proceed anyway?").

**Challenge, never block. Never a silent pass.** This is not a laziness cop; it keeps judgment
injection deliberate and visible.

## Standard Process

0. **Intake.** Restate the objective; classify size. **Small** (task/bug/single story) →
   skip stages 2–3's tracker ceremony and use a todo breakdown instead; **large** → full
   path. State the classification and chosen path before proceeding.
1. **Discovery & Context** *(read-only, T4-delegable)* — **route to `aedl-discovery`.** Do not
   explore inline. It produces the target repo's **context triad** (`CONTEXT.md` + `MAP.md` +
   `docs/stack-profiles/<repo>.md`), a **feasibility inventory** citing `file:line`, and the
   **question set** for stage 1.5. Then stress-test the framing with `grill-me`/`grill-with-docs`
   and use `deep-research` for external questions. Output: a plan the user has seen, grounded in
   the triad. **Gate:** don't enter 1.5 until the triad artifacts exist and are dated today.
1.5. **Decision harvest.** Before writing a PRD, take Discovery's question set — plus every
   decision only the human can make (artifact locations, platform/targets, cost ceilings, naming,
   any one-way door) — and ask them in **one batched `AskUserQuestion` round**, not a trickle of
   one-off questions scattered across later stages. Record the answers as a **"Locked decisions"**
   list; every later stage cites this list instead of re-asking. Questions embedded in the target
   repo's *own* instructions ("ask before X") feed this round too. A newly-surfaced one-way door
   **re-opens** the harvest even after it closed. (Evidence: the memory-book pipeline ran
   zero-stall this way — all human calls front-loaded, no mid-build pauses.)
2. **Spec / PRD** — `to-spec` skill → publish to the tracker (issue-tracker adapter).
3. **Work breakdown** — `to-tickets` for tracker-worthy slices (tracer-bullet vertical
   slices, each declaring its **blocking edges**); plain todos for small items
   (stories/tasks/bugs) that don't warrant issues. Work the **frontier** — any ticket whose
   blockers are all done — which is what makes parallel slices possible at all.
4. **Execution-Plan gate** — the throughline. Consolidate stage 1.5's locked decisions and
   stage 3's slices into **ONE human-approved artifact**: [`templates/execution-plan.md`](../../../templates/execution-plan.md).
   **No build stage runs until `☐ approved` is ticked.** This *replaces* the v1 inline definition
   gate — don't run two gates.
   - **Scale it to size.** A bug fills the header + one slice row; a large initiative fills every
     section. Keep it **inline in the tracker issue** for small/medium work (the issue *is* the
     gate artifact — proven in Run 2); spawn a file only for a large initiative. Gate fatigue on
     trivial items is a real failure mode: the stage-0 small path must stay genuinely light.
   - **Every slice row carries** DoD + testable acceptance + explicit non-goals + a **feasibility**
     cell + an **autonomy tier**. Feasibility comes from stage 1's inventory (`file:line`), not from
     the issue text. A slice whose assumed layer is missing — a "frontend" slice that actually needs
     a backend endpoint that doesn't exist — is infeasible **as written** and goes back to stage 3;
     so does a slice with untestable acceptance.
   - **Control-plane slices** (touching `.claude/hooks/`, `.claude/settings*`, or any grant/lock
     machinery) are **red tier and brain-only** — never delegate the build, only the exercise. A
     guarded worker is fenced from exactly those files (Run 1, finding 1: control-plane
     self-fencing).
   - **Counter-challenge on approval** (see above): a one-word "go" is re-checked against the stack
     profile and the stated requirements before it carries the build forward.
   (Evidence: KR2 shipped a frontend-only/backend-only miss that a feasibility read would have
   caught before the build started. Gate validation: 2 of 3+ runs logged — see Learning Notes.)
5. **Build the data structures** — types/schemas/migrations/contracts first, versioned
   behind the acceptance criteria. Prefer TDD (`tdd` skill) here too: shape tests pin the
   contracts.
6. **Build the flow** — wire behavior through the structures (tracer bullet end-to-end
   before breadth).
7. **Delegation** — hand build slices to workers via `subagent-delegation-workflow`
   (@aedl -delegate): T3 grant, work branch, expiry. **The worker runs TDD first** —
   red-green-refactor per slice; a worker report without failing-test-first evidence is
   an automatic review flag. The worker's final report MUST follow
   `subagent-delegation-workflow`'s `references/worker-report-schema.md` (OUTCOME /
   OBJECTIVE-RESULT / TESTS / COMMITS / FILES-CHANGED / DEVIATIONS per class / BLOCKED /
   CONCERNS) — that skill's Step 5 embeds the schema in the spawn prompt, so this stage
   just consumes it; a report that doesn't follow the schema is itself a review flag.
   Brain stays orchestrator; brain-only skills never delegate.
8. **Verify + review** — route to `aedl-verify` (`@aedl -verify`). Deterministic gates first
   (the target's real build/typecheck/lint/test commands — a failure there IS the report),
   then **four independent axes in parallel sub-agents**: Standards · Spec · **Security** ·
   **Design** (the floor, `docs/DESIGN-TEAM.md` §6 — core since 2026-08-15),
   with the judge count scaled to the slice's autonomy tier (green 4 / amber 6 / red 10;
   Design is never multiplied — its blocking set is a closed enumeration).
   **A diff with no design surface does not skip the axis** — the axis still runs and returns
   `no design surface in this diff`, which is a **verdict it must justify against §6.1's
   enumeration**, not an omission. Omitting the axis is never permitted (§1 decision 13).
   **And check §5.2 before triaging a floor failure as a Blocker:** a live report-only
   exception can suspend floor *severity* for a named repo, in which case it files as `debt`.
   Axes are aggregated **without reranking across them**, then every finding is triaged to
   fix-now / fix-next (**ticket filed**) / accept (reason recorded) / reject (evidence given).
   The parallel axes are the harness's answer to **self-review bias** — the same model building
   and reviewing its own work was a named standing risk. This stage **never fixes what it
   finds**: fix-now goes back to stage 5–6 or a delegated fix pass. Findings cite `file:line`
   **in the diff** — the worker's report is the claim under test, never the evidence.
9. **Decision report** — send the user a short memo: what shipped, review findings ranked
   by severity, and **one decision table** — each open call gets: recommended default,
   risk if wrong, reversibility (cheap-to-undo vs one-way door). One-way doors are never
   defaulted silently. The goal is decisions in minutes, not re-review.
10. **Push** — branch push (never main; HARD RULES apply under any active grant).
11. **Merge — per permissions.** Repo convention decides: PR + review where required;
    direct squash-merge only where the repo explicitly allows (e.g. notes-repo
    `-merge`). The agent never grants itself merge rights.
12. **Repeat.** Next slice → stage 4. On loop exit: update the tracker, close/tick
    issues, offer sync per that repo's convention.

## Guardrails

- **Ladder is mandatory.** Read-only until a plan exists; **no code before the Execution Plan
  is approved**; no merge outside repo permissions. Skipping a gate requires the user saying so.
- **Transitions are artifact-gated** — a stage advances on its `produces` artifact existing and
  `done-when` passing, never on "seems done."
- **Tier the machinery, don't max it.** Green is the default; engage amber/red only for the blast
  radius that earns them. Over-engagement is how a harness gets bypassed.
- **Security review is never optional** — stage 8's Security axis runs at every tier, including
  green, including "trivial." Triviality is a claim about blast radius; blast radius is what the
  axis checks.
- **Worker TDD is a grant condition** — encode it in the delegation objective text.
- **Evidence over vibes** — reviews run tests/tools; reports cite artifacts (test output,
  file:line), not impressions.
- **Decision memos flag irreversibility** — one-way doors always surface to the human.
- **This skill only orchestrates** — the moment a stage does real work, it is inside the
  routed skill's own guardrails (which win on conflict). A stage done inline instead of routed
  is *orchestrator drift*, the named standing risk this refactor exists to kill.

## Expected Output

Per invocation: the stage(s) executed, artifacts produced (plan / PRD link / issues /
branch / worker report / review findings / decision memo), the current rung on the
privilege ladder, and what stage the next invocation resumes at.

## Known risks / future passes (tracked on the issue tracker)

- Self-review bias (same model builds and reviews) → independent reviewer pass (#5 pass 1).
  **Observed live (run 1):** the same brain built and reviewed; brain-review still caught two
  real sanitizer defects, but an independent T4 reviewer would harden this.
  **ADDRESSED 2026-07-25** by `aedl-verify` — the three axes run as parallel sub-agents with
  independent context, so no axis can rationalize another's blind spot and none inherits the
  builder's. **Not yet observed live**; the first real run is the test of whether independence
  actually changes what gets caught.
- Stage-4 gate validation (#5 pass 2 → v2 **WS-C**). **2 of 3+ runs logged** (see Learning Notes),
  both "useful, low friction." The gate is no longer EXPERIMENTAL in shape — it is now the
  Execution-Plan gate on a fixed template — but the *de-experimental* call still wants one more
  run's evidence. Keep logging stage-4 observations.
- **v2 migration is nearly complete.** Stages 1, 3, 5–6, 7, and **8** now carry contract blocks.
  Only **stage 2** (`to-spec`) remains prose-gated. Stage 8 was extracted 2026-07-25 as
  `aedl-verify`, built on upstream `code-review`'s parallel two-axis engine plus a deterministic
  pre-gate, a mandatory Security axis, tier-scaled judges, and triage — that is WS-A's spine.
  **Still unbuilt inside it:** mutation testing (deliberately deferred by the adoption plan) and an
  *automated* supply-chain screen — the <14-day dependency check is a human-read instruction in the
  Security brief, not a tool. Don't let the stage's existence read as WS-A being finished.
- Delegation work log (evidence trail) — **DONE (#4, run 1):** `worklog-append.sh` (single
  sanitizing writer) + guard/release/skill feeders + `@aedl -delegate log <id>` render.
- Guard prose false-positives can block tracker writes mid-loop (see #3 follow-up).
  **New for #3 (run 1, false-NEGATIVE):** `git -C <path> push|commit` and other git global
  options (`--git-dir`, `-c`) evade the `delegation-guard-bash.sh` push/commit HARD-RULE regexes
  (`git[[:space:]]+push`) → a worker can push to main via `git -C`. Surfaced by the live run;
  only the host's independent push-protection stopped it (see #9 — host-specific armor).

## Learning Notes

### Run 1 — 2026-07-05 — delegation work log (#4). **Archived** → [`notes/reviews/2026-07-05-aedl-lifecycle-run1.md`](../../../notes/reviews/2026-07-05-aedl-lifecycle-run1.md)

One line: stage-4 gate **useful, low friction**; the run's own findings were control-plane self-fencing (a slice that edits the guards cannot be built by a guarded worker), the `git -C` HARD-RULE bypass, and the per-stage cost table that put research — not build — as the dominant sink.

### Run 2 — 2026-07-06 — Wyrdglass motion pass (axis-grim #145 → PR #146). Armor: ring 3 (Claude Code hooks), enforced. Fable session.

**Stage-4 definition gate: 2 of 3+ runs logged — again useful, again low friction.** The gate lived
directly in the tracker issue body (M1–M6 slice table + acceptance + non-goals) rather than a separate
doc — worked well: the issue IS the gate artifact and the worker brief cited it verbatim. The
feasibility read (a T4 Explore inventory of the shipped components, file:line) caught the load-bearing
fact **before** slicing: most contract-§5 moments had NO CSS class toggled in the shipped code, so the
build needed transient event signals + engine-state diffing — that shaped M3–M5 and the TDD demand.
Without the read, the slices would have assumed hooks that didn't exist (the KR2 failure shape, avoided).

**Findings:**
1. **Medium-path calibration.** A single slice of an existing program with a complete design contract →
   skip `to-spec`/`to-tickets`, file ONE implementation issue (pattern: #128/#137/#140). Zero ceremony
   lost; the tracker still carries the gate.
2. **Explore-first delegation briefs work.** The T4 inventory (file:line hooks, trigger methods, test
   runner facts) went into the worker brief verbatim; the worker (Fable, ~230k tok) returned success in
   one pass, 0 guard blocks, no re-exploration. "Hand off after research" paying off.
3. **Budget-aware building.** The worker autonomously adopted a companion `*.component.motion.scss` +
   `styleUrls` pattern when contest's sheet sat 230B under the hard 10kB anyComponentStyle budget (the
   run-#137 CI lesson) — and reported it honestly under DEVIATIONS/FORMAT. The deviation-class schema
   again earned its keep (4 documented spec approximations, all defensible CSS-only calls).
4. **Concurrent multi-lock validated from the lifecycle path.** A live T1 lock (memory-book, different
   session + work repo) coexisted with this T3 activation exactly as the multi-lock design intends.
5. **TS-can't-read-SCSS-tokens seam.** Motion clear-timeouts in TS mirror token durations as commented
   constants (`240*2`). Acceptable once; if it recurs, consider emitting motion tokens to a TS module.

### Run 3 — 2026-07-26 — command-center #62 per-repo panel state → PR #66. Amber → green. **First live `aedl-verify` run.**

Records: Execution Plan on the issue (`#62#issuecomment-5084087838`); discovery
[`notes/reviews/2026-07-25-command-center-62-discovery.md`](../../../notes/reviews/2026-07-25-command-center-62-discovery.md);
verify rounds [1](../../../notes/reviews/2026-07-26-cc62-verify.md) ·
[2](../../../notes/reviews/2026-07-26-cc62-verify-round2.md) ·
[3](../../../notes/reviews/2026-07-26-cc62-verify-round3.md) ·
[4](../../../notes/reviews/2026-07-26-cc62-verify-round4.md).

**Stage-4 gate: 3 of 3+ runs logged — DE-EXPERIMENTAL.** The skill's own criterion ("de-experimental
for small/medium features after ~2 more runs", run 1) is met. Third consecutive "useful, low friction"
verdict; again lived **inline in the tracker issue**, again became the worker brief verbatim. Stop
logging it as experimental; keep logging *findings*.

**Stage 1 earned its place, loudly.** The handoff sentence asserted #62 "needs no one-way-door
decision." **Discovery falsified that**: `machine-config.ts:16-17` documents `kind:'repo'` as "git
panel only" — today's behaviour was *shipped design*, not the oversight the ticket described. An
on-disk estate check then found `HANDOFF.md` is the **only** harness surface existing in more than one
repo. Together those reshaped the deliverable from "rewire eight panels" to "one panel plus the
contract," and produced a **fourth scope class the ticket never named** (`aedl-root-scoped` — pinned
on purpose). *Read the code, never the ticket* — including when the ticket is your own handoff.

**The counter-challenge rule paid, and then the build half-ignored it.** A one-word approval of the
`PanelDef[]` registry was re-checked against the stack profile ("all domain logic in `@cc/core`") and
surfaced as a yes/no; the human split the classification into core. The worker then put the
classification in core and the *resolver that uses it* in the head — stage 8's Standards axis caught
it as a HARD violation. **A locked decision is not self-enforcing; verification is what enforces it.**

**Findings:**

1. **Verification is a loop, not a gate — budget for 2+ rounds.** Round 2 found three defects **the
   round-1 fix pass introduced**, including a fix that contained an instance of the bug it fixed.
   Round 3 found the round-2 fix was **cosmetic**. Planning one review pass under-budgets the stage;
   the run took 4 rounds and 3 delegations for a "medium" slice.
2. **Re-verify the whole merge diff, not the fix delta.** Each round reviewed `origin/main...HEAD`.
   Round 2's race was only visible against the accumulated diff.
3. **Drop the tier mid-run when the blast radius drops.** Amber (5 judges) → green (3) once the
   remaining work was ~10 lines. Green rounds produced the run's sharpest findings at 40% of the cost.
   Tiering is per *round*, not fixed at stage 4.
4. **Model floor for delegated fixes** — see `subagent-delegation-workflow` Learning Notes. Sonnet
   passes disclosed honest partials; the Haiku pass produced a cosmetic fix plus two false claims.
5. **Harness defects fall out of real runs, and one paid immediately.** Three fixed mid-session
   (stack profile wrongly listing `build:desktop` as toolchain-blocked; a stale judge-count line in
   both execution-plan templates; `COVERAGE` as one summary line). The per-clause `COVERAGE` rewrite
   caught the **very next delegation** disclosing a real judgment call instead of a bare "clean."
6. **Brain-direct is the right escalation after two failed delegations on one item.** The switcher
   race survived two delegated fix passes. The third attempt was brain-direct — and round 4 then
   caught an overclaim in *that* commit message. The axes work on the brain's output too.

_Populate after each run — especially stage-4 (Execution-Plan gate) observations, and which
stages were routed vs. done inline (orchestrator-drift evidence)._

> **Run-log budget (roadmap P2.9):** keep **≤2 recent runs inline**. When a third lands, move the
> oldest to `notes/reviews/` and leave a one-line summary here — this skill is the heaviest
> always-loaded doc in the harness and it taxes every future lifecycle session.

## Change Log

- 1.5.1 — **"Design surface" defined (2026-08-17, [mn#29](https://github.com/matterjd/matter-notes/issues/29)).**
  The term that decides whether the Design axis applies at all was used eight times across the
  harness and defined in none of them, so a diff without obvious UI got whichever reading its
  judge arrived with. It now has one home — **`docs/DESIGN-TEAM.md` §6.1** — and all eight sites
  cite it rather than restate it. The rule: design surface is a property of what the diff
  **renders**, never of what records the repo **keeps**. A diff touching only build tooling, CI,
  scripts and docs has **none**, and `docs/design/` existing is not surface — checking a build
  against a design doc's decision list is the **Spec** axis's job, and §5's no-reranking rule
  means a finding filed to the wrong axis cannot be moved later. Prose counts only where it is
  rendered in a surface a person operates; terminal output is out by default, available as a
  declared added axis where a repo carries a CLI style guide.
- 1.5.0 — **Stage 8 gains a fourth core axis: Design (2026-08-15).** Matter's ruling on the
  Design Team charter (`docs/DESIGN-TEAM.md` §12 item 4) promotes design from a *permitted
  added axis* (the 2026-08-14 floor+additions ruling) to a **core** one: Standards · Spec ·
  Security · Design, never removable. Its blocking set is the charter's floor (§6); its
  judge is the Design Reviewer brief at T4. Judge counts move green 3→4 / amber 5→6 / red
  9→10 — Design is never multiplied, because a closed enumeration gains nothing from a second
  reader. A diff with no design surface gets "no design surface in this diff", which is a
  finding, not a skip. *(What counts as design surface was left undefined here and is
  settled in 1.5.1 — `docs/DESIGN-TEAM.md` §6.1.)*
- 1.4.0 — **Stage 8 extracted (2026-07-25), AEDL v2 Phase 1 opens.** Stage 8 routes to the new
  `aedl-verify` stage-skill: deterministic gates → three independent axes (Standards · Spec ·
  Security) in parallel sub-agents → tier-scaled judges → triage. Built on upstream `code-review`'s
  engine rather than authored blind. Closes the self-review-bias finding by construction (unproven
  live). Only stage 2 remains prose-gated.
- 1.3.0 — Upstream skill refresh absorbed (2026-07-25, same day). `mattpocock/skills` @ `ed37663`
  **deleted `to-issues`** (merged with `to-plan` into `to-tickets`), renamed **`to-prd` → `to-spec`**,
  and rewrote `tdd`. Stage map, stage list, and prose renamed accordingly; both vendored
  stage-skills re-vendored with their contracts rebased. Stage 5–6's `done-when` **dropped the
  refactor clause** — the refreshed method moves refactoring out of the red→green loop into the
  review stage. `code-review` noted as the leading stage-8 candidate.
- 1.2.0 — AEDL v2 Phase 0 complete (2026-07-25): contract blocks added to
  `subagent-delegation-workflow` (stage 7) and to `to-issues` (stage 3, now `to-tickets`) + `tdd` (stages 5–6),
  both of which were **vendored into this repo** from the global third-party skill set first —
  they had been living untracked in `~/.claude/skills/`, where a re-install would have silently
  rewritten two lifecycle stages. Stage map gains a Contract column; migration status now names
  stages 2 and 8 as the remaining prose-gated pair.
- 1.1.0 — AEDL v2 Phase 0 (2026-07-24): thin-orchestrator refactor. Added the stage map +
  orchestrator/stage-skill split, the artifact-gated transition rule, autonomy tiers
  (green/amber/red), and the counter-challenge rule. Stage 1 extracted to the `aedl-discovery`
  stage-skill; stage 4's inline definition gate replaced by the **Execution-Plan gate** on
  `templates/execution-plan.md`.
- 1.0.0 — Initial scaffold (2026-07-04) from the wyrdglass/delegation build experience.
