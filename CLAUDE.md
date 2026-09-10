# CLAUDE.md

Read `AGENTS.md` first — it is the entry point for this repo.

**This repo carries its own AEDL control plane** (provisioned 2026-09-09 — `AEDL-INSTALL.md`,
`SUBAGENT-AUTHORIZATION.md`, `.claude/hooks/`). It used to be only a delegation target of the
matter-notes harness, with the guards living there; that is no longer true, and the difference
is load-bearing: a session launched **at this root** is now armed by the hooks in `.claude/`
rather than by whatever the launching repo happened to have. Verify with
`bash .claude/hooks/preflight-check.sh` — it prints whether enforcement will actually run — and
`bash .claude/aedl-kit-check.sh --source ../matter-notes` for whether the vendored copy is
current. matter-notes remains the SOURCE of that control plane: fix a guard there, rebuild the
kit, re-provision here. Never edit `.claude/hooks/` in this repo to make something pass.

**`SUBAGENT-AUTHORIZATION.md` ships unsigned and grants nothing** (`scope_confirmed: false`).
Delegation in this repo is inert until Matter signs a tier into it — that is deliberate, and an
agent must never sign it for him.

Never commit to `main` directly. Use branches and pull requests.
