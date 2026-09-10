---
name: aedl-observation-layer
description: Set up and operate a read-only observation kit — time logs + portable memory observations recorded to a standalone kit directory, never touching the observed work (modeled on the T4 readonly/logging tier). Use for the @aedl -observe command (/aedl-observe) and its subcommands — "setup" (step-by-step terminal wizard for a non-expert, creates the kit anywhere, works on any machine), "log" (end-of-session time-log entry + memory harvest), "status" (kit health + today's activity) — or requests like "set up the observation layer", "log this session to the observe kit", "observation kit status".
---

# AEDL Observation Layer

A **read-only observation-log layer** for any machine and any AI agent. It records **time
logs** (when/where/what work happened) and **memory observations** (durable facts worth
keeping across sessions) into a small, self-describing **kit directory** — and provably
never touches the work it observes.

Two design anchors:

- **The T4 arrangement.** The layer is modeled on tier **T4 (readonly / logging)** of
  [`SUBAGENT-AUTHORIZATION.md`](../../../SUBAGENT-AUTHORIZATION.md): read and report only —
  with exactly one narrowing amendment: the *reporting target* is the kit directory, which is
  the **sole writable location**. Everything else on the machine is read-only to this skill.
  Non-intrusion is provable: `git status --porcelain` in any observed repo is identical
  before and after an observation pass.
- **Claude-agnostic by construction.** The kit carries its own operating doctrine
  (`OBSERVE.md`, generated from [`templates/OBSERVE.md`](templates/OBSERVE.md)) that ANY
  agent can be pointed at — no hooks, no installer, no Claude Code dependency. This skill is
  merely the convenient driver for this workspace; at a different machine (e.g. work, where
  tooling differs), the kit operates standalone: *"Read `<kit>/OBSERVE.md` and follow it."*

## When To Use

- `@aedl -observe setup` / `/aedl-observe setup` — first-time creation of a kit on this or
  any machine, via the guided terminal wizard.
- `@aedl -observe log` — end of a working session: append a time-log row and harvest
  memory-worthy observations.
- `@aedl -observe status` — kit health + today's activity + (optional) read-only repo
  status context.
- Do **not** use it to: journal narrative prose (that is `@aedl -journal`), log AI usage
  into the notes vault (that is `ai-usage-log` — the vault-coupled sibling), or modify
  anything in an observed repo (nothing in this skill writes outside the kit, ever).

## Inputs & Resolution

| Input | Resolved from |
|---|---|
| Kit location | `setup` asks (default `~/aedl-observe`, i.e. `%USERPROFILE%\aedl-observe`); `log`/`status` locate it via the config marker (below) or ask once |
| Operator, machine label, default agent | `observe.yml` in the kit |
| Observed repos (optional) | `observed_repos:` in `observe.yml` |

**Kit discovery for `log`/`status`:** check `~/aedl-observe/observe.yml` first; if absent,
ask the user where their kit is and remember it for the session. Never scan the disk.

## Standard Process

### `setup` — the guided wizard (assume a non-expert at the keyboard)

Wizard conduct rules, before the steps: **one step at a time** — explain *why*, then do the
*what*, then show the result and get an explicit OK before moving on. Plain language, no
jargon without a one-line gloss. Every step is reversible and says so. If the user hesitates,
answer; never rush past a confirmation.

1. **Orient.** Explain in 3–4 sentences what will be created: one small folder holding a
   rulebook (`OBSERVE.md`), a settings file (`observe.yml`), a running time sheet
   (`time-log.md`), and a `memory/` folder for durable notes — and the promise: *nothing
   outside that folder is ever written to*. Confirm they want to proceed.
2. **Choose the location.** Offer the default (`~/aedl-observe` — spell out the real
   resolved path for their OS) and explain why outside any repo: the kit must never ride
   along into anyone's git history. Accept an alternative path if they prefer. Confirm the
   final path back to them before creating anything.
3. **Create the kit skeleton.** Create the folder, then, one file at a time (say what each
   is as you write it):
   - `OBSERVE.md` — from [`templates/OBSERVE.md`](templates/OBSERVE.md), placeholders
     filled (`{{USER}}`, `{{MACHINE}}`, `{{CREATED}}`, `{{KIT_PATH}}`). Fill with
     **literal string replacement** (e.g. a Write after Read, or Python `str.replace`) —
     never `sed`, whose replacement escapes mangle Windows backslash paths.
   - `observe.yml` — from [`templates/observe.example.yml`](templates/observe.example.yml),
     filled from three quick questions: their name, a machine label (suggest
     `personal-desktop` / `work-laptop` style), default agent label.
   - `time-log.md` — header + empty table (columns per `OBSERVE.md` §3).
   - `memory/INDEX.md` — header + "no entries yet" line.
4. **Optional: register observed repos.** Explain this is only for `status` context (a
   read-only "where things stand" summary) and entirely skippable. If wanted, take
   name+path pairs into `observed_repos:`.
5. **Walk the rulebook.** Open `OBSERVE.md` §2 with them and read the six rules aloud
   (summarized) — this is the moment the human learns what the layer may and may never do.
6. **Prove non-intrusion (live).** If any git repo is handy: run `git status --porcelain`
   there, do a trivial observation (`status` pass), run it again, show the outputs are
   identical. Explain that this same check is theirs to run any time they want proof.
7. **Teach the two daily moves.** Show the exact phrases that drive the kit from ANY agent:
   *"Read `<kit>/OBSERVE.md` and follow it — log the session we just finished"* and
   *"…run the status check."* Note that on this machine `/aedl-observe log|status` does the
   same thing. Done — recap what exists and where.

### `log` — end-of-session entry

1. Locate the kit (Inputs & Resolution) and read `observe.yml` + `OBSERVE.md`.
2. Reconstruct the session **read-only**: what was worked on (this conversation), the
   working window (first/last activity; read-only `git log --since` in observed repos may
   inform it), which repo/project, which agent.
3. Append one row per distinct work block to `time-log.md` per `OBSERVE.md` §3 —
   append-only, never reorder. No proprietary paths or content in the description.
4. **Memory harvest:** propose 0–n durable observations (per `OBSERVE.md` §4 bar — will it
   matter next session?). Show the proposals; on approval write `memory/<slug>.md` +
   INDEX line each. Check the index for an existing entry to update instead of duplicating.
5. Echo back exactly what was appended/created, as paths + rows.

### `status` — health & today

Run `OBSERVE.md` §5 verbatim: kit files present → config parses and matches this machine →
last-entry age → today's row count + memory count → optional read-only one-liners per
observed repo (branch + clean/dirty). Output as a short table. Writes nothing.

## Expected Output

- `setup`: a complete kit at the confirmed path (4 files + `memory/`), the user having
  confirmed each step, seen the live non-intrusion proof, and holding the two portable
  driver phrases.
- `log`: the appended time-log row(s) and any new/updated memory files, echoed verbatim.
- `status`: the health table; zero writes.

## Guardrails

- **The kit directory is the only write target.** Never create/edit/delete anything else —
  not in observed repos, not in this repo, not in agent config. This mirrors HARD RULE 4's
  spirit with the kit as the one authorized zone.
- **Never** touch `.claude/hooks/`, any `.claude/settings*`, `SUBAGENT-AUTHORIZATION.md`,
  or delegation locks/grants — the control plane is out of bounds to this skill entirely
  (§6 of the authorization sheet governs those).
- **Read-only shell only:** `git status/log/diff/show`, directory listings. No mutating git,
  no installs, no network writes.
- **No secrets, no proprietary content** in any kit file (`OBSERVE.md` §2.5). Titles and
  ticket ids, not code or data. This is what makes the kit safe to run at a workplace.
- **The kit lives outside every repo.** If a user insists on an in-repo path, warn that it
  will enter git history and require an explicit second confirmation.
- If a request under this skill needs *more* than the arrangement allows, **stop and
  report** — do not escalate the tier in place (that is `@aedl -delegate`'s job, under a
  signed grant).

## Anti-Patterns

- Logging by editing an observed repo's files (e.g. dropping a log into the repo) — the kit
  is the log's only home.
- Rewriting or reordering existing time-log rows ("cleaning up the table").
- Recording session trivia or code content as "memory" — the bar is durable, cross-session
  usefulness.
- Making `setup` a silent batch run — the wizard's explanations and confirmations ARE the
  product for a non-expert; do not compress them away unasked.
- Treating this skill as an enforcement mechanism. It is doctrine + spot-check (provable,
  not mechanically enforced); mechanical enforcement belongs to the delegation guards.

## Learning Notes

- 2026-07-05 (first kit, personal-desktop): `sed` substitution of a Windows path into the
  template produced garbage (`\U` case-folding) — placeholder fills must be literal string
  replacement. Setup step 3 now says so. Full smoke passed: setup → log (session row + 2
  memory observations) → status, with the §2.4 non-intrusion diff run live (identical
  before/after `git status --porcelain` in matter-notes).

## Related

- `SUBAGENT-AUTHORIZATION.md` — the T4 tier this arrangement is modeled on.
- `ai-usage-log` — the vault-coupled sibling (per-tool usage table inside `notes/`); this
  kit is the portable, machine-local counterpart with time windows + memory.
- `daily-work-journal` — narrative journaling in the vault; the time log is not a journal.
