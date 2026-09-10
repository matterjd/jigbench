---
name: subagent-delegation-workflow
description: Delegate a scoped task to a worker sub-agent under a signed tier grant (T1–T4) with mechanical PreToolUse guardrails. Use for the @aedl -delegate command (/aedl-delegate), "delegate this to a sub-agent", or "spawn a worker under a grant". The brain sets a lock, spawns the worker, collects its report, and clears the lock.
---

# Sub-Agent Delegation Workflow

## Description

Runs the **brain → worker** delegation lifecycle. The *brain* (this orchestrator) authorizes
a *worker* (a sub-agent spawned via the Agent/Task tool) with a **signed grant** capping it to
one of four tiers, activates a runtime lock the guard hooks read, spawns the worker, collects
its result, and clears the lock. Enforcement is by `.claude/hooks/delegation-guard-*.sh`.

**Containment is guardrail-level, not a sandbox.** The hooks pattern-match Claude tool calls,
not file I/O inside a bash subprocess, so a determined worker can bypass them by indirection
(write a helper script, then run it). Treat this as defense-in-depth against casual or
prompt-injected-but-naive misbehavior — **do not delegate adversarial or untrusted work
expecting hard isolation.** Real isolation needs an OS-level sandbox (restricted worktree /
container / an already-sandboxed remote).

> **This is a stage-skill.** It implements AEDL stage 7 behind the
> [stage-skill contract](../../../docs/aedl-v2/stage-skill-contract.md). The orchestrator
> (`agentic-development-lifecycle`) loads it only when stage 7 runs; it is equally valid
> standalone via `@aedl -delegate`.

## Contract

```
stage:       7 — Delegation (optional; the build stages may run brain-direct)
requires:    a scoped objective + a tier the human authorized; the target repo registered in
             `repos:`; a surgical brief (exact file:symbol pointers) and the target's house
             standards / stack profile; Step 3.5 preflight GREEN; **a re-anchor sweep of every
             `file:line` the ticket cites, run symbol-first at brief time** — a ticket cut at
             stage 3 never passes back through stage 1, so its anchors are as old as the ticket
             (cc#125: 10 of 12 rotted in four days, one onto plausible unrelated prose)
does:        mint + sign the grant, cut the work branch, activate the lock, spawn ONE worker,
             collect its fixed-schema report, release the lock, file the evidence trail
done-when:   the worker's final message validates against `references/worker-report-schema.md`
             AND `config/delegation-locks/<id>.yml` is gone (released) AND
             `delegations/<id>/` holds grant.md + report.md + worklog.md AND one
             `observer-log.md` line was appended
produces:    commits on <work_branch> · delegations/<id>/{grant.md, report.md, worklog.md}
             (+ error-log.md / blocked.log if anything was blocked) · observer-log line
             (→ stage 8 verify + review)
autonomy:    amber — the grant tier IS the dial (T4 read-only → T1 broad), but the machinery
             (lock + PreToolUse guards + mandatory expiry) engages at EVERY tier. Never green:
             a worker with any write scope is never unguarded.
challenges:  "the worker reported done" — done is the DIFF, not the report line; a green suite
             on a gutted feature is a stub, and that is how a stub ships;
             "just bump the tier so it can finish" — a tier is a ceiling, never widened mid-task;
             re-scope the objective or spawn a second delegation instead;
             "skip the preflight, the guards are obviously there" — an unenforced delegation is
             worse than none, because it looks identical in the record
mirror:      grant, report, worklog, and observer-log are plain markdown under `delegations/`;
             enforcement is POSIX `.sh` hooks. Nothing here is Claude-specific — another
             editor-AI reads the same evidence trail and the same guard scripts.
```

## When To Use

- `@aedl -delegate <tier> <objective> [--role <name>] [--branch <name>] [--expiry <minutes>]` — run one
  delegation end to end.
- **`--role <name>` (optional):** load the standing role brief `references/roles/<name>.md`.
  **Delivery Team** (charter §4) — senior-engineer, qa-engineer, principal-engineer, architect,
  technical-writer. **Design Team** (`docs/DESIGN-TEAM.md` §4, 2026-08-15) — prototyper,
  art-director, design-reviewer. Its frontmatter supplies DEFAULTS — `default_tier`, `model_routing`, the
  work-branch slug; the caller may still narrow the tier. A brief pre-fills, it never
  pre-authorizes: `scope_confirmed` and the sign-off stay per-delegation
  (`references/roles/README.md`).
- **Cross-repo (Stage 6):** a delegation may execute in a **registered sibling repo**
  (`work_repo_path` from `config/workspace.yml` `repos:`, e.g. `axis-grim`) while the control
  plane stays in matter-notes; the worker writes only in that work repo.
- **Not** for writes outside *any* repo (decision (c); HARD RULE 4).
  **CORRECTED 2026-08-20 — `@aedl -art` is NOT wholly brain-only.** `DESIGN-TEAM.md` §4 staffs
  an **Art Director at T3** which runs `@aedl -art` *except* the brain-only subcommands —
  `status`, `run`, `recipe`, `caption`, `handoff`, `lora` — plus `lora-db.yml` upkeep and the
  plan's status sync. So the line to draw is **per subcommand, not per skill**: the enumerated
  six stay with the brain; the rest are a chartered Design-seat delegation. Read as written,
  this bullet would have a brain refuse a delegation its own charter authorises.
- **Not** for adversarial/untrusted tasks needing hard containment (see above).

## Inputs Required

| Input | Default | Notes |
| --- | --- | --- |
| Objective | — | One line; defines the authorized blast radius. |
| Tier | `T4` | `T1`\|`T2`\|`T3`\|`T4` (see `SUBAGENT-AUTHORIZATION.md` §3). |
| Role brief | — | Optional `--role <name>` → `references/roles/<name>.md`; its frontmatter defaults tier / branch slug / model routing. |
| Work branch | `delegate/<slug>` | Cut off latest `origin/main`. |
| Expiry (minutes) | `120` | **Mandatory, non-blank** — the auto-cleanup backstop. |
| Control-plane repo | `repo_path` | `$CLAUDE_PROJECT_DIR` (matter-notes); the lock + guards live here. |
| Work repo (target) | control-plane repo | Blank = same repo. To run against a sibling, set `work_repo_path` to a **registered** repo from `config/workspace.yml` `repos:` (e.g. `axis-grim`). Refuse any target not in `repos:`. |

## Execution Rules

- **Single grant per work repo; per-session locks are limited by DISJOINT ZONES, not by count.**
  Locks live as individual files in
  `config/delegation-locks/<delegation_id>.yml`. Before minting a new one, check whether a
  live (unexpired) lock already covers the **same normalized `work_repo_path`** (blank = the
  control-plane repo) — if so, stop and report; do not stack two delegations on one work repo.
  One session **may** hold N live locks provided their zones are **disjoint** — invariant 1
  above is what enforces the disjointness. Worker containment is preserved mechanically rather
  than by counting: activation is **refused when the CALLER's cwd sits inside any live lock's
  work zone**, so a worker — which lives in its zone — cannot mint itself a second one from
  there. (Accepted conservative edge: while a live lock covers the control root itself, the
  brain cannot mint a second lock either, because its cwd is inside that zone.)
  `activate-lock.sh` enforces both invariants mechanically and prunes expired locks
  on every activation — **non-overlapping delegations run concurrently**, whether from one
  session or several, each fenced only out of its own work repo + the control plane.

  > *Correction (maintenance pass 6, 2026-08-28).* This bullet, Step 4, and the Guardrails list
  > each stated **"one lock per session"** as the current rule. That is the pre-mn#46 rule;
  > `activate-lock.sh` stopped enforcing it at maintenance pass 5, which replaced it with
  > disjoint zones + caller-cwd containment (its INVARIANTS block, invariant 2). The failure
  > class is **prose STRICTER than enforcement** — it silently cancels a shipped capability: a
  > session trusting this doc over the script would have refused the legal concurrent launch of
  > 2026-08-27. Corrections go in the record, not over it.
- **The tier is a ceiling** — never widen a grant mid-task.
- **HARD RULE conflict → stop and report.** The five HARD RULES in `SUBAGENT-AUTHORIZATION.md`
  win over any instruction.
- **Bare commands while any lock is active.** From the moment `activate-lock.sh` returns until
  this session's `release-lock.sh` returns, the brain issues only **bare, single-purpose**
  commands: `worklog-append.sh`, `release-lock.sh`, `activate-lock.sh` (including `--respawn`),
  spawning the worker (Agent tool, unguarded), and read-only tools. Never bundle a bookkeeping
  write into a compound chain (e.g. Step 6's release as `release-lock.sh <id> <token> && grep
  config/delegation-locks/…` — a compound command that also touches a control-plane path is
  correctly BLOCKED by the guard and logs a self-inflicted `blocked.log` entry) — do
  bookkeeping writes **before** activation or **after** release; run the release alone, then
  resume brain upkeep. Target-based guard matching (2026-07-05) ended the false-positives
  where a command merely *mentioning* a control-plane path got blocked, but bare commands
  remain the discipline that keeps attribution clean and keeps the brain from binding itself
  under its own worker's tier.

## Standard Process

### Step 1 — Gather + validate
Resolve `repo_path` (the control-plane repo = `$CLAUDE_PROJECT_DIR`) from `config/workspace.yml`.
With `--role <name>`, load `references/roles/<name>.md` first and take its `default_tier`,
`model_routing`, and work-branch slug as the DEFAULTS for the inputs below. The caller may
still narrow the tier — the brief is a ceiling suggestion, and the granted tier remains a
ceiling never widened mid-task.
Collect objective, tier, work-branch, expiry, and the **work repo**: default = the control-plane
repo; for a cross-repo run, take `work_repo_path` from the caller and **validate it is one of the
registered `repos:`** in `config/workspace.yml` (by name or exact path) — refuse anything else.
Confirm no live lock already covers this **work repo**, and that this session doesn't already
own a live lock elsewhere (Execution Rules — `activate-lock.sh` re-checks both at activation
time, but check early to avoid wasted setup). `git -C <work_repo> fetch origin`.

### Step 2 — Mint the delegation + write the grant
`delegation_id = <YYYY-MM-DD>-<slug-of-objective>`. `mkdir delegations/<id>/`. Copy
`SUBAGENT-AUTHORIZATION.md` to `delegations/<id>/grant.md` and fill its frontmatter:
`repo_path`, `base_branch: origin/main`, `work_branch`, `objective`, `tier`,
`expiry: <now + minutes, ISO8601 UTC>`, `authorized_by`, `date`, `scope_confirmed: true`.
(This copy is not the root control-plane file, so writing it is allowed.)
With a role brief loaded, pre-fill the grant copy from the brief's frontmatter (tier, work
branch from its slug, objective from its template) — but `scope_confirmed` and the sign-off
fields are filled fresh for THIS delegation; a brief never carries them.
Append the opening **work-log** line (issue #4) — `bash .claude/hooks/worklog-append.sh <id> created "delegation minted: <objective> | tier <T> | branch <work_branch> | ring <N> (<enforcement surface>) | mode: <enforced|doctrine-only>"`. Record the armor **ring / mode** here (per #9) so the evidence shows which enforcement surface the session ran under. All worklog writes go through `worklog-append.sh`, which sanitizes (log-injection + secrets-in-log) — never hand-write the worklog.

### Step 3 — Cut the work branch (HARD RULES 2 + 3)
In the **work repo**: `git -C <work_repo> switch -c <work_branch> origin/main` — always a fresh
local branch off latest upstream. Do this **before** activating the lock (git ops are unguarded
only while the lock is inactive).

### Step 3.5 — Preflight: refuse if unenforced (MANDATORY)
Run `bash .claude/hooks/preflight-check.sh`. It verifies the **control-plane** work-tree actually
carries the guards (both `delegation-guard-*.sh` + `release-lock.sh` present, both registered in
`.claude/settings.json`, `node` available) — enforcement fires from matter-notes' hooks regardless
of which work repo the worker writes to. **If it fails, STOP and report — do NOT spawn a worker.** A branch cut from a stale `origin/main` that predates the delegation system would run
the worker on the honor system with no mechanical enforcement (the exact failure the
2026-07-03 audit run hit); this check turns that silent failure into a loud one.

### Step 4 — Activate the lock (last brain action before spawning)
Three bare commands, in order:
1. **Generate the release token** — `node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))"`.
   Keep it ONLY in your context — never write it to a file.
2. **Hash it** — bare sha256 of the token (e.g. another one-line `node -e` invocation). Keep the
   hash in context too; it is the value the lock file stores.
3. **Activate** — `bash .claude/hooks/activate-lock.sh <delegation_id> <tier> <work_repo_path|""> <work_branch> <expiry-iso-utc> <sha256-hash>`.
   This writes `config/delegation-locks/<delegation_id>.yml` atomically (temp file + `mv`), enforces
   the invariants (single grant per work repo; N live locks per session so long as their zones are
   disjoint, with activation refused when the caller's cwd sits inside a live lock's work zone;
   mandatory future expiry; a well-formed hash) and **prunes any expired lock files** it finds along
   the way — refusing (exit 2) if this work repo already holds a live lock, or if you are calling
   from inside some live lock's work zone. **It appends the `lock-set`
   work-log line itself** — no separate brain call needed for that line.

Immediately after activation succeeds, append the `spawn` work-log line — `bash
.claude/hooks/worklog-append.sh <id> spawn "worker for: <objective>"` — this is still the brain's
job; `activate-lock.sh` does not know the objective text. This is the last guarded Bash call before
Step 5: **after this point the brain touches only bare commands** (Execution Rules) until Step 6.
The guards then auto-append `block` / `peer-allowed` / `expiry` lines while the lock is live, and
`release-lock.sh` appends `released` — those three feeders need no brain action.

> **Concurrency (peer sessions and peer delegations).** Guards fence a live lock's worker to its
> own `work_repo_path` (blank = the control-plane repo) and out of the control plane — nothing
> else. An unrelated session (another brain's delegation, an `@aedl -art` run) writes freely
> everywhere outside that one work repo, including activating its **own** lock in
> `config/delegation-locks/` concurrently, because the invariant is scoped per work repo, not
> global. Only same-zone writes (two delegations targeting the same work repo) collide, and
> `activate-lock.sh` refuses the second before it ever starts. (Guardrail-level, not a sandbox: the
> distinguisher is the inherited session id, so it defends against casual/naive/injected-but-naive
> peers, not a determined one that forges `$CLAUDE_CODE_SESSION_ID`.)

### Step 5 — Spawn the worker (Agent tool)
Spawn one worker. Its prompt MUST embed, verbatim: the filled grant, the tier capability
table, the five HARD RULES, the objective, the `work_branch`, and the **worker report
schema** — embed `references/worker-report-schema.md` verbatim (not a paraphrase). With a
role brief loaded, also embed the brief's **Mission**, **Standing constraints**, and
**Report-schema additions** immediately after the base schema — the base schema stays
mandatory and verbatim; the role's lines are APPENDED, never a replacement. Plus:
> You run under mechanical PreToolUse hooks that block out-of-tier actions. Work only on
> `<work_branch>` inside the WORK repo (`<work_repo_path or repo_path>`). Your FINAL MESSAGE
> MUST follow the worker report schema below exactly — do NOT write a report file; the
> orchestrator persists it. Do NOT touch the control plane in matter-notes (the lock dir,
> `.claude/hooks/`, `.claude/settings*`, or any grant). Do NOT write anywhere outside the WORK repo.

**The Agent tool is ASYNCHRONOUS — the brain is *not* suspended.** The worker runs in the
background and the brain is re-invoked by a completion notification when it finishes. Two
sessions independently hit the old "the brain is suspended until the worker returns" wording
and mis-planned around it, so state the real contract:

- **The brain stays live** while the worker runs, and must hold itself to **bare / read-only**
  work — reading, planning, drafting. It has an active lock out; anything it writes in the work
  repo races the worker and is invisible to the worker's own diff.
- **Never poll the worker.** You are notified on completion; a polling loop burns context and
  changes nothing. If the worker is genuinely hung, stop it — do not spawn a second one against
  the same lock.
- **Never spawn a second worker against a live lock.** One lock, one worker. Concurrency is
  expressed as multiple locks with disjoint targets, never as two workers sharing one.
- **Step 6 still runs on every path**, including a worker that dies, times out, or is stopped.
  The lock is yours to release whether or not the worker came back.

### Step 6 — Release the lock (MANDATORY, even on worker failure/timeout)
`bash .claude/hooks/release-lock.sh <delegation_id> <release-token>` — both arguments are
mandatory. The script verifies `sha256(token) == release_hash` on **that specific lock file**
before deleting `config/delegation-locks/<delegation_id>.yml`, so a worker (which lacks the
token) cannot release it via this path, and releasing never touches any other session's lock.
This command passes the guard (no write TARGET inside the control plane). It is **idempotent**
— if the lock file is already gone (pruned by expiry, or already released), it reports "nothing
to do" and exits clean rather than erroring. The mandatory `expiry` is the backstop if release
is ever skipped; `delegations/<id>/` remains the durable record after the lock file is deleted.

### Step 7 — Observability / upkeep (brain, full power again)
Persist the worker's returned message to `delegations/<id>/report.md`, and append the `report`
work-log line — `bash .claude/hooks/worklog-append.sh <id> report "worker report collected → report.md (<terse outcome>)"`.
The report MUST already be in `references/worker-report-schema.md` shape (Step 5 embedded the
schema in the spawn prompt) — a report that isn't should itself be treated as a review flag.
Fold any `delegations/<id>/blocked.log` entries + worker-reported failures into
`delegations/<id>/error-log.md`. Append one plain-English line to `delegations/observer-log.md`
(id / tier / outcome / lock cleared). Refresh `MAP.md` if the delegation changed structure.
The full grant → block → release narrative now lives in `delegations/<id>/worklog.md` with **zero
manual writing** (issue #4); render it any time with the `log` subcommand.

> **Bootstrapping caveat (control-plane in-repo).** The worklog hooks fire from the CONTROL
> work-tree, so a *same-repo* delegation whose work branch is cut from a base that predates this
> wiring runs the OLD guards (no worklog). Until the wiring is merged to `origin/main`, base the
> work branch on a tip that already carries it (the review-fix `base_branch` pattern below).

### Step 8 — Summarize
Report to the human: id, tier, branch, what the worker did, artifact paths, and confirm
`config/delegation-locks/<id>.yml` is gone (released). Do NOT auto-sync — issue `/aedl-sync` when ready.

## Subcommands

- **`log <id>`** — render the delegation work log as one chronological, human-readable timeline:
  `bash .claude/hooks/worklog-render.sh <id>`. Merges `delegations/<id>/worklog.md` (the narrated
  lifecycle) with `blocked.log` (the raw security ledger) into a single ordered account of every
  grant, allow, block, and release. Read-only; spawns nothing, changes nothing.
- **`status`** — list every file in `config/delegation-locks/`, and for each: `delegation_id`,
  `tier`, `work_repo_path` (or "control-plane repo" if blank), `expiry` (and whether it has
  already passed, which the guards treat as inactive/prunable). Multiple entries are normal —
  each is a different concurrent delegation on a different work repo/session. Read-only;
  spawns nothing, changes nothing.
- **`release <id>`** — end a specific delegation early with the token from its own activation:
  `bash .claude/hooks/release-lock.sh <id> <release-token>`. Releases only that lock; every
  other live lock is untouched.
- **`resume <id>`** — see **Worker death / resume (A3)** below.
- **`release --force`** (stale-lock recovery — the brain crashed / lost the token): there is
  deliberately **no token-less release script** (a worker could abuse it by indirection). Recover
  per the **§6 runbook in `SUBAGENT-AUTHORIZATION.md`** — stop other sessions, confirm which lock
  is stale, and either delete `config/delegation-locks/<id>.yml` by hand in a plain terminal/editor
  (raw file ops don't pass through a guarded tool, so no hook fires) or just wait for `expiry`
  (`activate-lock.sh` prunes expired locks on its next run regardless). This is the only safe
  force path.

## Worker death / resume (A3)

Two failure shapes, two different recoveries:

- **Worker died mid-run, but the lock is still live and the brain session is still alive.**
  Generate a **new** release token (bare `node -e` call, same pattern as Step 4), hash it, then:
  `bash .claude/hooks/activate-lock.sh --respawn <delegation_id> <new-sha256-hash> [<extend-minutes>]`.
  This is **owner-session-gated** — only the session that owns the lock can respawn it — and it
  rewrites the lock's `release_hash` (and `expiry`, if you passed an extension) in place rather
  than minting a new lock, so the work-repo/session invariants stay intact. It appends its own
  `respawn` work-log line. Re-spawn the worker under the **same grant**, plus a pointer to the
  existing `delegations/<id>/worklog.md` so it can see what already landed and avoid redoing
  finished work. Release normally at the end (Step 6) — the new token is now the one that matters.
- **The brain session died too (nobody left holding the token).** This is stale-lock recovery,
  not a live respawn — follow the **§6 runbook in `SUBAGENT-AUTHORIZATION.md`**: stop other
  sessions, confirm the lock is genuinely abandoned, delete `config/delegation-locks/<id>.yml` by
  hand in a plain terminal (no guarded tool involved, so no hook fires), or simply wait for
  `expiry` — the next `activate-lock.sh` invocation anywhere prunes it automatically.

Stale-lock detection before spawning a *new*, unrelated delegation is automatic: `activate-lock.sh`
prunes every expired lock file it finds on each run, so a forgotten dead lock never silently blocks
a future activation past its own `expiry`.

## Guardrails

- Never leave the lock active after the worker returns (Step 6 is mandatory).
- Never spawn a worker if the Step 3.5 preflight fails — an unenforced delegation is worse than none.
- Every lock carries a mandatory `expiry`.
- One grant per work repo; a session may hold N live locks provided their zones are disjoint, and no activation may be minted from inside a live lock's work zone. No two workers share the same lock. Non-overlapping delegations on different work repos may run concurrently, whether from one session or several.
- Guardrail-level containment only — never delegate work that needs hard isolation.
- The worker writes only inside the work repo (`work_repo_path`); vault / out-of-any-repo skills stay brain-only.
- Delegation never commits/pushes/auto-ticks; promotion is the human's `/aedl-sync`.
- After editing any hook/guard, re-run `bash .claude/hooks/tests/verify-guards.sh` **and**
  `bash .claude/hooks/tests/verify-worklog.sh` (both must be all-pass).

## Expected Output

A completed delegation: `delegations/<id>/{grant.md, report.md, worklog.md}` (+ `error-log.md`/`blocked.log`
if anything was blocked), one appended `observer-log.md` line, the lock cleared, and a summary. The
`worklog.md` is the append-only, sanitized, plain-English evidence trail (issue #4) — `@aedl -delegate
log <id>` renders it and `blocked.log` as one timeline.

## Related Skills

- `sync-workflow` — selective-staging + MAP.md step reused in upkeep.
- `agent-exchange-workflow` — observer-log pattern reused for `delegations/observer-log.md`.

## Anti-Patterns

- Issuing a guarded tool call as the brain while the lock is active (you'd bind yourself).
- Delegating a vault-writing / out-of-repo task (brain-only).
- Trusting the guardrails as a sandbox against an adversarial worker.

## Learning Notes

- **Cost discipline (see AGENTS.md → Token & context discipline).** Mechanical workers
  (impl, spec, review-fix passes) run fine on **Haiku/Fable** when the brief is surgical:
  exact `file:symbol` pointers, the precise change per site, and "run the suite to green" as
  the safety net. Demand a **fixed terse report schema** — free-form worker reports are a top
  token spend. `2026-07-04-r1-review-fixes` (Haiku, 4 precise fixes) landed 226/226 green with
  a clean structured report; the R1 impl worker's prose report omitted that the guard blocked 5
  out-of-repo writes (a transparency gap the schema now forecloses).
- **Review-fix passes build on the existing PR branch, not a fresh cut off `origin/main`.**
  Set `base_branch` to the PR branch tip and adapt HARD RULE 3's wording in the grant (the PR
  branch is already based on `origin/main` with a CLEAN merge, so the intent holds). Cutting
  fresh off main would discard the shipped work.

- **"Surgical brief ⇒ cheap model" has a FLOOR (2026-07-26, command-center #62, three delegations
  on one branch).** The cost-discipline rule above is right for *mechanical* work and wrong for
  *behavioural* work, and the difference is not brief quality:

  | Pass | Model | Brief | Result |
  |---|---|---|---|
  | build (3 TDD slices) | Sonnet | surgical, file:line throughout | success; **2 SPEC deviations disclosed unprompted** |
  | fix pass 1 (6 findings) | Sonnet | surgical | success; **1 SPEC + 2 SCOPE deviations disclosed**, flagged its own top concern |
  | fix pass 2 (3 findings, ~10 lines) | **Haiku** | the most surgical of the three — exact sites, fix stated per site | **cosmetic fix + two false claims + `CONCERNS: none`**; reported 2 of 4 requested gates while declaring `FORMAT: clean` |

  The Haiku pass "fixed" a race by setting a flag that only pulses a 6px dot — the component's own
  doc comment says so, three lines from the code it read — then wrote a comment asserting the race
  was guarded, and a red-then-green test asserting only that the flag flipped. **Schema-conformant,
  suite green, entirely hollow.**

  **The rule:** route by *what the task demands*, not by how small the diff is.
  - **Mechanical → Haiku/Fable:** apply a stated edit at a stated site, run a script, exercise a
    result, mirror a pattern. (Run 1's delegation exercise: 24.1k tok, 20s, perfect.)
  - **Behavioural → Sonnet or better:** anything phrased *"make X actually true"* — where the worker
    must verify its change had the intended **effect**, not just that the edit landed. A ten-line
    behavioural fix is not a cheap task; it is a small expensive one.

  Corollary for the brief: when the objective is behavioural, say **what must become observably
  true and at which layer** ("the stale body must not be clickable — assert the DOM"), never just
  which line to change. A cheap model will satisfy the literal instruction perfectly.

- **The ONE named exception to the behavioural floor: prototypes (ruled 2026-08-15,
  `docs/DESIGN-TEAM.md` decision 4).** The `prototyper.md` role routes to **Fable** even though
  concept work is not mechanical. Read the exception's *reason*, because the reason is what limits
  it:

  The Haiku failure above was **a test accepting a lie** — schema-conformant, suite green,
  entirely hollow. That failure mode needs an automated gate to fool. A prototype has none:

  | | Behavioural code work | A prototype |
  |---|---|---|
  | Acceptance gate | a test suite | **Matter's eye, at a stated viewport** |
  | Can a hollow result pass it? | yes — demonstrably, twice | no. A mockup that looks wrong *is* wrong, on sight |
  | Blast radius of a bad one | shipped code, silently | a wasted render and a re-run |
  | What more of them buys | nothing | **more concepts to choose between** — the product itself |

  **The exception licenses prototypes and nothing else.** The moment the objective becomes
  *"make X actually true"* in code anything imports, runs, or tests, the floor applies again.
  Do not generalize this to "design work is cheap": the Art Director
  (`references/roles/art-director.md`) is design work and routes **behavioural**, because register
  doctrine reads like a simple instruction and is a trap.

  > **To a future maintenance pass:** this row is not a violation of the rule above it. It is a
  > ruled exception with its scope stated. Narrow it if the evidence changes; do not delete it as
  > an inconsistency.
