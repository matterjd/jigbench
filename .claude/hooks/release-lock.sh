#!/bin/bash
# Brain-side delegation lock release, NONCE-GATED, BY DELEGATION ID (multi-lock era).
#   Usage: bash .claude/hooks/release-lock.sh <delegation_id> <release_token>
#
# Deletes config/delegation-locks/<delegation_id>.yml only if sha256(<release_token>)
# matches that lock's `release_hash`. The token is generated at activation and held ONLY in
# the activating brain's context — never written to a readable file. A worker can read
# `release_hash` but cannot reverse it, so it cannot release the lock through this path.
# Releasing DELETES the lock file — delegations/<id>/ stays as the durable record; other
# sessions' locks are untouched.
#
# This command references .claude/hooks/ but carries no write TARGET, so the bash guard's
# target-based control-plane rule allows it; the lock deletion is file I/O inside this
# script (no hook fires).
#
# LIMIT (documented): the nonce hardens the OFFICIAL release path only. It does NOT close
# the indirection bypass (a worker that writes a helper script and runs it can edit the lock
# dir directly). Real containment needs OS-level isolation. The mandatory lock `expiry` is
# the backstop for any unreleased lock; activate-lock.sh prunes expired locks. Stale-lock
# recovery with a LOST token is a human action in a plain terminal — see the maintenance
# runbook in SUBAGENT-AUTHORIZATION.md.
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || { echo "release-lock: no project root"; exit 1; }
LOCKS_DIR="$ROOT/config/delegation-locks"

RAW_ID="${1:-}"; TOKEN="${2:-}"
[ -n "$RAW_ID" ] || { echo "release-lock: REFUSED — usage: release-lock.sh <delegation_id> <release_token>"; exit 2; }
DID=$(printf '%s' "$RAW_ID" | tr -cd 'A-Za-z0-9._-')
case "$DID" in ""|*..*) echo "release-lock: REFUSED — bad delegation id"; exit 2 ;; esac

LOCK="$LOCKS_DIR/$DID.yml"
[ -f "$LOCK" ] || { echo "release-lock: no such active lock ($DID) — nothing to do"; exit 0; }
val() { grep -E "^$1:" "$LOCK" | head -n1 | sed -E "s/^$1:[[:space:]]*//" | tr -d '"' | tr -d '\r'; }

WANT=$(val release_hash)
[ -n "$WANT" ] || { echo "release-lock: REFUSED — lock has no release_hash (malformed; recover via the maintenance runbook, not this script)"; exit 2; }
[ -n "$TOKEN" ] || { echo "release-lock: REFUSED — release token required"; exit 2; }
GOT=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(String(process.argv[1])).digest("hex"))' "$TOKEN" 2>/dev/null)
[ "$GOT" = "$WANT" ] || { echo "release-lock: REFUSED — token mismatch"; exit 2; }

# Narrate the release into the work log BEFORE deleting the lock, while tier is still readable.
bash "$ROOT/.claude/hooks/worklog-append.sh" "$DID" released "delegation lock released (token verified); owner unconfined" >/dev/null 2>&1 || true

rm -f "$LOCK"
REMAIN=$(ls "$LOCKS_DIR"/*.yml 2>/dev/null | wc -l | tr -d ' ')
echo "release-lock: lock $DID released (deleted); $REMAIN other active lock file(s) remain"
