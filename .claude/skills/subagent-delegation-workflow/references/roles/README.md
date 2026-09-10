# Role Briefs — how a brief is consumed

One file per Delivery Team role (charter: `docs/DELIVERY-TEAM.md` §4). A brief makes
"spawn the QA" one move instead of a hand-written prompt: the delegation skill
(`--role <name>`, Step 1) loads `roles/<name>.md` and takes its frontmatter as
DEFAULTS — `default_tier`, `model_routing`, and the work-branch slug. The caller may
still narrow the tier.

## A brief PRE-FILLS. It never PRE-AUTHORIZES.

A brief supplies grant *copy*: a tier default, a branch slug, an objective template,
standing constraints. Authorization stays per-delegation: `scope_confirmed` and the
sign-off (`authorized_by`, `date`) are **blank in every brief** and get filled only
when a specific grant is minted and signed (`SUBAGENT-AUTHORIZATION.md` §5 — an
unsigned sheet grants nothing). A brief is a ceiling *suggestion*; the granted tier is
the ceiling, and a ceiling is never widened mid-task.

## Green work needs no grant — and a brief must not force one

The two halves of a brief apply differently:

- **Mission, standing constraints, and report-schema additions apply on EVERY
  delegation of the role** — green or amber, grant or no grant.
- **`default_tier` applies only when a grant is actually minted.** The lifecycle's
  green autonomy path (`agentic-development-lifecycle`, "Autonomy tiers") delegates
  host-native with **no lock/grant machinery at all**. A brief must not force amber
  machinery onto green work: on a green slice, spawn host-native carrying the brief's
  mission, constraints, and report lines, and skip the grant. `default_tier` waits
  for the first amber/red spawn.

## Roles run sequentially in one repo — by mechanism, not by preference

The lock system enforces **single grant per work repo** (`SUBAGENT-AUTHORIZATION.md`
§3, concurrency note). Two granted roles can therefore never run at once in the same
project repo: the Senior's lock must release before the QA's can activate. Team roles
in one repo are mechanically sequential — which matches the SDLC gate order anyway
(build → verify → document). Concurrency across *different* work repos stays allowed,
exactly as before.

## The files

**Delivery Team** (`docs/DELIVERY-TEAM.md` §4):

| Brief | Default tier | Routing |
| --- | --- | --- |
| `senior-engineer.md` | T3 | behavioural |
| `qa-engineer.md` | T3 | behavioural |
| `principal-engineer.md` | T4 | behavioural |
| `architect.md` | T4 | behavioural |
| `technical-writer.md` | T3 | mechanical |

**Design Team** (`docs/DESIGN-TEAM.md` §4, approved 2026-08-15):

| Brief | Default tier | Routing |
| --- | --- | --- |
| `prototyper.md` | T3 | **fable** — the one named exception (see below) |
| `art-director.md` | T3 | behavioural |
| `design-reviewer.md` | T4 | behavioural |

No role defaults to T2 or T1. Push (T2) and PRs (T1) are separate, human-named
escalations — "escalate one rung at a time; a stage never borrows the next rung's
permissions" (lifecycle skill, privilege ladder).

## Two design roles break a pattern on purpose

**`prototyper.md` routes to Fable**, against the behavioural floor recorded in
`SKILL.md` ("Surgical brief ⇒ cheap model has a FLOOR"). The exception is structural,
not budgetary: a prototype's acceptance gate is **a human eye**, which cannot be
satisfied hollowly the way a green suite was; and a prototype **ships nothing**. The
full reasoning lives in the brief itself, so a maintenance pass reading the brief in
isolation finds the justification with it. **The exception licenses prototypes and
nothing else.**

**`design-reviewer.md` is T4 by design, not by modesty.** `SUBAGENT-AUTHORIZATION.md`
§3 allows one grant per work repo, so any write-capable design role would serialize
behind the Senior's build and make a per-feature audit unaffordable.

> **CORRECTED 2026-08-20** — this paragraph ended *"Read-only takes no lock … Filing a
> `debt` issue is a tracker op, not a repo write."* Both halves were wrong, and both were
> imported from `DESIGN-TEAM.md` §2, which has been corrected at source.
>
> **The tier takes a lock.** `activate-lock.sh:88` validates `T4` like any other tier and
> `:121` writes an identical lock file. What takes no lock is `aedl-verify`'s **grantless
> host-native spawn** (see line 26 above) — which is indeed why the Design axis can run at
> every QA gate, but it is a property of that spawn path, not of T4.
>
> **And a tracker op IS blocked at T4.** `SUBAGENT-AUTHORIZATION.md:64` scores the
> issue-create row **T4 ❌** and `delegation-guard-bash.sh:192` enforces it. `design-reviewer`
> returns ready-to-file **drafts**; the spawning seat files them.
