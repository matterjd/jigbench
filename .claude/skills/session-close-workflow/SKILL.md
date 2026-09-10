---
name: session-close-workflow
description: End a working session with one command (@aedl -close, /aedl-close) — a single reconstruction pass fans out to every close surface (journal recap, AI-usage row, observe-kit time-log + memory harvest, HANDOFF.md refresh, parking-lot flush), then one sync commit. Use when the user says "close the session", "run the close loop", "end the session", or invokes @aedl -close; --merge additionally pends one squash-merge y/n, --remote emits a paste-ready kit bundle instead of writing the kit.
---

# Session Close Workflow

## Description

One command ends a session. Today's close surfaces — journal recap, usage row, observe-kit
time-log + memory observations, `HANDOFF.md` sentence, parking-lot sweep — were separate
hand-written reconstructions, and the unfused ones silently died (journal: 0% lifetime
compliance vs HANDOFF's 100%, which is fused into sync). This skill fuses them: **one
read-only reconstruction** of what actually happened fans out to every surface, then **one
commit/push** via `sync-workflow` (whose whole-repo form already ticks the agent exchange).

Evidence and design: [`docs/aedl-close-plan.md`](../../../docs/aedl-close-plan.md) and
[`notes/reviews/2026-07-08-close-loop-dryrun-findings.md`](../../../notes/reviews/2026-07-08-close-loop-dryrun-findings.md).

The `<NOTES_CMD>` prefix (default `@aedl`) is configurable per repo. `-close` is an
**internal agent command**, not a shell CLI — resolve it to this skill and follow the
Standard Process; never attempt an `aedl` binary.

## Command Forms

| Command | Behavior |
| --- | --- |
| `<NOTES_CMD> -close` | Full close loop (reconstruct → one decision round → fan-out → one sync commit). |
| `<NOTES_CMD> -close --merge` | Same, then pends **exactly one y/n**: squash-merge the session branch into the default branch via `notes-merge-workflow`. Never auto-merges. |
| `<NOTES_CMD> -close --remote` | Remote-session mode: writes **nothing outside the repo**; the kit arm instead emits one **paste-ready bundle** (time-log row + memory files + INDEX lines) in the close summary, for hand-ferry to the desktop kit. |

## When To Use

- End of any working session in this repo (the doctrinal session end per AGENTS.md
  "Session open & close").
- Do **not** use as a mid-session checkpoint — that is bare `-sync`, which stays valid
  and untouched.
- Do **not** use on a machine whose `config/workspace.yml` has no `session_close:` block —
  the command **declines politely** and points at the kit-form close instead (this is how
  the work machine stays kit-only by construction).

## Config Contract (gitignored `config/workspace.yml`)

```yaml
session_close:
  enabled: true                       # absent block ⇒ decline politely
  profile: "vault"                    # "vault" (default) | "project" — see Project-Repo Profile
  journal: true                       # per-session recap into notes/journals/ (vault profile only)
  usage_log: true                     # (vault profile only)
  observe_kit: "<exact on-disk kit path>"   # omit to skip the kit arm
  rulings_snapshot: "<path to command-center's machine.yml>"  # omit to skip arm f
  learning_notes_line: false          # v2 candidate (roadmap P2.11); inert in v1
```

Each fan-out arm is individually skippable via its flag. `learning_notes_line` is
recognized but a no-op in v1 (deferred to v2 by the 2026-07-09 harvest round).
Absent `profile:` ⇒ `"vault"` — the full five-arm close exactly as documented below.

## Seat Profile — the OTHER axis, and it is not the same as `profile:`

*Added 2026-08-20. `profile:` is a **repo-type** axis (vault vs project). It cannot express
that a **Portfolio** close and a **Delivery** close in the SAME vault repo have different
surfaces — which is why this skill read as Delivery-shaped to the two seats that are not
Delivery. **Name the seat in the harvest round** (step 2) and adapt by this table.*

**There are THREE seats** — see [`AGENTS.md`](../../../AGENTS.md) "Session open & close", which
is the seat-neutral doctrine every seat reads: **Portfolio**
([`docs/CONTROL-SESSION.md`](../../../docs/CONTROL-SESSION.md) — dispatch, don't build) ·
**Delivery** ([`docs/DELIVERY-TEAM.md`](../../../docs/DELIVERY-TEAM.md) — one per project repo) ·
**Design** ([`docs/DESIGN-TEAM.md`](../../../docs/DESIGN-TEAM.md) — cross-program).

| Arm / step | **Portfolio** | **Delivery** | **Design** |
|---|---|---|---|
| a. Journal | The dispatch arc: what was ordered and why, what was handed out, what was refused | The feature arc | The design arc: grills, concepts, verdicts, drift found |
| b. Usage row | unchanged | unchanged | unchanged |
| c. Observe kit | unchanged | unchanged | unchanged |
| d. HANDOFF | the root baton — this seat's primary record | that repo's OWN baton (`AGENTS.md` rule 2) | the root baton **plus** the art baton when the session touched the art lane — see the arm below |
| e. Parking lot | unchanged | degrades per the project profile | unchanged |
| DoD extras | none — this seat ships no code. Instead confirm: every dispatch is recorded, and every ruling taken in-session reached the **tracker**, not just the transcript (`CONTROL-SESSION.md` §5) | `QUALITY.md` + demo note + `docs/team/<feature>/STANDUPS.md` (`DELIVERY-TEAM.md` §6) | the gallery README verdict row and any `COMMISSION.md` touched (`DESIGN-TEAM.md` §5.1 step 4) |
| 5. `--merge` | **Never.** Merge authorization is Matter's on every repo (`CONTROL-SESSION.md` §7) | PR-gated, the Product Owner's | **Never** — this seat produces candidates and findings; Matter rules and Delivery builds |

**Arm f — the art baton (Design seat, art lane only).** `DESIGN-TEAM.md` §8 decision 8 keeps
`ai-image-gen/handoffs/_SESSION-BATON.md` as the art lane's own handoff, refreshed by
`PROCESS.md` P7 and independent of the root `HANDOFF.md`. **A repo-wide grep shows nothing in
`.claude/` or `tools/` writes that file** — so an art session can satisfy this skill's entire
five-arm close and still drop a mandatory surface. When the session touched the art lane,
refresh it per P7 and say so in the close summary; when it did not, say "art baton: n/a".

**If the seat is unnamed at close, ask for it in the harvest round.** Do not infer it from the
diff — a Portfolio seat that filed a ticket and a Delivery seat that fixed one look similar in
`git status`, and the DoD extras differ.

## Project-Repo Profile (vault-less provisioned repos)

`profile: "project"` adapts the close to a repo provisioned by the aedl-kit. A project
repo is not a notes vault, so the vault-coupled arms degrade **mechanically, by this
table** — never by in-the-moment improvisation (audit gap G3; the worldloom lane
demonstrated the proxy-close failure on 2026-08-13). The kit's
`config/workspace.example.yml` ships this profile pre-filled.

| Arm / step | Disposition under `profile: "project"` |
|---|---|
| a. Journal | **Unavailable** (no vault). `journal:` must be `false`; a `true` here is a config contradiction — report it in the harvest and proceed with the arm off. Never decline over it. The session record is the repo's own surfaces: `HANDOFF.md`, the demo note, `docs/team/<feature>/STANDUPS.md`. |
| b. Usage row | **Unavailable** — same rule as the journal arm. |
| c. Observe kit | **Unchanged** when `observe_kit` is set — the kit is standalone and machine-global, reachable from any repo; the §2.4 non-intrusion check applies as written. Omit the key to skip. |
| d. HANDOFF overwrite | **Unchanged** — the project repo's OWN `HANDOFF.md` (create on first use, AGENTS.md close rule 5). |
| e. Parking lot | **Degrades to the `HANDOFF.md` open-threads block** — there is no `ideas/` here, and the baton is already the record a fresh session reads first. The harvest may route an individual sprinkle to a tracker issue instead (issue-create tier rules apply). When the sweep found nothing, say "parking lot: none" as usual. |
| 4. Sync | **Degrades to plain git** (no `sync-workflow` here): stage the close-touched record files + this session's own work on the **current** branch — never switch branches, never stage another session's files — ONE commit, push to the branch's upstream. No `MAP.md` step, no exchange tick (vault machinery). Build work on the default branch stays forbidden ([`DELIVERY-TEAM.md`](../../../docs/DELIVERY-TEAM.md) charter: branches + PRs); a close whose only changes are record surfaces (`HANDOFF.md`, `QUALITY.md`, `docs/team/`) may land on the default branch — that is the baton refresh. |
| 5. `--merge` | **Unavailable** — project-repo merges are PR-gated and the Product Owner's ([`DELIVERY-TEAM.md`](../../../docs/DELIVERY-TEAM.md) §3.3). Decline the flag with a pointer to the PR flow; the rest of the close still runs. |
| `--remote` | Unchanged — emits the paste-ready kit bundle, writes nothing outside the repo. |

Two project-profile items join the harvest checklist **for a Delivery seat**
([`DELIVERY-TEAM.md`](../../../docs/DELIVERY-TEAM.md) **§6**, Definition of Done): the
`QUALITY.md` refresh (each number beside the command that produced it) and the demo note —
each confirmed present or explicitly waived by the human in the one round, never silently
skipped.

> **Name the charter, always.** An unattributed *"the charter"* resolves against whichever
> charter the running seat holds, and the section numbers do not line up:
> **`DELIVERY-TEAM.md` §6 is the Definition of Done; `DESIGN-TEAM.md` §6 is the design floor.**
> A Design seat resolving a bare "charter §6 DoD" lands on the floor and gets a
> coherent-looking wrong answer. Every charter reference in this skill names its file.

## Execution Rules

- **All arms are append-only.** Never rewrite or reorder existing journal sections, usage
  rows, time-log rows, or parking-lot rows. `HANDOFF.md` is the ONE overwrite (existing
  doctrine — git keeps its history) — **but read [`AGENTS.md`](../../../AGENTS.md) "Who owns
  the close" rule 4 before overwriting it: if the root `HANDOFF.md` changed under you, MERGE it
  rather than overwriting.** Those two sentences look contradictory and are not: overwrite is
  the shape of the file, merge is the rule when another session moved it first. AGENTS.md's own
  irreducible-core item 1 states the overwrite without the rule-4 qualifier, and that is the
  sentence this skill previously copied.
- **Before any arm writes: assert the tree is yours.** More than one seat can be rooted in
  `matter-notes` at once — Portfolio sits here by charter, and any control-plane or kit change
  is a Delivery seat here too. `mn#25` currently forbids the worktree that would separate them,
  so a shared tree is the expected case, not the edge case (`mn#34`). **`git status` answers
  "what is dirty", never "what is mine".** If the tree carries files this session did not touch,
  STOP and name them in the harvest with their three dispositions (step 1b) — a close that
  stages another session's in-progress build has committed someone else's unfinished work onto
  their own branch, which is the 2026-07-30 failure and it has now happened three times.
- **The observe-kit arm is bound by the kit's `OBSERVE.md` §2 rules** — the kit directory
  is that arm's only write target, and the §2.4 non-intrusion check stands: repo
  `git status --porcelain` must be identical before and after the kit writes.
- **Invoke, don't reimplement.** The kit arm is the existing `aedl-observation-layer`
  `log` behavior; the sync is `sync-workflow`; the merge is `notes-merge-workflow`. This
  skill orchestrates them.
- **Exactly one pended question round** (the decision harvest), plus the one `--merge`
  y/n when flagged. Nothing else stops the loop.
- **Never auto-merge.** Without `--merge`, do not merge at all; with it, only after the y/n.
- **Never stage another session's files.** Unrelated dirty/untracked files stay untouched,
  per `sync-workflow`'s own rules — but they are **named** in the harvest per step 1b, not
  silently ignored.
- **A down dependency gets dispositions, not a default skip.** When an arm's dependency is
  unreachable (the observe kit's path missing, an exchange channel offline, the tracker
  down), don't unilaterally pick "skip and report." Name the real options in the harvest
  round — **skip** · **skip-with-marker** (leave a breadcrumb so the next close knows the
  arm owes a run) · **pause-and-retry** — and let the human choose. This matters most for
  arms that write outward, where a silent skip looks identical to a successful run in the
  record. *(Peer note `2026-07-24-0913`, adopted 2026-07-25.)*
- **The close scales with the session (2026-08-21 audit).** Step 1 computes
  `light/medium/heavy` and the fan-out must consume it — the audit found the weight computed
  then ignored, ~15KB of writes per close at every size. A `light` session runs the **LIGHT
  CLOSE**: HANDOFF (arm d) + sync, one-line usage and time-log rows (arms b/c), the journal
  arm only when a decision worth finding again was made, the parking-lot arm only when the
  sweep found sprinkles. `medium`/`heavy` run the full fan-out.
- Resolve every org-specific value (`<NOTES_CMD>`, kit path, exchange config) from
  `config/workspace.yml` at runtime — never hardcode.

## Standard Process

1. **Reconstruct once (read-only).** Establish: session window (first→last activity,
   `HH:MM–HH:MM` local), repos touched, work done, decisions made, scale
   (`light`/`medium`/`heavy` per `ai-usage-log`) — from this conversation, `git log`
   since the last close, and `delegations/` + `review-cycles/` entries if any. Also
   sweep the conversation for **sprinkled ideas/threads** not yet captured (parking-lot
   candidates) and draft 0–n **memory observations** (durable, cross-session bar per the
   kit's `OBSERVE.md` §4).

   **Scope the reconstruction to THIS session, not the broadest available window.** The
   loop is meant to run often; a reconstruction that re-derives a whole day (or everything
   since the last *sync*) pays that cost on every invocation even when only the unit that
   just finished is new. Default scope = the session being closed. Anything inherently
   scoped to a longer period — a multi-day journal backfill, a whole-project recap — is a
   deliberate flag, not the default. *(Peer note `2026-07-24-0900`, adopted 2026-07-25.)*

1b. **Orphan sweep — "what belongs to this session" ≠ "what is dirty right now."**
   `git status` answers the second question, and the close loop has historically acted as
   if it answered the first. Work left uncommitted by an **earlier** session — created
   after that session's close ran, then never synced — rides along invisibly through close
   after close, because each one only reasons about today.

   So: cross-check every modified/untracked path's **mtime** (or the gap in commit history)
   against the reconstructed session window from step 1. Anything **older than the session
   start is its own decision point** — name it explicitly in the harvest with three options
   (fold into this close · leave for a dedicated pass · it's another live session's, don't
   touch) rather than defaulting to either "it's today's" or "leave it alone."

   Two rules ride along:
   - **Never guess ownership of an unexplained file in a shared tree.** A path this session
     cannot account for may belong to a concurrently-running session. Name it and ask
     (finished / in progress / whose) — dropping real work and committing a half-written
     file are both worse than the pause. *(Peer note `2026-07-23-1536`.)*
   - **Say the candidate set out loud before staging.** When the untracked set mixes
     this-session artifacts with older ones, name the specific paths and take a one-shot
     confirmation. Too broad stages stale work; too narrow silently drops a related file.
     *(Peer note `2026-07-20-1031`.)*

   *(Peer note `2026-07-23-1535`, adopted 2026-07-25 — with live evidence: three untracked
   paths in this repo survived multiple closes untouched before this rule existed.)*

2. **Decision harvest — ONE question round.** Confirm in a single round: **the seat** (if it
   was not named at open — it selects the Seat Profile table above, and the DoD extras differ
   by seat), window + scale,
   the proposed memory observations (approve/trim), the proposed parking-lot rows, **any
   pre-session orphans from step 1b (with their three dispositions)**, **any degraded arm
   from the rule below**, and — only when `--merge` was flagged — the squash-merge y/n.
   Nothing else pends. These all ride the SAME round; that is the point of the harvest.

3. **Fan out** (order matters; each arm skippable via config):
   a. **Journal** (`journal: true`): append a per-session recap to
      `notes/journals/YYYY-MM-DD.md`, creating the file with the `# {Month D, YYYY}`
      title if absent. Per-session (`## Session HH:MM–HH:MM`), not morning/evening —
      personal sessions span midnight, which is why the daily frame never fired. Never
      touch existing content; the `daily-work-journal` skill still owns its own runs of
      the same file. Section shape: see ## Examples.
   b. **Usage row** (`usage_log: true`): one row per `ai-usage-log` conventions appended
      to `notes/ai-usage/{TOOL}/usage-log.md` (drain any `.usage-pending.md` buffers per
      that skill's Step 3c). **v2 schema (2026-08-21):** rows land in the log's v2 table —
      `| Date | Window | Repos | Tool | Task | Description | Scale·Lane |`. Description is
      ONE line, **≤600 chars — measure it before writing**
      (`tail -1 <log> | awk -F'|' '{gsub(/^ +| +$/,"",$7); print length($7)}'` after the append;
      trim if over). *(Pass 5 amended 200→600: seven live rows voted 197–717 with exactly one
      conforming — 600 keeps the density Matter values and still kills the old 1.7KB essays.
      `-maintain` Phase A item 7 flags breaches.)* The Tool cell records model AND effort —
      `claude-code (<model>, <effort>)` — so the arm is never again unstated in artifacts.
      Scale·Lane appends the session's lane — `harness` · `product` · `mixed` — so
      `-maintain` computes the harness-vs-product ratio instead of re-mining it.
      **Mechanically enforced since pass 7 (2026-08-29):** `usage-row-gate.sh`
      (PostToolUse) exit-2s any commit whose newest usage row breaks the cap, the Tool
      cell, or the Lane — the prose-only rule had gone 8-of-9 non-conforming. The gate
      measures with this step's own awk formula, so measure with it and the gate agrees;
      on a red, fix the row and amend.
   c. **Observe kit** (`observe_kit` set, not `--remote`): run the `aedl-observation-layer`
      `log` process — time-log row + the approved memory observations, kit-only writes,
      §2.4 check before/after. Under `--remote`: emit the paste-ready bundle instead.
   d. **HANDOFF.md overwrite:** ONE sentence a fresh session could act on immediately +
      the short state block (branch, clean/dirty, open threads) — sync-workflow step 6
      doctrine, executed here. **Budget (2026-08-21): target ≤40 lines / ~4KB.** NEXT-lane
      detail cites the tracker (issue/PR numbers), never restates it; the priorities block
      is a pointer to `CONTROL-SESSION.md`, never a copy. The audit found the file drifted
      to 126 lines / 10.6KB — read at every open AND rewritten at every close, the doctrine's
      10× overweight on the ceremony's most-touched artifact.
   e. **Parking-lot flush:** append the approved sprinkle rows to
      [`ideas/parking-lot.md`](../../../ideas/parking-lot.md) (date · one line · source ·
      status). When the sweep found nothing, say "parking lot: none" in the close summary.
   f. **Rulings snapshot** (`rulings_snapshot` set): refresh the MERGE-row feed the
      Rulings Deck reads (cc#255 S5) —

      ```bash
      scripts/gather-open-prs.sh --roots-from "<rulings_snapshot>" \
        | scripts/write-rulings-snapshot.sh write
      ```

      **Run it on every close, including one that found nothing open.** The consumer reads
      the file's mtime as `distilledAt`, so a skipped write makes a fresh check read as a
      stale one — the arm's whole value is that the deck can state its own age honestly.
      The snapshot is gitignored (`docs/rulings-snapshots/`), so this arm adds **nothing to
      the sync commit**; it is a local artifact by design (a committed one would have its
      `distilledAt` reset to checkout time on every fresh clone).

      **Degrade, never fail the close:** no `gh` on PATH, no machine.yml at the configured
      path, or a refused payload → report the arm as skipped with the reason and carry on.
      A repo whose tracker could not be read is **data, not an error** — it lands as
      `"open": null, "unreachable": true`, and the pass still writes. Contract and schema:
      [`docs/rulings-snapshot-contract.md`](../../../docs/rulings-snapshot-contract.md).

4. **Sync** via `sync-workflow` (whole-repo form): stages the journal, usage log,
   `HANDOFF.md`, parking lot, and the session's own work in **one commit**, updates
   `MAP.md` per its step 5, pushes, and runs the agent-exchange tick per its own
   singleton/non-blocking rules. **The close summary reports each channel's INBOUND backlog
   depth** (unread peer notes past the watermark) beside the tick line — the 2026-08-13 drain
   lesson: outbound ticks daily while inbound stalls silently, and 17 notes once accrued over
   8 days, one of which had pre-described an incident two days before it burned a day. (When invoked via `-close`, sync's optional usage step 4
   and HANDOFF step 6 are already satisfied by arms b/d — do not duplicate them.) If the
   user declines the sync, still complete arms a–e locally so the next session isn't blind.

5. **`--merge` only:** after a clean sync, pend the one y/n; on "y", run
   `notes-merge-workflow` (squash into the default branch). On "n", report the branch
   as-is.

6. **Say the sentence.** The close summary ends with the `HANDOFF.md` sentence, verbatim,
   as its last line — unchanged doctrine.

## Expected Output

A close summary with:

- session window + scale as confirmed
- per-arm result lines (journal section added, usage row, kit row + memory files with
  §2.4 check result, HANDOFF refreshed, parking-lot rows or "none")
- the sync commit hash and exchange-tick one-liner (via `sync-workflow`)
- merge result when `--merge` was flagged (merged sha, or "declined — branch stands")
- under `--remote`: the paste-ready kit bundle, clearly fenced
- **the handoff sentence, verbatim, as the last line**

## Relationship To Existing Surfaces

| Surface | Disposition |
|---|---|
| `sync-workflow` steps 4 (usage) + 6 (HANDOFF) | subsumed when invoked via `-close`; unchanged for bare `-sync` |
| `daily-work-journal` skill | untouched; `-close` appends per-session sections to the same daily file that skill owns |
| observe kit (`aedl-observation-layer`) | `-close`'s kit arm = the existing `log` behavior, invoked not reimplemented |
| Issue #7 (journal backfill) | `-close` implements its per-session half; #7 re-scoped to whole-missed-days backfill |
| Roadmap P2.11 (learning-notes harvest) | the `learning_notes_line` arm, deferred to v2 |

## Related Skills

- `sync-workflow` — the one-commit sync + exchange tick this skill ends with
- `notes-merge-workflow` — the `--merge` squash, behind its y/n
- `aedl-observation-layer` — the kit arm (`log`), §2-bound
- `ai-usage-log` — usage-row conventions and pending-buffer drain
- `daily-work-journal` — the sibling that owns morning plans / whole-day recaps

## Learning Notes

- 2026-07-09 (first live run — the acceptance test; personal-desktop, `--merge`): run on the very
  session that scaffolded the command. One reconstruction fed all five surfaces; the journal arm
  wrote the vault's first-ever `notes/journals/` file (the 0% surface firing); §2.4 kit
  non-intrusion diff identical; exactly one pended round — folding the `--merge` y/n INTO the
  harvest round (not a separate pend) worked well and is the recommended shape. Learnings from
  earlier in the session (the stacked-PR trap) flowed through the memory-harvest slot with zero
  extra stops. `--remote` not yet exercised.

## Failure Patterns

- 2026-07-18 (#13 close): the §2.4 porcelain-before snapshot was taken before arms a/b
  (journal/usage) instead of immediately before the kit arm — the after-diff then shows
  the close's own repo writes and the check fails spuriously. Order within step 3: run
  arms a/b, THEN snapshot porcelain, THEN the kit writes, THEN compare (the
  kit-attributable delta must be empty).

## Anti-Patterns

- Running `-close` as a mid-session checkpoint (that is bare `-sync`).
- A second question round, or pending anything beyond the harvest + the one `--merge` y/n.
- Rewriting an existing journal section, usage row, or time-log row "to tidy it up."
- Writing kit content anywhere but the kit (or emitting no bundle under `--remote`).
- Auto-merging, or treating `--merge` as pre-authorized without its y/n.
- Proceeding on a machine with no `session_close:` block instead of declining politely.
- Staging another session's untracked files into the close commit.

## Refinement Candidates

- v2: `learning_notes_line` — one appended line into the session's most-exercised skill
  (roadmap P2.11).

## Examples

### Journal session section (arm a)

Appended to `notes/journals/2026-07-09.md`:

```markdown
## Session 21:40–23:55
**Arc:** scaffold @aedl -close + first live close

- Merged wyrdglass #146 (QA waived) and budget-automation #9/#10 in the batched round
- Scaffolded session-close-workflow + /aedl-close + routing rows + config block

**Decisions:** all five plan defaults accepted; #7 re-scoped, not closed
**Carryover:** maintenance pass 2 queued; #146 on-device QA now happens on main
```

### Close invocation shapes

```
@aedl -close                → full loop, no merge question
@aedl -close --merge        → full loop + one squash-merge y/n at the end
@aedl -close --remote       → full loop, kit bundle emitted in the summary instead
```

## Change Log

- 1.3.0 — Close-command audit, applied live before the model session's own close (2026-08-21,
  Matter's directive at the stakeholder review). Four fixes from the audit's confirmed
  findings: **the close scales with the session** (light close for `light`; the computed
  weight was being ignored); **usage-row v2 schema** (7-column header matching what the close
  actually writes — the 4-column header survived three 7-column rows unnoticed, proof of no
  reader — plus one-line descriptions and a Scale·Lane tag); **HANDOFF budget** (≤40 lines,
  tracker-cited, pointer-not-copy); **exchange inbound backlog reported at every close**. The
  two write-only arms (usage log, observe time-log) gained a named consumer: `-maintain`
  Phase A item 7.
- 1.2.0 — Project-repo profile (2026-08-14, mn#19 done-when 2 / audit gap G3). `profile:
  "project"` gives kit-provisioned repos a REAL close instead of the polite decline:
  journal/usage arms unavailable by contract, parking lot degrades to the HANDOFF
  open-threads block, sync degrades to plain git on the current branch, `--merge`
  declines toward the PR flow. The kit now ships this skill + `/aedl-close` + a
  pre-filled `session_close:` block in `workspace.example.yml`. Driven by the worldloom
  proxy-close failure (2026-08-13).
- 1.1.0 — Agent-exchange drain promotions (2026-07-25, Matter's call). Three peer learnings
  folded into the process: **step 1b, the pre-session orphan sweep** — "what's dirty now" is
  not "what belongs to this session," and pre-session leftovers had been riding through close
  after close here (three untracked paths survived multiple closes as live proof); **scoped
  reconstruction** — default to the session being closed, not the broadest available window,
  since the loop is meant to run often; and **degrade dispositions** — a down dependency gets
  skip / skip-with-marker / pause-and-retry offered in the harvest, never a unilateral skip,
  because on an outward-writing arm a silent skip is indistinguishable from a successful run.
  Sources: peer notes `2026-07-23-1535`, `2026-07-24-0900`, `2026-07-24-0913`,
  `2026-07-23-1536`, `2026-07-20-1031`.
- 1.0.0 - Scaffolded 2026-07-09 from `docs/aedl-close-plan.md` via `aedl-command-scaffold`;
  all five harvest defaults accepted (per-session journal sections; doctrinal session end;
  #7 re-scoped; P2.11 deferred to v2; memory approval inside the single harvest round).
