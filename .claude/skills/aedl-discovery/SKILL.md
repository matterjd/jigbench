---
name: aedl-discovery
description: Stage 1 of the AEDL lifecycle — read-only Discovery & Context. Produce or refresh a target repo's context triad (CONTEXT.md + MAP.md + stack profile), inventory feasibility against the real code, and extract the question set that feeds the decision harvest. Use for the @aedl -discovery command (/aedl-discovery), "refresh the context triad", "what's the stack profile for <repo>", or as the lifecycle's stage-1 route before any PRD or plan.
---

# Discovery & Context — AEDL stage 1

The lifecycle's **read-only** opening stage. It produces the persistent artifacts every later
stage cites, so nothing downstream has to re-explore the repo. Discovery is the cheapest place
to catch a wrong assumption and the most expensive place to skip.

> **This is a stage-skill.** It implements one lifecycle stage behind the
> [stage-skill contract](../../../docs/aedl-v2/stage-skill-contract.md). The orchestrator
> (`agentic-development-lifecycle`) loads it only when stage 1 runs; it may also be invoked
> directly to refresh a repo's triad outside a lifecycle run.

## Contract

```
stage:       1 — Discovery & Context
requires:    read access to the target repo; the objective (or "refresh only")
does:        read the repo's own instruction files and code; produce/refresh the context triad;
             inventory feasibility; extract every human-only question the work will need
done-when:   all three triad artifacts exist and are dated today for this repo; the feasibility
             inventory cites file:line for each load-bearing claim; the question set is written
             down TO A FILE (even if empty) — not left in the transcript
produces:    CONTEXT.md + MAP.md (in the TARGET repo) · docs/stack-profiles/<repo>.md (in the
             CONTROL-PLANE repo) · the discovery note carrying the feasibility inventory +
             question set (→ stage 1.5 decision harvest; location follows the seat — step 6.5)
autonomy:    green — read-only, no writes outside those four artifacts. T4 if delegated.
challenges:  "we already know this repo" (a stale triad is worse than none — check the dates);
             "the ticket says the endpoint exists" (read the code, never the ticket text)
mirror:      the triad is plain markdown in the target repo — the work editor-AI reads the same
             three files with no translation
```

## When To Use

- `@aedl -discovery [<repo>] [<objective>]` / `/aedl-discovery` — refresh a repo's context triad,
  optionally scoped to an objective so the feasibility inventory and question set are targeted.
- Automatically, as the lifecycle's stage-1 route, before PRD/spec/slicing.
- Any time you're about to plan work in a repo whose triad is missing or stale.

Do **not** use for: answering a one-off code question (just read the file), or as a substitute
for the build-time feasibility read inside a slice.

## Inputs To Gather (ask only if not obvious)

1. **Target repo** — resolve from `repos[]` in `config/workspace.yml`; use the **exact on-disk
   path**, never the display name.
2. **Objective** — optional. With one, the feasibility inventory and question set are scoped to it;
   without one, this is a triad refresh only.
3. **Existing triad state** — which of the three artifacts exist, and their `Last refreshed` dates.

## Standard Process

1. **Locate the repo and read its own instructions first.** Every agent-instruction file, editor
   config, contributing guide, and lint/format config. List them — the stack profile must record
   exactly what it was profiled from. The repo's files are authoritative; this stage synthesizes,
   it never overrides.

2. **Refresh `MAP.md`** (structure). If absent, write it — `MAP.md` is **required per repo** and is
   the cheapest, highest-return context artifact there is. If present and current, say so and move on.

3. **Refresh `CONTEXT.md`** (domain language + load-bearing decisions). Two sections carry the
   weight: the **vocabulary** an agent must use correctly, and the **decisions not recoverable from
   the code or git history** — each with *why it exists*. Do not restate operating rules that live
   in the repo's instruction file; point at them.

4. **Refresh the stack profile** — `docs/stack-profiles/<repo>.md` in *this* control-plane repo,
   from [`docs/aedl-v2/templates/stack-profile.md`](../../../docs/aedl-v2/templates/stack-profile.md).
   Distill only **checkable** rules, and cite the source file for each. Record the real test/build
   commands **and run them once** to capture a verified baseline — a profile that states a suite
   count it never observed is a liability.

5. **Feasibility inventory** *(only when an objective was given)*. For each thing the objective
   assumes — a layer, an endpoint, a table, a component, a permission — **read the code** and record
   `exists ✅ / missing ❌` with `file:line`. Never trust the ticket text. This is the check that
   catches the frontend-slice-needs-a-backend-endpoint failure before the build starts. Re-verify
   every `file:line` a ticket already cites, **symbol-first**: find the named thing, then record
   where it now lives. **Small drift is not small harm** — measured on cc#125 (2026-08-10), a
   *three-line* shift moved `:364` onto `systems.forEach((s,i)=>{` and `:381` onto
   `el.className=cls;`, both different facts that read as plausible code. Never assume one offset
   repairs a ticket: that same file drifted +3 in one band and +29 in another. A citation that has
   landed on a *different* fact — or a grant that has since broadened — is exactly what a builder
   trusting the ticket would miss.

6. **Extract the question set.** Every human-only call the work will need: artifact locations,
   platform/targets, cost ceilings, naming, and any **one-way door**. Include questions embedded in
   the repo's *own* instructions ("ask before X") — those count. Write the set down and hand it to
   stage 1.5; **do not ask them here one at a time.** The harvest asks them in one batched round.

6.5. **Write the discovery note.** Steps 5 and 6 land in a discovery note — the triad has no
   room for them and the transcript does not survive the session. **Where it lives follows the
   seat (ruled 2026-08-14):** Delivery-seat work writes it to the *project repo* as
   `docs/quality/<YYYY-MM-DD>-discovery.md`, beside the code it describes; Portfolio-seat and
   harness runs keep the vault home, `notes/reviews/<YYYY-MM-DD>-<repo>-discovery.md` in the
   control-plane repo. (A kit-provisioned repo has no vault — the project-repo path is the only
   one that exists there.) Include the verified baseline, the inventory, the question set, and
   any harness findings the run itself produced.

7. **Report and stop.** Discovery never writes code, never opens a branch, never files a tracker
   item. Emit the Expected Output below and return control to the orchestrator (or the user).

## Guardrails

- **Read-only outside the four artifacts.** The only writes are `CONTEXT.md` + `MAP.md` (in the
  **target** repo), the stack profile, and the discovery note (both in the **control plane**).
  Anything else is the next stage's job. Note the split: two artifacts travel with the code, two
  stay brain-side — a triad half-written into the wrong repo is a silent failure.
- **The repo's own files win.** Where the profile and the repo's instruction files disagree, fix
  the profile — never "correct" the repo to match the profile.
- **Dates are load-bearing.** Every artifact carries `Last refreshed`. A triad that doesn't say when
  it was refreshed can't be trusted, and a stale triad read as current is worse than no triad.
- **Read the code, not the ticket.** Every feasibility row cites `file:line`. "The issue says so" is
  not evidence.
- **Questions are batched, not trickled.** This stage *collects* questions; stage 1.5 asks them.
- **Verified baselines only.** Suite counts, build commands, and coverage figures go in the profile
  only after being run in this session — **and record what you could NOT run, and why.** A profile
  that lists three commands and reports two silently reads as "all green."

## Expected Output

```
DISCOVERY — <repo> @ <YYYY-MM-DD>
TRIAD:        CONTEXT.md <created|refreshed|current> · MAP.md <…> · stack-profile <…>
NOTE:         <the discovery note's path — vault or project repo, per step 6.5>
PROFILED FROM: <the instruction/config files read>
BASELINE:     <commands run + their ACTUAL results> | NOT RUN: <command> (<why>)
FEASIBILITY:  <n> assumptions checked — <n> ✅ / <n> ❌   (each ❌ with file:line + why)
QUESTIONS:    <n> for the decision harvest   (list them; mark one-way doors)
NEXT:         stage 1.5 (decision harvest)  |  re-slice needed: <yes/no>
```

## Anti-Patterns

- **Writing the triad from memory or from the last session's summary.** Read the files.
- **A stack profile that duplicates the repo's instruction file.** It's an index + distillation.
  If a rule isn't checkable, it belongs in the repo's own doc, not here.
- **Marking a slice feasible because the ticket describes the layer.** The ticket is the claim under
  test, not the evidence.
- **Asking questions one at a time as you find them.** That is exactly the trickle the harvest exists
  to replace.
- **Skipping Discovery because the repo "is familiar."** Familiarity is what makes stale triads
  dangerous — check the dates, then decide.

## Learning Notes

_Populate after each run — especially feasibility findings that changed the slicing._

- **Run 1 — command-center, 2026-07-25** (scoped to cc#56/#57; full triad created from nothing).
  Record: [`notes/reviews/2026-07-25-command-center-discovery.md`](../../../notes/reviews/2026-07-25-command-center-discovery.md).
  11 assumptions checked, 10 ✅. Three things the run taught the skill itself, all now folded in
  above: (1) the contract required the inventory + question set to be "written down" but gave them
  no artifact — they lived only in the transcript, hence the new discovery note; (2) the
  target-repo / control-plane split of the four artifacts was implicit and easy to get wrong;
  (3) "run the baseline once" met three suites, one of which (`ng test`) is in no documented script
  and needed `--browsers=ChromeHeadless`, plus a Tauri build that cannot run without a specific
  toolchain env — so *what you could not run* has to be recorded too.
  **Highest-value catch:** re-reading the ticket's own `file:line` citations found a capability
  grant broader than the ticket described (`opener:allow-open-path` covers a second path the issue
  never mentions) and a supporting suite count that was wrong by ~60×. Both were invisible to
  anyone who trusted the issue text — which is the entire argument for this stage.

## Change Log

- 1.1.0 — (2026-07-25) First live run (command-center) fed back: the **discovery note** is now a
  named fourth artifact carrying the feasibility inventory + question set; the target-repo vs.
  control-plane split of the artifacts is stated explicitly; baselines must record what was **not**
  run; step 5 now requires re-verifying `file:line` citations a ticket already makes.
- 1.0.0 — Initial (2026-07-24), AEDL v2 Phase 0: the first contract-carrying stage-skill extracted
  from the lifecycle orchestrator.
