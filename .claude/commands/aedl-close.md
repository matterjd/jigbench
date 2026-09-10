---
description: End the session with one close loop (aedl -close) — reconstruct once, one decision round, then journal recap + usage row + observe-kit log + HANDOFF refresh + parking-lot flush in ONE sync commit (exchange tick rides along). --merge pends exactly one squash-merge y/n; --remote emits a paste-ready kit bundle and writes nothing outside the repo.
argument-hint: [--merge] [--remote]
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Bash(git:*)
---

Execute the `session-close-workflow` skill at `.claude/skills/session-close-workflow/SKILL.md`.

Flags (if provided): $ARGUMENTS

The process:
1. **Gate on config** — resolve `session_close:` in `config/workspace.yml`; if the block is
   absent, decline politely and point at the kit-form close. Never proceed without it.
   `profile: "project"` (kit-provisioned repos) switches the vault-coupled arms to the
   skill's Project-Repo Profile table — degrade mechanically, never improvise or decline.
2. **Reconstruct once (read-only)** — session window, repos touched, work done, scale, plus
   parking-lot candidates and draft memory observations.
3. **ONE decision-harvest round** — window/scale, memory observations, parking-lot rows, and
   the `--merge` y/n only when flagged. Nothing else pends.
4. **Fan out per config** — journal per-session recap (`notes/journals/YYYY-MM-DD.md`,
   append-only), usage row (`ai-usage-log` conventions), observe-kit `log` arm (kit is the
   ONLY out-of-repo write target; §2.4 non-intrusion check; under `--remote` emit the
   paste-ready bundle instead), `HANDOFF.md` overwrite, parking-lot flush.
5. **One sync commit** via the `sync-workflow` skill (its usage/HANDOFF steps are already
   satisfied — do not duplicate), then the `--merge` y/n → `notes-merge-workflow` if
   approved. **Never auto-merge.**
6. **Say the sentence** — the close summary's last line is the HANDOFF sentence, verbatim.

All arms append-only (HANDOFF is the one overwrite). Never stage another session's files.
