#!/bin/bash
# Delegation preflight: verify enforcement is actually WIRED in this work-tree BEFORE a
# worker is spawned. Prevents a silent unenforced delegation — the failure mode the
# 2026-07-03 audit run hit (work branch cut from a main that lacked the hooks).
#   Usage: bash .claude/hooks/preflight-check.sh [<work_repo_path>]
#   exit 0 = enforcement is live-capable here; non-zero + reason = DO NOT delegate.
#
# FRESHNESS (C11): a work-tree that is BEHIND origin/main on the enforcement files would
# run guards older than what main has landed — refuse. Directional by design: a branch
# AHEAD of origin/main (guard development itself) passes. With no reachable origin the
# check degrades to a WARN (offline is not a reason to block a local delegation).
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || { echo "preflight: FAIL — no project root"; exit 1; }
fail(){ echo "preflight: FAIL — $1 (do NOT delegate; enforcement would not run)"; exit 1; }

[ -f "$ROOT/.claude/hooks/delegation-guard-bash.sh" ]  || fail "missing delegation-guard-bash.sh"
[ -f "$ROOT/.claude/hooks/delegation-guard-write.sh" ] || fail "missing delegation-guard-write.sh"
[ -f "$ROOT/.claude/hooks/release-lock.sh" ]           || fail "missing release-lock.sh"
[ -f "$ROOT/.claude/hooks/activate-lock.sh" ]          || fail "missing activate-lock.sh"
[ -f "$ROOT/.claude/hooks/lib/locks.js" ]              || fail "missing lib/locks.js"
[ -f "$ROOT/.claude/hooks/lib/write-targets.js" ]      || fail "missing lib/write-targets.js"
[ -f "$ROOT/.claude/hooks/lib/classify-write.js" ]     || fail "missing lib/classify-write.js"
[ -f "$ROOT/.claude/settings.json" ]                   || fail "missing .claude/settings.json"
grep -q "delegation-guard-bash.sh"  "$ROOT/.claude/settings.json" || fail "settings.json does not register the Bash guard"
grep -q "delegation-guard-write.sh" "$ROOT/.claude/settings.json" || fail "settings.json does not register the Write guard"
command -v node >/dev/null 2>&1 || fail "node not found (guards parse tool input with node)"

# ---- freshness of the enforcement files vs origin/main (C11) ----
if git -C "$ROOT" rev-parse -q --verify origin/main >/dev/null 2>&1; then
  git -C "$ROOT" fetch -q origin main 2>/dev/null \
    || echo "preflight: WARN — fetch failed (offline?); freshness checked against last-known origin/main"
  BEHIND=$(git -C "$ROOT" rev-list HEAD..origin/main -- .claude/hooks .claude/settings.json 2>/dev/null | head -1)
  [ -z "$BEHIND" ] || fail "work-tree is BEHIND origin/main on enforcement files — re-cut the branch from a base carrying the current guards"
else
  echo "preflight: WARN — no origin/main; enforcement freshness unverifiable (local-only repo?)"
fi

# ---- optional: sanity on the delegation's work repo ----
WORKP="${1:-}"
if [ -n "$WORKP" ]; then
  [ -d "$WORKP" ] || fail "work_repo_path '$WORKP' does not exist"
  git -C "$WORKP" rev-parse --git-dir >/dev/null 2>&1 || fail "work_repo_path '$WORKP' is not a git repository"
fi

echo "preflight: OK — guards + libs present + registered, activate/release present, node available, enforcement current. Enforcement will run."
exit 0
