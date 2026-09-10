---
name: aedl-command-scaffold
description: Scaffold a new @aedl command in this repo — generate a conventions-compliant skill, its matching /aedl-<name> slash command, and a row in every routing table this repo has (CLAUDE.md always; AGENTS.md if present), all in one pass. Use when the user asks to "create an aedl command", "make a new @aedl -X", "turn this into an aedl command", or otherwise wants a new command wired up the standard way.
---

# aedl-command-scaffold

Creates a new `@aedl -<name>` command wired up the way every other command in this repo
is: a **skill** holding the process, a `/aedl-<name>` **slash command** that delegates to
it, and matching **routing rows** in whatever routing tables this repo keeps. This is the
meta-skill for adding commands consistently.

This skill is intentionally **identical across the personal (`matter-notes`) and work
(`Matter%20Notes`) vaults** — it adapts to each repo's facts rather than hardcoding one
repo's layout. Two things it detects instead of assuming:

- **Skill naming — match the siblings.** Look at the existing skills in
  `.claude/skills/`. If they are named `aedl-<verb>` (e.g. `aedl-sync-command`), name the
  new one the same way. If they use descriptive, tool-agnostic names (e.g. `sync-workflow`,
  `note-body-update`), use a descriptive name. Never mix conventions within one repo. The
  `aedl` binding lives in the command file and routing rows, not necessarily the skill name.
- **Routing tables — update every one that exists.** Always update the routing table in
  `CLAUDE.md`. **If the repo also has an `AGENTS.md`** with a "Command → Skill Routing"
  table (it is the source of truth where present), update that one too, and keep the two
  in agreement.

## When To Use

- "Create a `@aedl -<x>` command", "turn this workflow into an aedl command", "scaffold a
  new aedl command".
- After building an ad-hoc workflow the user wants to make reusable.

Do **not** use for editing an existing command (edit its files directly), or for skills
that are not part of the `@aedl` command surface.

## Inputs To Gather (ask only if not obvious from the request)

1. **Command name** — the `-<name>` verb (kebab, e.g. `search`). Drives `/aedl-<name>`
   and the routing rows.
2. **Skill name** — per this repo's convention (see above): `aedl-<name>` or a
   descriptive name matching the siblings.
3. **One-line purpose** — what it does and when to use it.
4. **Read-only vs. mutating** — drives `allowed-tools` and guardrails.
5. **Arguments** — free-text, folder scope, file target, subcommands, or none?

Infer defaults from the request and the sibling commands rather than over-asking.

## Standard Process

1. **Study a sibling first.** Read one existing skill of the same shape and its
   `.claude/commands/aedl-*.md`. Match section structure, tone, frontmatter, **and the
   skill-naming convention** — do not invent a new format or a new naming style.

2. **Write the skill** at `.claude/skills/<skill-name>/SKILL.md`:
   - Frontmatter with `name:` (= folder name) and a specific `description:` stating what
     it does + when to use it + the triggers (`@aedl -<name>`, `/aedl-<name>`, and
     natural-language phrasings). The description is what the model matches on.
   - Body: `## When To Use` (include what NOT to use it for), `## Standard Process`
     (numbered, concrete), `## Expected Output`, and any guardrails. Resolve org-specific
     values from config and adapters — never hardcode them.

3. **Write the slash command** at `.claude/commands/aedl-<name>.md`:
   - **Flat file, `aedl-` prefix in the filename — never an `aedl/` subdirectory.** Claude
     Code names a command by its filename only; subdirectories are *not* namespaced, so
     `.claude/commands/aedl/<name>.md` would register as `/<name>` and `/aedl:<name>` would
     never resolve. Keep every command a top-level `aedl-<name>.md` file → `/aedl-<name>`.
   - Frontmatter: `description:` (mirror the skill), `argument-hint:` (omit if no args),
     and `allowed-tools:` scoped to real needs. Read-only commands get `Read, Glob, Grep`
     only. Mutating commands add scoped `Write`, `Edit`, and specific `Bash(...)` entries
     — copy the exact grants from a sibling (`sync` for git, `story`/`epic` for tracker
     access, `exchange`/`summary` for `Bash(git:*)`).
   - Body: `Execute the <skill-name> skill at .claude/skills/<skill-name>/SKILL.md.`, then
     `$ARGUMENTS`, then a short numbered echo of the skill's process so the command is
     self-contained. If it mutates notes, end with "do NOT auto-sync — issue `/aedl-sync`."

4. **Register in every routing table present.** Add a `@aedl -<name>` row to the
   `CLAUDE.md` routing table (Purpose + skill name, noting any adapter dependency). **If
   an `AGENTS.md` routing table exists**, add the matching row there too and keep the two
   tables in agreement. Preserve each table's existing column alignment.

5. **Report, don't commit.** Per the Playbook safety rules, do NOT commit or push — the
   new files are left untracked. Summarize files created, then offer `/aedl-sync` and to
   save a memory that the new command exists.

## Guardrails

- **Never auto-commit or push.** New command files are left untracked for the user to
  sync via `@aedl -sync`.
- **Default read-only.** If the job is retrieval/reporting, lock `allowed-tools` to
  `Read, Glob, Grep` and say so in the skill's guardrails.
- **Match, don't reinvent.** Frontmatter keys, headings, delegation wording, and skill
  naming must match existing skills/commands. Consistency is the point.
- **Update all routing tables, not just one.** Where both `AGENTS.md` and `CLAUDE.md`
  have routing tables, they must stay in agreement.
- **One command per run** unless the user explicitly asks for several.

## Expected Output

- **Files created** — the skill path, the slash-command path, and every routing row added
  (CLAUDE.md, and AGENTS.md where present).
- **Wiring check** — confirm the skill `name`, folder, `/aedl-<name>`, and all routing
  rows agree.
- **Next steps** — offer `/aedl-sync`; note the files are currently untracked.

## Anti-Patterns

- Assuming one repo's layout — e.g. hardcoding `aedl-<name>` naming, or updating only
  CLAUDE.md in a repo that also has an AGENTS.md source-of-truth table.
- Mixing skill-naming conventions within a single repo.
- Committing the scaffolded files — promotion into git is the user's call via `-sync`.
