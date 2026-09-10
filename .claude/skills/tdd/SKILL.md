---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

> **Provenance.** The method below comes from the third-party `tdd` skill in the global
> `~/.claude/skills/`, refreshed from `mattpocock/skills` @ `ed37663` on 2026-07-25. This
> repo-local copy is the **AEDL source of truth** — it carries the stage contract and is
> version-controlled here so a re-install of the global skill set cannot silently rewrite a
> lifecycle stage. Keep the method in sync deliberately.
>
> The 2026-07-25 refresh changed this skill materially: it added **seams** and the **tautological**
> anti-pattern, and it **moved refactoring out of the loop** into the review stage. It also
> relocated `deep-modules.md`, `interface-design.md`, and `refactoring.md` into upstream's new
> `codebase-design` skill — which this workspace has **not** installed. Those three files are gone
> from this copy; if a build needs deep-module vocabulary, pull `codebase-design` rather than
> resurrecting them here.

> **This is a stage-skill.** It implements AEDL stages 5–6 (Build: structures → flow) behind the
> [stage-skill contract](../../../docs/aedl-v2/stage-skill-contract.md). The orchestrator
> (`agentic-development-lifecycle`) loads it only when the build stages run; it is equally valid
> standalone for any test-first build or fix.

## Contract

```
stage:       5–6 — Build (data structures → flow)
requires:    an Execution Plan with `☐ approved` TICKED (stage 4) — no build stage runs before
             that; the ticket's acceptance criteria + non-goals; the stack profile's real
             test/build commands and house standards; a work branch (never the default branch);
             the SEAMS under test, written down and confirmed with the human
does:        build the slice test-first — one tracer bullet, then one behavior per red→green
             cycle at a confirmed seam. Structures/schemas/contracts first (stage 5), then the
             flow through them (stage 6)
done-when:   the tracer bullet is GREEN end-to-end AND every acceptance criterion has a test that
             exercises it at a PRE-AGREED seam AND the full suite passes with the stack profile's
             own command AND no non-goal was built. (Refactoring is NOT part of this gate — it
             belongs to stage 8; see Rules of the loop.)
produces:    code + tests on the work branch, and the suite's real pass count
             (→ stage 7 delegation, or straight to stage 8 verify + review)
autonomy:    amber — writes code, but only inside the work branch and only inside the approved
             slice. Delegable at T3 with a surgical brief; red tier if the slice touches the
             control plane (`.claude/hooks/`, settings, grants) — those build brain-only.
challenges:  "write all the tests first, then all the code" — that is the horizontal slice; tests
             written in bulk test IMAGINED behavior and go insensitive to real change;
             "the suite is green, it's done" — green proves the tests pass, not that the slice
             exists; check the diff against the acceptance criteria (a stub with a green suite is
             the exact shape of a gutted feature);
             "this assertion obviously holds" — a test that recomputes the expected value the way
             the code does can never disagree with the code. Expected values come from an
             independent source: a known-good literal, a worked example, the spec;
             "I'll just test this bit here" — no test at an unconfirmed seam, ever;
             "while I'm in here I'll also…" — the non-goals fence is the slice; anything outside
             it goes to the parking lot or a new ticket, not into this diff
mirror:      tests and code are the artifact; the loop is a discipline, not tooling. Any editor-AI
             runs the same commands from the stack profile and reads the same suite output.
```

## Entry check (AEDL)

Before anything else in a lifecycle run: confirm the Execution Plan's `☐ approved` box is
**ticked**. If it isn't, stop — the build stages do not run, and this is not a judgment call
(orchestrator stage 4). Outside a lifecycle run this step is a no-op.

Read the stack profile (`docs/stack-profiles/<repo>.md`) for the repo's **real** test and build
commands and its checkable house rules. Use those commands verbatim; do not invent a test
invocation.

---

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle — consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification — "user can checkout with valid cart" tells you exactly what capability exists — and survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams — where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything — agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?"

> **In an AEDL run**, the ticket's **acceptance criteria are already the behavior list** and the
> Execution Plan already carries the human's approval — don't re-run the approval round, map the
> criteria to behaviors and go. The seams are the thing that still needs confirming: the plan fixes
> *what* must work, rarely *where* it is observed. Confirm the seams, then start the loop.

## Anti-patterns

- **Implementation-coupled** — mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological** — the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth — a known-good literal, a worked example, the spec.
- **Horizontal slicing** — writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead — one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.

> **AEDL reading of that last rule:** refactoring moves to **stage 8 (verify + review)**, not into
> this stage's `done-when`. A build that stops at green and hands a ranked refactor list to stage 8
> is following the method, not cutting a corner. This is a change from the pre-2026-07-25 method,
> where refactor-from-green closed the build stage.

## Exit check (AEDL)

The stage is done only when the contract's `done-when` holds. Report the suite's **real** numbers
(the command you ran and its actual output), map each acceptance criterion to the test that covers
it and the seam it runs at, and state explicitly that nothing outside the non-goals fence was built.
A stage report that says "tests pass" without the count and the command is not evidence.

```
BUILD — <ticket> @ <YYYY-MM-DD>
BRANCH:      <work branch>
SEAMS:       <the seams confirmed before the loop started>
CYCLES:      <n> red→green   (tracer bullet: <the one behavior it proved>)
SUITE:       <exact command> → <actual result>
CRITERIA:    <n>/<n> acceptance criteria each mapped to a test + its seam
NON-GOALS:   held / VIOLATED (<what leaked in>)
REFACTORS:   <ranked list handed to stage 8, or "none noted">
NEXT:        stage 8 (verify + review)
```

## Change Log

- 2.0.0 — Re-vendored (2026-07-25) from the refreshed upstream. Method gains **seams** (no test at
  an unconfirmed seam) and the **tautological** anti-pattern; **refactoring leaves the loop** for
  the review stage, so it left this stage's `done-when` too and the exit report now hands stage 8 a
  ranked refactor list. `deep-modules.md` / `interface-design.md` / `refactoring.md` dropped —
  upstream moved them to the (uninstalled) `codebase-design` skill.
- 1.0.0 — Vendored into this repo (2026-07-25), AEDL v2 Phase 0: stage-5/6 contract block plus the
  Execution-Plan entry check and the evidence-shaped exit check.
