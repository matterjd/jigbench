#!/bin/bash
# Delegation work log — the SINGLE sanitizing append path (issue #4).
# Every worklog line is written through here, so log-injection and secrets-in-log
# defenses live in ONE place. Callers: the guard hooks (block / peer-allowed / expiry),
# release-lock.sh (released), and the delegation skill at its checkpoints
# (created / lock-set / spawn / report).
#
#   Usage: worklog-append.sh [--once] <delegation_id> <event> [detail...]
#     --once   append only if an identical <event>: <detail> line is not already present
#              (idempotent — for lock-set / peer-allowed / expiry, which must not spam).
#
# SECURITY (the risks #4/#5 flagged for this feature):
#   * path traversal — delegation_id is reduced to [A-Za-z0-9._-]; any '..' -> "_unscoped",
#     so a crafted id can never escape delegations/.
#   * log injection — CR/LF and other control chars in detail are stripped, so a
#     worker-influenced string (e.g. the offending command) cannot forge a second line.
#   * secrets in log — common secret shapes (PEM keys, Bearer tokens, key=value secrets,
#     AWS/GitHub keys, long hex/base64 blobs incl. the release hash) are redacted first.
#   * fail-safe — every internal failure exits 0 without writing garbage. A logging error
#     must NEVER change an enforcement decision in the calling guard.
set -u

ONCE=""
if [ "${1:-}" = "--once" ]; then ONCE=1; shift; fi
RAW_ID="${1:-}"; EVENT="${2:-event}"
shift 2 2>/dev/null || true
DETAIL="$*"

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0

# delegation_id: strict charset, no separators; neutralize traversal.
DID=$(printf '%s' "$RAW_ID" | tr -cd 'A-Za-z0-9._-')
case "$DID" in ""|*..*) DID="_unscoped" ;; esac
# event: a single safe token.
EV=$(printf '%s' "$EVENT" | tr -cd 'A-Za-z0-9._-'); [ -n "$EV" ] || EV="event"

LOGDIR="$ROOT/delegations/$DID"
LOGFILE="$LOGDIR/worklog.md"

# Redact secrets on the raw text FIRST (before control-char stripping can split a token) via the
# canonical filter, then remove newlines/other control chars, collapse whitespace, and cap length.
REDACT="$(dirname "$0")/redact-secrets.sh"
CLEAN=$(printf '%s' "$DETAIL" | bash "$REDACT" 2>/dev/null \
  | tr -d '\r\n' | tr -c '\11\40-\176' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')
MAX=500
[ "${#CLEAN}" -gt "$MAX" ] && CLEAN="${CLEAN:0:$MAX}…"

# tier context (best-effort) from this delegation's own lock file (multi-lock era).
LOCK="$ROOT/config/delegation-locks/$DID.yml"
TIER="?"
if [ -f "$LOCK" ]; then
  T=$(grep -E '^tier:' "$LOCK" | head -n1 | sed -E 's/^tier:[[:space:]]*//' | tr -d '"' | tr -d '\r')
  [ -n "$T" ] && TIER="$T"
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LINE="$TS  ${DID}  ${TIER}  ${EV}: ${CLEAN}"

mkdir -p "$LOGDIR" 2>/dev/null || exit 0
if [ ! -f "$LOGFILE" ]; then
  { printf '# Delegation work log — %s\n' "$DID"
    printf '_Append-only, one plain-English line per event. Written only via worklog-append.sh (sanitized). Do not hand-edit._\n\n'
  } >> "$LOGFILE" 2>/dev/null || exit 0
fi
if [ -n "$ONCE" ] && grep -qF "  ${EV}: ${CLEAN}" "$LOGFILE" 2>/dev/null; then
  exit 0
fi
printf '%s\n' "$LINE" >> "$LOGFILE" 2>/dev/null || exit 0
exit 0
