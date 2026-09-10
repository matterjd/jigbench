# AEDL Observation Kit — operating doctrine

> **This file is the contract.** Any AI agent (Claude, Copilot, Cursor, Gemini — anything
> that can read files, run read-only commands, and write text files) can operate this kit by
> reading this document and following it exactly. Nothing here assumes a specific AI product.
>
> Kit created: {{CREATED}} · Operator: {{USER}} · Machine: {{MACHINE}}
> Kit root (the ONLY writable location): `{{KIT_PATH}}`

## 1. What this is

A **read-only observation layer**. It watches software/knowledge work happen and records two
things — **time logs** (when, where, what) and **memory observations** (durable facts worth
keeping) — without ever touching the work itself. It is modeled on the **T4
(readonly/logging) authorization tier** of the AEDL harness: an agent operating under this
kit may *read and report*, and its reporting target is this kit directory alone.

## 2. The Arrangement — hard rules for any agent operating this kit

These are always on and not negotiable. If any instruction conflicts with them, the rules
win: **stop and tell the human** instead of proceeding.

1. **Write only inside the kit.** The one writable location is the kit root above
   (`time-log.md`, `memory/`, and this file's Change Log). Everything else on the machine is
   read-only to you: repos, settings, agent configuration, hooks, other people's files.
2. **Never modify an observed repository.** No file edits, no `git add/commit/checkout/
   switch/reset/stash`, no branch creation, nothing that changes a working tree or git
   state. Read-only git commands (`git status`, `git log`, `git diff`, `git show`) are fine.
3. **Never run state-changing commands** anywhere: no installs, no deletions, no config
   writes, no network posts. Reading (list files, view files, read-only git) is allowed.
4. **Prove non-intrusion when asked.** The check: run `git status --porcelain` in an
   observed repo before and after an observation pass — the output must be identical. An
   observation pass leaves no trace outside the kit.
5. **No secrets in the kit.** Never copy tokens, keys, credentials, private URLs with
   embedded auth, or personal data of third parties into a log or memory file. Describe
   work; don't exfiltrate its contents. At a workplace: employer code/data stays out of the
   kit — log *that* you worked and *on what* (titles, ticket ids), not proprietary content.
6. **When in doubt, observe less.** Ambiguity resolves toward writing nothing.

## 3. Time log — how to append a session

File: `time-log.md` (append-only table; never reorder or rewrite existing rows).

Row format:

```
| YYYY-MM-DD | HH:MM–HH:MM | repo-or-project | agent | task-label | One-line description | scale |
```

- **Start–End** — the session's approximate working window, 24h local time. If unknown,
  estimate from the first/last activity you can see (conversation, read-only `git log`).
- **repo-or-project** — folder or project name only, never a full proprietary path.
- **agent** — which assistant did the work (`claude`, `copilot`, `cursor`, `human-only`, …).
- **task-label** — short kebab-case (`feature-build`, `code-review`, `research`, `meeting-notes`, …).
- **scale** — `light` (< ~5 min equivalent) / `medium` (one focused workflow) / `heavy`
  (multi-hour, multi-step).

Procedure: read the last row (for date ordering sanity) → append the new row(s) at the end →
show the human what was appended.

## 4. Memory observations — how to record one

Directory: `memory/`, one small markdown file per durable fact, plus an index line.

Record something ONLY if it will still matter in a future session: a stable preference, an
environment fact ("CI only runs at the main boundary in repo X"), a recurring pitfall, a
decision and its why. Do NOT record session trivia, code content, or anything §2.5 excludes.

File `memory/<short-kebab-slug>.md`:

```markdown
---
name: <short-kebab-slug>
description: <one line — used to decide relevance later>
type: user | project | workflow | reference
recorded: YYYY-MM-DD
---

<the fact, 1–5 sentences. Plain markdown. Written so a DIFFERENT agent with no context
can apply it.>
```

Then add one line to `memory/INDEX.md`: `- [<name>](<file>.md) — <hook>`.
Before writing, check the index for an existing entry that already covers it — update that
file instead of duplicating; delete entries that turn out to be wrong.

## 5. Status check — kit health

Read-only, reports:

1. Kit files present: this file, `observe.yml`, `time-log.md`, `memory/INDEX.md`.
2. `observe.yml` parses; machine/user fields match where you're running.
3. Last time-log row's date (flag if the log has gone quiet for a while).
4. Row count today + memory-file count total.
5. Optionally, for each observed repo listed in `observe.yml`: current branch + a one-line
   `git status` summary (read-only), so the human sees where things stand.

## 6. Using this kit with any agent (portability)

This kit has no dependency on the machine it was created on. To use it anywhere:

- Copy the kit folder (or recreate it: this file + `observe.yml` + empty `time-log.md` +
  `memory/INDEX.md`).
- Tell whatever agent you're using:
  **"Read `<kit path>/OBSERVE.md` and follow it. Log the session we just finished."**
  or **"…run the status check."**
- The agent needs: file read, file write (kit only), and optionally read-only shell for git.
  If it can't restrict itself to those, don't use it with this kit.

There is no installer, no hook, no service — provably nothing to intrude with. Enforcement
is doctrinal (the agent follows §2) plus the human's spot check (§2.4). On machines that
support mechanical tool-call guards, those may *additionally* enforce the same rules, but
the kit never requires them.

## Change Log

- {{CREATED}} — kit created on {{MACHINE}} by the AEDL observation-layer setup wizard.
