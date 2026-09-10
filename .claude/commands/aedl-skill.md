---
description: Scaffold a new @aedl command — generate a conventions-compliant skill, its /aedl-<name> slash command, and the AGENTS.md + CLAUDE.md routing rows in one pass. Leaves files untracked (no auto-commit).
argument-hint: <command name + purpose, e.g. "search — answer questions from the vault, read-only">
allowed-tools: Read, Glob, Grep, Write, Edit
---

Execute the `aedl-command-scaffold` skill at `.claude/skills/aedl-command-scaffold/SKILL.md`.

New command spec: $ARGUMENTS

Follow the skill's Standard Process: gather name / purpose / read-only-vs-mutating / args (infer defaults, ask only if unclear); read a sibling skill + slash command and match its structure; write the new skill under `.claude/skills/<descriptive-name>/SKILL.md` (a portable, tool-agnostic name — **not** `aedl-<name>`); write `.claude/commands/aedl-<name>.md` with description + argument-hint + narrow allowed-tools; add routing rows to BOTH `AGENTS.md` (source of truth) and the `CLAUDE.md` quick-reference table. Report files created and offer `/aedl-sync` — do NOT commit or push.
