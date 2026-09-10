---
name: aedl-verify
description: Stage 8 of the AEDL lifecycle — the verification pipeline. Run deterministic gates, then review a diff along four independent axes (Standards, Spec, Security, Design) in parallel sub-agents, scale the judge count to the slice's autonomy tier, and return one triaged, ranked findings list. Use for the @aedl -verify command (/aedl-verify), "review this branch", "verify the slice before merge", or as the lifecycle's stage-8 route after a build or delegation.
---

# Verify & Review — AEDL stage 8

The lifecycle's **verification pipeline** — the stage the whole v2 thesis rests on. Code generation
is cheap; the bottleneck is *trust*, and trust is earned by cheap, fast, human-legible verification,
not by reading a diff once and feeling good about it.

> **This is a stage-skill.** It implements AEDL stage 8 behind the
> [stage-skill contract](../../../docs/aedl-v2/stage-skill-contract.md). The orchestrator
> (`agentic-development-lifecycle`) loads it only when stage 8 runs; it is equally valid standalone
> to review a branch, a PR, or work in progress.

> **Provenance.** The two-axis engine (Standards vs Spec in parallel sub-agents, aggregated without
> reranking) and the Fowler smell baseline come from the third-party `code-review` skill in the
> global `~/.claude/skills/` (`mattpocock/skills` @ `ed37663`, 2026-07-25). This skill is authored
> here rather than vendored: it adds the deterministic pre-gate, a **mandatory third Security axis**,
> tier-scaled judging, and the triage step, and it carries the smell baseline **inline** so it has
> **no dependency on the global skill set** — which is what lets the kit ship it to a repo that has
> never heard of Matt Pocock. Re-read `code-review` after each upstream refresh and fold in
> improvements deliberately.

## Contract

```
stage:       8 — Verify + review
requires:    a diff against a resolvable fixed point (the merge-base, a SHA, a branch, a tag); the
             originating spec/ticket (acceptance criteria + non-goals); the target's stack profile
             (its REAL build/test commands + checkable house standards); the slice's autonomy tier;
             and, if stage 7 ran, the worker's report + worklog
does:        run the deterministic gates, then review the diff on four independent axes in
             parallel sub-agents (Standards · Spec · Security · Design), scale the tier's budget
             to ADDED AXES before duplicate judges, **REFUTE every finding before triaging it**
             (step 5 — judges briefed to disprove, defaulting to refuted under uncertainty), and
             triage the survivors into one ranked list with an owner; the four core axes are a
             FLOOR — a run may declare additional feature-specific axes, never remove a core
             axis, and Security is never optional
done-when:   deterministic gates PASS (or their failure is the report) AND all core axes AND
             every declared added axis returned AND **every finding has been through refutation
             and survived by its tier's rule — or is recorded as rejected with the refutation
             that killed it**
             AND every finding is triaged to exactly one of {fix-now, fix-next (filed), accept
             (with the reason), reject (with the evidence)} AND the diff was read — the worker's
             report alone is NEVER the evidence
produces:    a verification verdict + one ranked, triaged findings list (→ stage 9 decision memo);
             any fix-next tickets filed; the refactor list from stage 5–6 dispositioned
autonomy:    green — read-only. This stage NEVER fixes what it finds; fixing is a new build slice
             or a delegated fix pass under its own grant. Delegable at T4.
challenges:  "the suite is green, ship it" — green is the ENTRY condition to this stage, not its
             verdict. A gutted feature passes a green suite;
             "the worker reported all criteria met" — read the diff. The report is the claim under
             test, not the evidence. This is the single most expensive lesson the harness has
             learned (see Anti-Patterns);
             "it's a trivial slice, skip the security axis" — the security axis is NOT optional at
             any tier. Triviality is a claim about blast radius, and blast radius is exactly what
             the axis exists to check;
             "I'll just fix that while I'm here" — fixing inside the review stage destroys the
             independence the parallel axes bought, and leaves the fix itself unreviewed;
             "there's no UI in this diff, skip Design" — the Design axis still runs and returns
             "no design surface in this diff" (the term is defined once, in DESIGN-TEAM.md §6.1:
             what the diff RENDERS, never what records the repo keeps). That return is the
             finding, exactly as the Spec axis's "no spec available" is. A skipped axis and an
             axis that found nothing are different facts, and only one of them is evidence;
             "there's a red-then-green test, the fix is proven" — only if the test can tell the fix
             from the bug. Where the code retries, refreshes, or self-heals, both states produce the
             same observable and the assertion measures nothing (see Guardrails);
             "the finding cites a file:line, so it is real" — the most expensive wrong belief this
             stage has held. A judge's exact file:line refs once supported a false conclusion and
             the wrong correction shipped. Measured across three passes: ~80 findings raised, ~50
             survived refutation, so about a THIRD of what would have shipped as corrections was
             wrong — and a wrong finding does not fail safe, it edits working code. Step 5 exists
             because a citation is a claim under test, not evidence;
             "all four axes came back clean, so the diff is clean" — refutation raises PRECISION,
             not recall. A clean run has had nothing refuted AND nothing confirmed; it is the
             weakest evidence this stage produces, not the strongest
mirror:      the verdict + findings list are plain markdown; the deterministic gates are the repo's
             own commands. Another editor-AI runs the same commands and reads the same diff — only
             the parallel-sub-agent mechanism is Claude-specific, and it degrades to three
             sequential passes with cleared context, which any host can do.
```

## When To Use

- `@aedl -verify [<fixed-point>] [<spec-ref>]` / `/aedl-verify` — review a branch, a PR, or working
  changes against a fixed point.
- Automatically, as the lifecycle's stage-8 route after stage 5–6 (build) or stage 7 (delegation).
- Before requesting merge authorization, always. **Stage 8 is never skipped**, at any tier.

Do **not** use for: reviewing someone else's PR on a code host (`@aedl -review-cycle <PR#>` drives
that loop), or as a substitute for the build's own tests.

## Standard Process

### 1. Pin the fixed point and confirm there is something to review

Whatever the user or the orchestrator supplies — a SHA, branch, tag, `main`, `HEAD~5`. In a
lifecycle run it is the merge-base of the work branch. If none was given, ask.

```bash
git rev-parse <fixed-point>                      # must resolve
git diff <fixed-point>...HEAD --stat             # three-dot: against the merge-base
git log <fixed-point>..HEAD --oneline
```

**Fail here, loudly**, on a bad ref or an empty diff — not inside four parallel sub-agents that
each burn a context window discovering it.

### 2. Deterministic gates FIRST

Run the target's real commands from its stack profile (`docs/stack-profiles/<repo>.md`) — build,
typecheck, lint, the test suite. Never invent an invocation; never report a number you did not
observe.

**These are gates, not axes.** If they fail, that failure *is* the report: stop, hand it back, and
do not spend three sub-agents reviewing code that does not compile. Record what you could not run
and why (a toolchain the machine lacks is a finding about the pipeline, not a pass).

Cheap and deterministic before expensive and probabilistic — this ordering is the whole reason the
pipeline is a pipeline.

### 3. Assemble the axis inputs

- **Standards** — every file in the target that documents how code should be written, plus the
  stack profile's *checkable house standards* table, plus the [smell baseline](#smell-baseline).
- **Spec** — the originating ticket/spec: acceptance criteria **and non-goals**. Resolve issue
  references in the commit messages through the issue-tracker adapter. If there genuinely is no
  spec, the Spec axis reports "no spec available" — and *that* is itself a finding.
- **Security** — the target's threat model (its `CONTEXT.md`), its capability/permission surface,
  and the [security checklist](#security-checklist).
- **Design** — the repo's own design records (`docs/design/`, token files, `CONTEXT.md`) first,
  then the design book's **floor**
  ([`docs/DESIGN-TEAM.md`](../../../docs/DESIGN-TEAM.md) §6: accessibility · palette/token law ·
  the three laws' bans and numbers · art reproducibility). Precedence is the book's own ladder —
  the repo's records win for that repo; the floor is the only set the book pre-wins, because
  Matter ruled those items in advance.
  **What counts as design surface is defined once, in
  [`DESIGN-TEAM.md`](../../../docs/DESIGN-TEAM.md) §6.1** — read it before deciding the axis does
  not apply. It is a property of what the diff **renders**, never of what records the repo keeps,
  so `docs/design/` being present is *not* surface: a design record is the **Spec** axis's
  business, and §5 forbids moving a misfiled finding afterwards. A diff touching only build
  tooling, CI, scripts and docs has none — the axis returns "no design surface in this diff" and
  that is its finding.

### 4. Spawn the axes in parallel — count scaled to the tier

Send **one message** with the Agent tool calls so they run concurrently. Independent context per
axis is the point: it is what stops one axis from rationalizing another's blind spot, and it is the
harness's answer to the standing **self-review bias** finding (the same model building and reviewing
its own work).

| Autonomy tier | Judges | **Added axes** | **Refuters** | Shape |
|---|---|---|---|---|
| **green** | 4 | 0 — the four core axes | **1 pass, batched** | single judge per axis |
| **amber** | 6 | **≥1 declared** — spend the first extra judge on a NEW QUESTION before a second judge on an old one | **1 per finding** | Standards ×1, Spec ×1, **Security ×3 — three DIFFERENT questions** (independent, then majority), Design ×1 |
| **red** | 10 | **≥2 declared** | **3 per finding, majority** | **×3 per axis, each carrying a different question**, majority within each axis; **Design stays ×1**; any 3–0 security finding is a hard stop |

> **Spend the dial on AXES before JUDGES — the skill's own evidence says so, and this table used to
> say the opposite (mn#13).** Every headline catch on record came from **one judge holding a
> distinct assignment**, never from a majority: cc#68's two duplicate-shaped security judges both
> returned clean while the odd-question judge found both real defects, and cc#57's two headline
> catches were each a single judge's, neither a majority finding. Adding a **question nobody
> asked** buys more than adding a reader of a question already asked. So at amber and red the
> added-axes column is a **floor, not a suggestion**: if you are about to add a fourth judge to an
> axis that already has three, add an axis instead.
>
> **The worked example is the mutation axis** — *"do the new tests go red when the production
> change is reverted?"* It enters at **amber**. It fits none of the four core axes, and it has the
> most confirmations of any candidate: four Sage tests named for defects they could not detect
> (2026-08-01), cc#93's guard tests staying green with the entire fix reverted, and cc#25.
>
> **Cost, per tier, stated so the dial is an informed choice (AC5).** An unpriced quality step is
> the first thing dropped under time pressure — which is exactly how P1.1 came to be marked ✅ with
> a clause missing. Roughly one full judge context each:
> - **green** — 4 axis judges + **1 batched refutation pass** ≈ 5 contexts.
> - **amber** — 6 axis judges + ≥1 added axis + **1 refuter per surviving finding** ≈ 7 + F.
> - **red** — 10 axis judges + ≥2 added axes + **3 refuters per finding** ≈ 12 + 3F.
>
> F is findings, not files, and F is usually small — but on a noisy first pass it is not, so at red
> **refute the fix-now candidates first and stop when the budget is out**, recording how many
> findings went un-refuted rather than quietly reporting them all as equal. Three workflows measured
> at ~7.8M sub-agent tokens is the standing warning that not every lane earns every axis.

> **Design never multiplies — and that is a rule about what the axis IS, not a budget cut.** Its
> blocking set is a **closed enumeration** — numbered floor items, every one either measurable
> or a named ban. There are no unasked questions to add, so a second Design judge reads the same
> list and returns the same answer — precisely the "duplicate judges converge on the obvious"
> failure this section exists to prevent. The interpretive half of design doctrine ("settles heavy",
> "warm, never grim") is **non-blocking by charter**, so extra judges on it cannot change a gate.
> Scale Design by growing the floor — which takes Matter's y/n (`DESIGN-TEAM.md` §9) — never by
> adding judges.

> **×3 means three distinct assignments, never three copies of one brief.** Scale a tier by adding
> **unasked questions**, not duplicate judges. Give each judge on a multiplied axis its own angle —
> e.g. for Security: *what new capability does this grant?* · *what reaches a sink unvalidated?* ·
> *can this surface still lie to the user?* Measured twice, in two repos:
> - **cc#68 (amber, 2026-07-30):** the two duplicate-shaped security judges both returned clean;
>   the odd-question judge ("can the row still lie") found **both** real defects and named the next
>   surface to look at.
> - **cc#57 (red, 2026-07-27):** both headline catches came from a **single** judge holding a
>   distinct adversarial assignment — neither was a majority finding. Duplicate judges converge on
>   the obvious; a different question is what reaches the rest.
>
> This does not lower any tier's judge count. It says what the extra judges are *for*.

> **Added axes — the floor, not the set (ruled 2026-08-14, Delivery-Team audit item 3; the floor
> grew to four on 2026-08-15).** The verifier (the QA seat in a Delivery-Team run) may declare
> **extra axes per feature** at spawn time. Each added axis is one more parallel judge with its own
> brief and its own `##` header in the report, and must ask a question **none of the four core axes
> asks** — never a duplicate judge. The four core axes are a floor: never removed, and Security
> never optional at any tier.
>
> **Design joined the floor 2026-08-15** (`DESIGN-TEAM.md` §12 item 4, Matter's ruling). It is a
> *core* axis, not a permitted addition — a run cannot choose to omit it. Its judge is the
> **Design Reviewer brief**, which lives under the *delegation* skill, not this one —
> [`subagent-delegation-workflow/references/roles/design-reviewer.md`](../subagent-delegation-workflow/references/roles/design-reviewer.md).
> It runs T4 read-only, and its findings triage like any other: a **floor** item is a Blocker
> (`DELIVERY-TEAM.md` §7), everything below the floor files as `debt`.
> Worked example — the **mutation axis**: *"would the new tests pass against the pre-fix code?"*
> Precedent: the 2026-08-01 four-axis Sage pass (`notes/journals/2026-08-01.md`, four hollow
> tests caught) and cc#93's guard tests staying green with the fix reverted. Cost, stated
> plainly: one full judge context per added axis — declare the axis and its question in the
> run record. Aggregation is unchanged: **never rerank across axes.**

Run mechanical axes on a cheap model (Haiku/Fable); keep **Security on the strongest model** at
amber and red. Cap every axis report at ~400 words and demand `file:line` — a review that cannot
point at a line is an opinion.

**Standards brief:** "Report, per file/hunk: (a) every place the diff violates a documented standard
— cite the standard's file and rule; (b) any baseline smell — name it and quote the hunk; (c) the
**claims audit** below, which is not optional. Distinguish hard violations from judgement calls:
documented breaches can be hard, baseline smells are always judgement calls, and a documented repo
standard **overrides** the baseline. Skip anything tooling already enforces. Under 400 words."

**Claims audit — a STANDING clause of the Standards brief, on every run, at every tier.** Append
verbatim:

> "Treat every factual assertion the change makes *about itself* as a claim under test — the commit
> message(s), the **PR title and body**, docblocks, and inline comments. Verify each against its
> cited source and report **VERIFIED / REFUTED / UNVERIFIABLE**, each with the `file:line` you
> checked. Prose that misdescribes the code is a **defect**, not untidiness: in a repo with no linter
> and no CI it is the only enforcement surface there is. On a **squash-merging** repo the PR title
> and body *become* the commit on the default branch, so they are part of the artefact under review,
> not packaging around it."

It costs **zero extra judges** — it is an added question for the Standards judge that already runs.
Three independent confirmations before promotion (see Learning Notes): cc#57, Sage, cc#68.

**Spec brief:** "Report: (a) acceptance criteria that are missing or partial; (b) behaviour in the
diff nobody asked for — check it against the ticket's **non-goals** explicitly; (c) criteria that
look implemented but where the implementation looks wrong. Quote the spec line for each finding.
Under 400 words."

**Security brief:** "Assume the diff is hostile input written by someone who read the ticket and not
the threat model. Report: (a) new or widened trust boundaries, capabilities, permissions, or
grants — quote the grant; (b) inputs that reach a sink (exec, filesystem, SQL, network, deserializer)
without validation, tracing the path in `file:line` hops; (c) secrets, tokens, or credentials in the
diff or in anything it logs; (d) dependencies added or bumped — flag any under 14 days old; (e) any
mitigation that lives on the client/renderer side, which is not a mitigation. Under 400 words."

**Declare the terminating bar BEFORE the round runs — mandatory from round 3 on.** A verify loop
that decides to stop *after* reading a round's findings is rationalising, not deciding. From round 3
onward, name the round as final **in advance** and put an explicit blocker bar in every axis brief:

> "This is the final round. Report a **blocker** only for something that would harm a user or ship a
> false record — a crash, a hang, data loss, a broken feature, or an untrue statement. Everything
> else is a note. **Do not invent a finding to justify the round.**"

Without a stated bar a long loop drifts into reporting **taste as defects** — reviewers asked to find
something generally will. Evidence: Sage's restore-place slice ran five rounds because each kept
finding real things; round 5 was declared final in advance with this bar and returned substance-clear
with two true findings (2026-07-28).

### 5. Refute — every finding is a claim under test, before it is triaged

**The measurement this step exists for.** Across three passes in the 2026-08-01/02 arc, ~80 findings
were raised and **~50 survived** refutation. Roughly **a third of what would have shipped as
corrections was wrong** — and a wrong finding does not fail safe: it ships as a "correction" to
working code, carrying a confident `file:line` with it. The standing lesson is exactly this shape —
*a judge's exact `file:line` refs once supported a false conclusion, and the wrong correction
shipped.*

This is **not** the [claims audit](#claims-audit). That one refutes the **diff's own prose** —
commit message, PR body, docblocks — against the code. This one refutes **the axes' output**. Both
run; neither substitutes for the other.

Spawn refuters per the tier table's Refuters column, in **one message**, with independent context.
A refuter must **never** be the judge that raised the finding.

**Refuter brief — verbatim, on every run, at every tier:**

> "Here is one finding from a code review: `<finding, with its file:line and its claim>`.
>
> **Your job is to DISPROVE it.** You are not a second opinion and you are not grading the
> reviewer — you are looking for the reason it is wrong.
>
> 1. **Open the source it cites, at the line it cites.** A citation that does not say what the
>    finding claims is itself a refutation, and it is the most common one. Quote what is actually
>    there.
>    **But a stale line number is a clerical error, not a refutation.** If the cited line does not
>    hold the construct and the construct is plainly there a few lines away in the same file, say
>    so, judge the **claim**, and do not refute on the offset. Refute on the citation only when the
>    construct is genuinely absent, or when the line the finding actually needs says something that
>    contradicts it. Line numbers drift the moment anyone edits above them.
> 2. Check whether the condition it describes can actually occur — is the branch reachable, is the
>    input constrained upstream, is the value already validated, does a type make it impossible?
> 3. Check whether it is already handled somewhere the reviewer did not look.
> 4. Check whether it describes the code **as it was before this diff** — a finding about
>    pre-existing behaviour is not a finding about this change.
>
> Return `REFUTED` or `STANDS`, one short reason, and the `file:line` you actually read.
>
> **Default to REFUTED if you are uncertain.** A finding that cannot be demonstrated is not a
> finding. Saying 'STANDS' because you could not think of an objection is the failure this step
> exists to prevent — say REFUTED and name what you could not check."

**The survival rule.**

| Tier | Refuters | A finding SURVIVES when |
|---|---|---|
| **green** | 1, batched | that refuter returns `STANDS` |
| **amber** | 1 per finding | that refuter returns `STANDS` |
| **red** | 3 per finding | **≥2 of 3** return `STANDS` — a 1–2 split is refuted, and a 3–0 `STANDS` on a security finding remains a hard stop |

A refuted finding is **dropped, with its refutation recorded** — it goes into the report as
`rejected` with the evidence (step 6's fourth disposition already has that slot, and this is what
fills it honestly). Recording it is not bookkeeping: the refutations are how the axes get better,
and a run that reports only survivors hides its own precision.

**Do not refute the refutations.** One adversarial layer is the design; a second turns into an
argument nobody arbitrates. Where a refutation is itself doubtful, that is a **fix-now finding
about the run**, not another round.

> **The known gap in this step, stated rather than hidden.** Refutation is asymmetric: it tests the
> findings that were raised and says nothing about the ones nobody raised. It raises precision, not
> recall. A run whose axes all returned clean has had **nothing refuted and nothing confirmed** —
> and a refutation pass that kills a third of the findings can read as "the review was noisy" when
> it may equally mean the axes were guessing. Watch the survival *rate* across runs: a rate that
> collapses is a finding about the briefs, not about the code.

### 6. Aggregate — then triage

Present the axes under `## Standards`, `## Spec`, `## Security`, `## Design` — **all four core
axes, each under its own header, even when one found nothing.** A skipped axis and an axis that
returned clean are different facts (see step 3), and this report is the only place that difference
is visible: `## Design` carrying `no design surface in this diff` is the axis reporting, and an
absent `## Design` is the axis never having run — and "design surface" is `DESIGN-TEAM.md`
§6.1, not the judge's own reading. Added axes follow, each under its own header too.
**Do not merge or rerank across axes** — the separation is the mechanism. A change can follow every
standard while implementing the wrong thing, or match the spec exactly while opening a hole.

Then do the part upstream's engine stops short of: **triage**. Every finding gets exactly one
disposition, and a finding with no disposition means the stage is not done:

| Disposition | Means | Obligation |
|---|---|---|
| **fix-now** | blocks this slice | goes back to stage 5–6 or a delegated fix pass — **never fixed here** |
| **fix-next** | real, not blocking | **file the ticket now**, cite it in the verdict. An unfiled fix-next is an accept wearing a disguise |
| **accept** | deliberate, with a reason | the reason goes in the record, not just in the chat |
| **reject** | the axis was wrong | say what evidence refutes it — this is how the axes get better |

Also disposition the **refactor list** stage 5–6 handed over (the refreshed `tdd` moves refactoring
out of the red→green loop into this stage). Same four buckets.

### 7. Verdict, then stop

Emit the Expected Output and return control. This stage **never fixes, never commits, never merges,
never requests merge authorization** — stage 9 writes the memo and the human authorizes the merge.

## Guardrails

- **Read the diff.** Every finding cites `file:line` in the actual diff. A worker's report, a ticket
  body, and a commit message are all claims under test.
- **Read-only, always.** The only writes are the verdict/findings record and any fix-next tickets.
  Fixing inside this stage voids the independence the parallel axes bought.
- **The security axis runs at every tier**, including green, including "trivial."
- **Deterministic before probabilistic.** Never spawn axes over code that fails its own build.
- **Verified numbers only.** Report the command you ran and its actual output. "Tests pass" without
  a count and a command is not evidence.
- **Never rerank across axes.** One-line summary per axis; no single cross-axis "worst issue."
- **Hold the corrective pass open.** When a repair produces the *same observable* as the bug —
  anything retried, refreshed, polled, or self-healing — an end-state assertion cannot distinguish
  "preserved" from "destroyed and instantly recreated." Ask of every test defending such a fix:
  **does it block the corrective path, or only the failure path?** If the corrective pass is allowed
  to run before the assertion, the test measures nothing. Evidence: cc#68's first `skeletonError`
  test passed **identically with and without** the gate it was written to defend — the trailing pass
  re-raised the same error message in the same tick, so the two states were indistinguishable. Fixed
  by deferring the trailing pass's git call as well as the HANDOFF read (2026-07-30).
- **Verify the mutation applied before believing the run.** A mutation control tells you a test
  *binds* — but only if the mutation actually landed. **A clean mutation report is a claim about your
  tooling before it is a claim about your tests**: confirm each mutation reached the file (diff it,
  or assert the edit) before reading "0 kills" as evidence of anything. Evidence: a mutation loop
  reported **zero kills across four guards** because its regexes had silently failed to match, and a
  `git checkout` inside the same helper reverted the implementation mid-run (2026-08-01). Take a
  backup before the first mutation and restore from it, never from version control.

## Smell baseline

Applies even when a repo documents nothing. **The repo overrides** — where a documented standard
endorses something here, suppress it. Every entry is a labelled heuristic ("possible Feature Envy"),
never a hard violation. Skip anything tooling already enforces.

- **Mysterious Name** — a name that doesn't reveal what it does or holds. → rename; if no honest name comes, the design is murky.
- **Duplicated Code** — the same logic shape in more than one hunk or file. → extract, call from both.
- **Feature Envy** — a method reaching into another object's data more than its own. → move it onto the data it envies.
- **Data Clumps** — the same few fields/params always travelling together. → bundle into one type.
- **Primitive Obsession** — a primitive standing in for a domain concept. → give the concept its own small type.
- **Repeated Switches** — the same switch/if-cascade on the same type recurring. → polymorphism, or one shared map.
- **Shotgun Surgery** — one logical change forcing scattered edits across many files. → gather what changes together.
- **Divergent Change** — one module edited for several unrelated reasons. → split so each changes for one reason.
- **Speculative Generality** — abstraction or hooks for needs the spec doesn't have. → delete; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation. → hide the walk behind one method.
- **Middle Man** — a class or function that mostly just delegates. → cut it, call the target direct.
- **Refused Bequest** — a subclass ignoring most of what it inherits. → composition instead.

## Security checklist

The floor, not the ceiling — the target's own `CONTEXT.md` threat model always adds to it.

- **Trust boundaries**: did the diff move, widen, or add one? Quote the grant/permission/capability.
- **Input → sink**: any path from caller-controlled input to exec, filesystem, SQL, network, or a
  deserializer without validation. Trace it in `file:line` hops.
- **Client-side mitigations**: a check that lives in the layer an attacker owns is not a boundary.
  If a fix can be stated as "the UI validates it first," it is not done.
- **Secrets**: tokens, keys, or credentials in the diff, in fixtures, or in anything it logs.
- **Dependencies**: anything added or bumped — flag any release under 14 days old.
- **Control-plane touch**: does the diff reach `.claude/hooks/`, settings, grants, or lock
  machinery? That is red tier and brain-only regardless of what the ticket said.

## Expected Output

```
VERIFY — <slice/branch> @ <YYYY-MM-DD>   vs <fixed-point>
GATES:       <command> → <actual result>  ×N   | NOT RUN: <command> (<why>)
TIER:        <green|amber|red> → <n> judges
AXES:        Standards <n> · Spec <n> · Security <n> · Design <n | no design surface> [· <added-axis> <n> …]
REFUTED:     <n> raised → <n> survived (<n> refuted, <n> un-refuted: budget) · rule: <tier rule>
TRIAGE:      <n> fix-now · <n> fix-next (#ids filed) · <n> accept · <n> reject
REFACTORS:   <n> from stage 5–6 dispositioned
VERDICT:     <clear to proceed | blocked: <the fix-now list>>
NEXT:        stage 9 (decision memo) | back to stage 5–6 for the fix-now items
```

`Design no design surface` is a verdict against [`DESIGN-TEAM.md`](../../../docs/DESIGN-TEAM.md) §6.1's enumeration, never a judgement call — say which clause of it applied.

## Anti-Patterns

- **Trusting the worker's report.** A green suite on a gutted feature is exactly what a stub looks
  like from the outside. The harness learned this from a C3 delegation that reported success on an
  implementation it had stubbed — caught only by reading the diff.
- **Fixing what you find, in this stage.** The fix then ships unreviewed, by the reviewer.
- **Skipping the security axis on a "trivial" slice.** Every capability widening in this workspace's
  history looked trivial in the ticket.
- **Reranking the axes into one list.** That is the masking the separation exists to prevent.
- **A fix-next with no ticket.** It is an accept, and it will be forgotten by the next session.
- **Running the axes before the build is green.** Three context windows spent reviewing code that
  does not compile.

## Learning Notes

_Populate after each run — especially: which axis caught the finding that mattered, and whether the
tier's judge count was too many or too few._

- ~~**Open (2026-07-25):** the tier→judge table is a first estimate, not evidence.~~
  **ANSWERED 2026-07-26 by the first live run** (command-center #62, four rounds — records:
  [`notes/reviews/2026-07-26-cc62-verify.md`](../../../notes/reviews/2026-07-26-cc62-verify.md)
  and rounds [2](../../../notes/reviews/2026-07-26-cc62-verify-round2.md) ·
  [3](../../../notes/reviews/2026-07-26-cc62-verify-round3.md) ·
  [4](../../../notes/reviews/2026-07-26-cc62-verify-round4.md)).

  **Keep the table as written.** The evidence:
  - **amber Security ×3 — keep.** The panel split on **four separate findings** across rounds 1–2:
    traversal severity 2–1 (MED/MED/LOW), the provenance-lie found by 2 of 3, and two unanimous.
    A single security judge would have missed round 2's switcher race outright — and on brain
    re-verification that finding was *worse* than any individual judge described (a three-way
    divergence, not two-way).
  - **green ×1 per axis — sufficient, and dropping to it is not a weakening.** Rounds 3 and 4 ran at
    green on a ~49-line delta and produced the sharpest findings of the run. In round 3 all three
    axes converged on the same verdict from three different directions (Standards traced the binding
    chain into the SCSS, Spec caught the commit message and test title overclaiming, Security traced
    the live click path to the sink). **Convergence at one-judge-per-axis needs no majority vote** —
    it is a stronger signal than a 2–1 split, at 40% of the cost.
  - **Tier the round, not the slice.** The run started amber and dropped to green when the remaining
    work was ten lines. Holding amber there would have bought two extra judges and found nothing.

- **The mandatory Security axis, justified concretely (same run).** Round 1's `.catch(() => null)`
  finding — a capability-scope denial rendering identically to a missing file — was found by **all
  three security judges and by neither Standards nor Spec.** It needed that lens specifically. This
  is the argument for "never optional at any tier," made with a real finding instead of a principle.

- **Green is the ENTRY condition, never the verdict — demonstrated four times.** Every one of the
  four rounds entered with a 100% green suite (722 → 749 tests) and every round found something real.
  Round 1's diff had a worker report of `OUTCOME: success` with `COVERAGE: clean`.

- **A test written by the pass that writes the fix pins whatever the fix DOES, not what the finding
  ASKED FOR.** Round 3's headline: a worker "closed" a race by setting a flag that only pulses a 6px
  dot (the component's own doc comment says so), wrote a comment asserting the race was guarded, and
  wrote a red-then-green test asserting only that the flag flipped. Schema-conformant, gates green,
  entirely hollow. **Red-green evidence is necessary and not sufficient.**
  → **Candidate rule for the Standards brief:** when a finding describes *user-visible behaviour*,
  the fix's test must assert at the layer the finding named (DOM, not signal). Add after one more
  run's evidence.

- **Verify the axes too.** Two round-1 findings were re-checked by the brain against the code before
  triage; one turned out understated. An axis report is a claim under test on the same terms as a
  worker report — the difference is that rejecting one requires evidence, which is what makes the
  axes improve.
- **Deferred from WS-A, deliberately:** mutation testing (the adoption plan already defers it) and
  an automated supply-chain screen. The <14-day dependency check is currently a human-read
  instruction in the Security brief, not a tool. Both are Phase 1 candidates, and calling them
  "shipped" here would be exactly the kind of unverified claim this stage exists to catch.

- **The claims audit, promoted proposal → standing clause (maintenance pass 2, 2026-08-02).** It ran
  as an ad-hoc sub-brief in three independent runs before being written into the Standards brief
  above, and the promotion bar was deliberately "three confirmations in three repos, one of which
  tests the *fix* rather than the need for it":
  1. **cc#57, rounds 1–2 (2026-07-27)** — it caught the biggest error in *both* rounds. Round 2's
     judge refuted the case-sensitivity claim (`glob::MatchOptions` **derives** `Default`, so
     `case_sensitive` is false); round 1's refuted the run's own discovery premise.
  2. **Sage, rounds 3–5 (2026-07-28)** — **seven** findings across five rounds were prose asserting
     what the code did not do, and **three of those were introduced by the commit fixing the
     previous one**. The last is self-referential: a commit titled *"make the comments true"*
     corrected a statement that had been true. This run is why the clause names **docblocks and
     inline comments**, not just commit messages — that is where all seven landed.
  3. **cc#68 (2026-07-30)** — the first run of the *proposed clause itself*. Eight claims from the
     commit message: **7 VERIFIED, 1 REFUTED**, and the refutation was the run's sharpest finding —
     a comment asserting the git panel "had no indicator at all", contradicted by the same diff's
     own docblock. Cost: zero extra judges.

  Two independent runs reaching the same design within two days is the strongest signal this harness
  gets. **What is still unproven:** all three confirmations were **ad-hoc sub-briefs a session chose
  to add**, so nobody has yet watched the clause behave once it is mandatory and unremarkable —
  whether it keeps finding things when nobody is curious about it is the open question. It has also
  never been measured against a repo that *does* have a linter and CI, where prose carries less of
  the enforcement load. (Tier coverage is fine: cc#57 ran red, cc#68 amber.)

- **worldloom A1 / PR #26 (amber, 2026-08-13) — first run in a repo outside this workspace's own
  history, and the first with a real supply chain.** Records:
  [PR #26 verify comment](https://github.com/matterjd/worldloom/pull/26). Three things it settled:

  **1. Axis diversity, third confirmation — and the strongest yet.** Security ×3 ran
  *what does this GRANT* · *what reaches a sink unvalidated* · **"can any of this still LIE?"** The
  odd question produced **both** headline findings, and neither was a majority verdict: a drift gate
  whose TS leg judges the worktree rather than the index, and a `--self-test` that passes with that
  leg replaced by `abort`. The two conventional security judges found real but non-blocking material
  (token persistence, cache scope, two unscreened <14-day transitive crates). **On a slice whose
  entire deliverable is guards, "which guard is lying?" is the assignment that pays.**

  **2. New clause candidate — VERIFY THE CONFIRMATIONS, not only the refutations.** The skill already
  says an axis report is a claim under test, aimed at false positives. This run found the other
  direction. Both "CONFIRMED, reproduced" findings were re-run by the brain in a **scratch clone**;
  both held, one was *worse* than reported — and the re-run surfaced what **no judge had noticed**:
  CI's regenerate-and-`git diff --exit-code` is independent of the gate and sound, so drift cannot
  reach `main`. **That moved the verdict from possibly-blocked to clear-to-proceed.** Generalisation
  worth promoting after one more run: *a finding carries two claims — "this is broken" and, tacitly,
  "this matters this much". Axes are reliable on the first and structurally blind on the second,
  because each is scoped to one question and cannot see what else already covers the gap. **Blast
  radius is the aggregator's job and belongs in the triage step explicitly.***

  **3. Reproduce in a clone, never in the tree.** Both reproductions required mutating a gate script
  and staging drift. Done in a throwaway `git clone --no-hardlinks`, verified removed, with the source
  repo confirmed clean at the same SHA afterwards — the §8c-2 mitigation (never co-locate a mutator
  with a reader) applied to stage 8 itself. One mutation was checked for having *applied* (byte-count
  + diff) before its result was believed, per the existing guardrail; the first attempt at an earlier
  mutation in this same session had **silently no-opped on CRLF** and produced a meaningless pass.

  **Tier note: amber was right and the count was not the binding constraint — the assignments were.**
  Five judges on a 42-file, +4297-line diff; the two that mattered were distinguished by their
  question, not by their number.

## Change Log

- 1.2.0 — **The refutation pass, and the dial spends on axes before judges (2026-08-18,
  [mn#13](https://github.com/matterjd/matter-notes/issues/13)).** Closes the fifth clause of
  roadmap P1.1, which had been marked ✅ for nine days with the clause missing — four of five
  shipped 2026-07-25 and a single tick hid the gap.
  **New step 5, "Refute"**, between the axis spawn and triage: judges briefed to **disprove** each
  finding, **defaulting to REFUTED under uncertainty**, with the brief quoted verbatim the way the
  claims audit is. It is a different mechanism from the claims audit — that one refutes the diff's
  own prose, this one refutes the axes' output; both run. The survival rule is per-tier (green/amber
  1 refuter, red 3 with ≥2 STANDS), and a refuted finding is **recorded as rejected with its
  refutation**, never silently dropped. Rationale, measured: across three passes in the
  2026-08-01/02 arc ~80 findings were raised and ~50 survived, so about a third of what would have
  shipped as corrections was wrong.
  **The tier table gained `Added axes` and `Refuters` columns.** The dial used to buy only more
  judges inside a fixed axis set, while the skill's own evidence says the opposite: every headline
  catch on record came from ONE judge holding a distinct assignment, never from a majority (cc#68,
  cc#57). Added axes are now a floor at amber (≥1) and red (≥2) — *if you are about to add a fourth
  judge to an axis that already has three, add an axis instead* — with the **mutation axis** as the
  worked example, entering at amber. **Cost is stated per tier**, because an unpriced quality step
  is the first thing dropped under time pressure, which is how P1.1 came to be ticked incomplete.
  The `does:`/`done-when:` contract and the `REFUTED:` line of the Expected Output carry it, so a
  run that skips refutation cannot report itself as done.
  **Stated limit:** refutation raises precision, not recall — it says nothing about findings nobody
  raised, and a run where every axis returned clean has had nothing refuted and nothing confirmed.
- 1.1.0 — **Maintenance pass 2 (2026-08-02).** Five evidence-backed doctrine clauses, all promoted
  from live stage-8 runs 2026-07-27 → 08-01 rather than invented: the **claims audit** as a standing
  clause of the Standards brief (3 confirmations, 3 repos); **"×3 means three different questions"**
  in the tier table (2 confirmations); **hold the corrective pass open**; **verify the mutation
  applied before believing the run**; and a **declared terminating bar** required from round 3 on.
  No tier's judge count changed. Log:
  [`docs/maintenance/maintenance-log-2.md`](../../../docs/maintenance/maintenance-log-2.md).
- 1.0.0 — Initial (2026-07-25), AEDL v2 **Phase 1**: stage 8 extracted to a contract-carrying
  stage-skill, built on the two-axis parallel engine from upstream `code-review` plus a
  deterministic pre-gate, a mandatory Security axis, tier-scaled judges, and triage. Self-contained
  — no dependency on the global skill set — so the kit can ship it.
