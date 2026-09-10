---
description: Set up and operate the read-only observation kit (aedl -observe) — time logs + portable memory observations written ONLY to a standalone kit directory, modeled on the T4 readonly/logging tier. Subcommands - setup (guided terminal wizard, non-expert friendly), log (end-of-session entry + memory harvest), status (kit health, writes nothing). Claude-agnostic kit; provably non-intrusive.
argument-hint: [setup | log | status]
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Bash(git status:*), Bash(git log:*)
---

Execute the `aedl-observation-layer` skill at `.claude/skills/aedl-observation-layer/SKILL.md`.

Subcommand (if provided): $ARGUMENTS

The process (default to `status` when no subcommand is given and a kit exists; otherwise offer `setup`):
1. **setup** — guided wizard, one step at a time (why → what → confirm): choose kit location
   (default `~/aedl-observe`, outside any repo), create `OBSERVE.md` (from the skill's
   template, placeholders filled) + `observe.yml` + `time-log.md` + `memory/INDEX.md`,
   optionally register observed repos, walk the §2 rules, run the live non-intrusion proof
   (`git status --porcelain` before/after), teach the two portable driver phrases.
2. **log** — locate the kit, reconstruct the session read-only, append time-log row(s)
   (append-only, no proprietary content), propose + write approved memory observations,
   echo back exactly what was written.
3. **status** — kit health + today's rows + memory count + optional read-only repo
   one-liners. Writes nothing.

Hard rules: the kit directory is the ONLY write target — never write to observed repos, this
repo, `.claude/hooks/`, or any `settings*`; read-only shell only; no secrets or proprietary
content in kit files; if a request needs more than read+log, stop and report.
