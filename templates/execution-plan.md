# Execution Plan — {WORK_ITEM_TITLE}

> The single human-approved artifact that **gates the build**. Nothing in the build stages runs until
> this plan is approved. Consolidates the decision harvest (stage 1.5) and the definition gate (stage
> 4). Scale it to size: a bug fills the header + one slice row; a large initiative fills every section.
> Where your editor-AI already expects a plan-before-code gate, **this plan satisfies it** — don't run
> two.

> **How this repo uses it.** This is the stage-4 gate of `@aedl -lifecycle` — it **replaces** the v1
> inline "definition gate". Copied from [`docs/aedl-v2/templates/execution-plan.md`](../docs/aedl-v2/templates/execution-plan.md)
> (the kit source of truth — change both together). Scale it to size: a bug fills the header + one
> slice row; keep it **inline in the tracker issue** for small/medium work (proven pattern —
> lifecycle Run 2) and spawn a file only for a large initiative. The stack profile referenced below
> lives in [`docs/stack-profiles/<repo>.md`](../docs/stack-profiles/).

- **Work item:** {id / title} · **Type:** feature | initiative | story | bug
- **Size / path:** small (todo breakdown) | large (full lifecycle)
- **Target repo:** {repo} · **Host:** {code host} · **Tracker:** {tracker}
- **Stack profile:** {path to the repo's stack profile}
- **Author / date:** {name} / {YYYY-MM-DD}
- **Approval:** ☐ approved by {human} on {date}  ← **build is blocked until this is ticked**

## 1. Objective & context
- **Problem / objective (1–3 sentences):**
- **Why now / value:**
- **Context triad read:** `CONTEXT.md` ☐ · `MAP.md` ☐ · stack-profile ☐  (paths / notes)
- **Discovery findings that shape the work** (cite `file:line` where load-bearing — don't trust the ticket text):

## 2. Locked decisions  *(front-loaded — every human-only call, asked in ONE batched round)*
| # | Decision | Chosen answer | Reversibility | Decided by |
|---|----------|---------------|---------------|------------|
| 1 |  |  | cheap-to-undo / **one-way door** |  |

## 3. Design spec reference
- **Design spec:** {link, or "inline below"}
- **Module / structure impact** (boundaries touched):
- **Contracts / interfaces changed:**
- **ADR needed?** ☐  (if yes → {adr path})

## 4. Slice table  *(tracer-bullet vertical slices)*
| Slice | Definition of done | Testable acceptance (conformance) | Non-goals | Feasibility (layer exists?) | Autonomy tier |
|-------|--------------------|-----------------------------------|-----------|-----------------------------|---------------|
| S1 |  |  |  | ✅ / ❌ re-slice | green/amber/red |

**Autonomy-tier legend — calibrate to risk / reversibility / blast radius, NOT uniform:**
- **green** → host-native controls + the review gate; delegate freely; light human gate. *No lock/hook machinery.*
- **amber** → engage the tier grant (lock + guard hooks); human reviews the plan **and** the diff.
- **red** → full lock/hook stack + a human checkpoint per slice; one-way-door or control-plane work.

## 5. Verification plan  *(which review-pipeline gates apply)*
- Deterministic gates: build ☐ · typecheck ☐ · lint ☐ · unit/integration ☐ · coverage delta ☐
- Conformance tests (from §4 acceptance): {list}
- Adversarial probing ☐ · Mutation testing ☐  *(higher-risk only)*
- Council of judges (scaled by `aedl-verify`, stage 8): **green 4 / amber 6 / red 10** across
  **four core axes — Standards · Spec · Security (never optional) · Design (the §6 floor)** —
  per `aedl-verify/SKILL.md`, which is the authority; any unanimous security finding is a hard
  stop. *(Corrected in pass 5: this template froze at the pre-Design 3/5/9 shape and under-scaled
  every verify planned from it — the doctrine-in-two-mirrors failure, again.)*
- Security + supply-chain screen ☐  (OWASP Top-10; hallucinated / <14-day-old dependency check)

## 6. Risk & rollback
- **Top risks:**
- **Rollback plan:**
- **One-way doors (surfaced to the human, never silently defaulted):**

## 7. Out of scope (whole plan)
-
