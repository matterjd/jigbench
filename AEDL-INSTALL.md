# AEDL kit — provisioning an individual repo

This kit installs the **Agentic Engineering Development Lifecycle** harness into a single
code repository: mechanical delegation guards, the tier-grant governance sheet, and the
engineering command surface (`/aedl-lifecycle`, `/aedl-delegate`, `/aedl-review-cycle`,
`/aedl-maintain`, `/aedl-observe`, `/aedl-skill`, `/aedl-close`). The repo becomes its
**own control plane** — no notes vault or external workspace required.

The framing: the agent supplies capability; the harness supplies **armor** (guards),
**instruments** (worklogs/evidence), and **doctrine** (the lifecycle).

## Why a snapshot — and how you find out it has gone stale

The kit **vendors** the guards: your repo gets its own copy and depends on nothing external
once installed. That is deliberate. The guards run as `PreToolUse` hooks on *every* tool
call, so a guard that had to resolve a remote source would either fail open when the source
is unreachable (no armor) or fail shut (no work) — both worse than a copy that is slightly
behind. Vendoring is also what the harness settled on for its stage-skills, after an upstream
refresh deleted one out from under a build.

The cost is real: **nothing auto-updates, and a vendored copy cannot notice the source moving
on.** So the kit ships a fingerprint instead of a promise. `KIT-MANIFEST.txt` records the
source commit, the **git tree SHA of `.claude/hooks`**, and a SHA-256 for every enforcement
file. From your repo:

```bash
bash .claude/aedl-kit-check.sh --source /path/to/source-harness
```

- **integrity** — do the installed hooks still match what shipped? (catches a partial unpack
  or a local edit)
- **staleness** — `CURRENT` if the source's `git rev-parse HEAD:.claude/hooks` equals the
  stamped `hooks-tree-sha`, `STALE` if it moved, `UNKNOWN` with no source to compare against.
  Exit `0` / `1` / `2` respectively, so it can gate a script.

The tree SHA changes if and only if an enforcement file changes — unrelated commits to the
source repo do not move it. **Re-run this after any control-plane upgrade in the source**, and
whenever a delegation is about to run against armor you have not verified lately. On the
source side, `aedl-kit/PROVISIONED.md` lists the repos owed a re-provision.

> **A kit built before 2026-08-02** carries no fingerprint and is reported `STALE` on sight —
> correctly, since nothing about it can be verified. Re-provision it.

> **Line endings.** If `KIT-MANIFEST.txt` says `payload-line-endings: CRLF`, the kit was built
> on Windows without `.gitattributes` and its scripts are **Windows/Git Bash only** — under GNU
> bash they are a syntax error, not a warning. Rebuild the kit from a source checkout with LF
> endings before provisioning a Linux or macOS repo.

## What you need first

- **git**, and the **gh** CLI authenticated to GitHub (`gh auth status`) — the tracker
  adapter and PR flows use it.
- An AI coding agent that supports **tool-call hooks** (e.g. Claude Code) for mechanical
  enforcement. Without hook support the harness still works at doctrine level, but every
  skill's *refuse-if-unenforced* rule applies: delegations must be declined or run
  human-supervised. (Multi-agent enforcement adapters are a roadmap item.)
- On Windows, **Git Bash** (the hooks are bash scripts; Claude Code invokes them via `bash`).

## Install — one step at a time

Work from the target repo's root. Nothing here touches any other repo.

1. **Unpack the payload** (the folder holding this file) **into the repo root**, preserving
   paths. You should end up with `.claude/hooks/`, `.claude/commands/aedl-*.md`,
   `.claude/skills/…`, `SUBAGENT-AUTHORIZATION.md`, `config/…`, and this file.
   - If a path already exists in your repo, **stop and compare before overwriting** —
     especially `.claude/settings.json` (next step handles it).

2. **Wire the hooks.** The kit ships `.claude/settings.fragment.json` — the full hook
   surface: the two `PreToolUse` guards, the `SessionStart` open ritual, the `Stop`
   close-loop reminder, and the `PostToolUse` QA gate (config-gated — inert until your
   `workspace.yml` carries an enabled `qa_gate:` block, see step 3).
   - No existing `.claude/settings.json`? Rename the fragment to `settings.json`. Done.
   - Existing settings? **Merge by hand**: copy the `hooks` entries into your file (keep
     your other settings). Never blind-overwrite — your permissions and other hooks live
     there. (`settings.local.json` is a separate file and coexists untouched.)

3. **Create your local config.** Copy `config/workspace.example.yml` →
   `config/workspace.yml` and fill it in: your name/email, the repo's **exact on-disk
   path**, and the tracker field map (copy
   `.claude/skills/adapters/issue-tracker/github-gh.field-map.example.yml` →
   `config/field-map.yml` and fill in your repo/labels).
   - The example ships two delivery-team blocks pre-filled: `session_close:` in the
     **project profile** (`@aedl -close` completes here instead of declining — the
     vault-coupled arms degrade per the skill's Project-Repo Profile table) and
     `qa_gate:` (point `command` at this repo's real fast suite — the convention is a
     repo-tracked `scripts/qa-gate.sh` listing your suites, slow legs behind a flag).

4. **Gitignore the local/runtime files.** Add to the repo's `.gitignore`:

   ```gitignore
   config/workspace.yml
   config/field-map.yml
   config/delegation-locks/
   delegations/*/worklog*.jsonl
   review-cycles/
   ```

   (Grants + reports under `delegations/` are yours to track or ignore — the source
   harness tracks them as an audit trail. **Never** commit a filled workspace.yml.)

5. **Verify enforcement.** From the repo root:

   ```bash
   bash .claude/hooks/tests/verify-guards.sh     # full guard regression (temp repos, read-only to yours)
   bash .claude/hooks/tests/verify-worklog.sh    # worklog helper suite
   bash .claude/hooks/tests/verify-qa-gate.sh    # QA-gate hook suite (temp repos)
   bash .claude/hooks/preflight-check.sh         # refuse-if-unenforced self-check
   bash .claude/aedl-kit-check.sh                # integrity + staleness of the vendored armor
   ```

   All green = the armor is live. A failure means stop and fix before any delegation.
   The suites prove the armor *works*; `aedl-kit-check.sh` proves it is the armor you
   meant to install and that the source has not moved past it. **Green suites on a stale
   guard are still green** — that is what the fourth command is for.
   - **If exactly the preflight cases fail** (`preflight: equal/ahead/no origin`), you
     almost certainly skipped step 2 — the suite requires `.claude/settings.json` to
     exist (that's the refuse-if-unenforced check doing its job).

6. **Read the rule sheet.** Open `SUBAGENT-AUTHORIZATION.md` — the tier table (T1–T4) and
   the five HARD RULES. As shipped it is **unsigned and grants nothing**; each delegation
   gets its own signed copy (the `/aedl-delegate` flow walks you through it).

7. **Smoke the surface.** In your agent, try `/aedl-observe` (read-only status/logging —
   safe first contact), then `/aedl-lifecycle <small objective>` when ready for a real loop.

## What's in the box (and what deliberately isn't)

See `manifest.yml` in the kit source (mirrored in `KIT-MANIFEST.txt`). Included:
enforcement hooks (verbatim), the governance sheet template, the engineering commands +
their skills, the GitHub issue-tracker adapter, and the **contract-carrying stage-skills**
— `aedl-discovery` (stage 1), `to-tickets` (stage 3), `tdd` (stages 5–6) — plus the
stage-4 gate artifact (`templates/execution-plan.md`) and the
`stage-skill-contract.md` they all implement. Stage 2's `to-spec` ships from the global
skill set, since it carries no contract yet. Also included: the **delivery-team templates**
(`templates/QUALITY.md`, `templates/quality-closing-report.md`, `templates/team/`) — shipped
to the target's `templates/`, instantiated by the team on first use, never written to root
by the provisioner (DELIVERY-TEAM.md §5 + §8).

> The three stage-skills ship from **this repo's** copies, not the global ones. That is
> deliberate: the vendored copy is the AEDL source of truth, and an upstream refresh on
> 2026-07-25 deleted `to-issues` outright (merged into `to-tickets`) — which would have
> hard-failed a kit build sourcing it from `~/.claude/skills/`.

Also included since mn#19: the **session-close surface** (`/aedl-close` +
`session-close-workflow`) — in a provisioned repo the skill runs its **project profile**
(vault-less: journal/usage arms off by contract, parking lot → HANDOFF open threads,
sync = plain git on the current branch, `--merge` → the PR flow) — and the **QA-gate
hook** (`qa-gate.sh` + its test suite), which runs your configured suite when a commit
lands.

**Excluded:** everything notes-vault-coupled (sync/journal/note/merge/
summary/exchange/art and their skills) — an individual repo is not a notes vault. Some
skill cross-references to those excluded commands are inert here; they degrade to no-ops
or "not installed" and are safe to ignore.

## Uninstall

Delete what step 1 added (`.claude/hooks/`, the `aedl-*` commands, the listed skills,
`SUBAGENT-AUTHORIZATION.md`, the config examples) and remove the two hook entries from
`.claude/settings.json`. The harness keeps no state outside the repo besides the optional
`~/aedl-observe` kit, which is independent and yours.
