#!/bin/bash
# Tier-aware delegation guard for Write/Edit/MultiEdit (multi-lock era). PORTABLE: the
# CONTROL root is $CLAUDE_PROJECT_DIR (fallback: git toplevel) — the lock DIRECTORY
# (config/delegation-locks/), hooks, settings and grant live here, always read-only under
# any active delegation. Each lock file confines its OWNING session (owner_session ==
# caller's CLAUDE_CODE_SESSION_ID, which a spawned worker inherits) to that lock's
# work_repo_path; a session owning NO lock (pure peer) is free everywhere EXCEPT the other
# locks' zones + the control plane. Ambiguity (no owner / no session id) stays confined.
# Zone classification runs in Node: lib/classify-write.js (see its header for the verdicts).
# No lock dir / no lock files -> allow (brain's normal state).
# Parse failure or unexpected verdict while lock files exist -> fail CLOSED.
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0            # no locatable project root => no delegation context
LOCKS_DIR="$ROOT/config/delegation-locks"
[ -d "$LOCKS_DIR" ] || exit 0
# P1: builtin glob (PATH-independent, fixes the shed-PATH fail-open) + stdin drained late.
FOUND=""; for _f in "$LOCKS_DIR"/*.yml; do [ -e "$_f" ] && { FOUND=1; break; }; done
[ -n "$FOUND" ] || exit 0
INPUT=$(cat)
HOOKDIR=$(cd "$(dirname "$0")" && pwd)
SID="${CLAUDE_CODE_SESSION_ID:-}"

OUT=$(printf '%s' "$INPUT" | ROOT="$ROOT" LOCKS_DIR="$LOCKS_DIR" SID="$SID" node "$HOOKDIR/lib/classify-write.js" 2>/dev/null)
RC=$?

log_block() { # <did> <tier> <reason>
  local did="$1" tier="$2" reason="$3" logdir logfile line
  if [ -n "$did" ] && [ "$did" != "_unscoped" ]; then logdir="$ROOT/delegations/$did"; logfile="$logdir/blocked.log";
  else logdir="$ROOT/config"; logfile="$logdir/delegation-blocked.log"; fi
  mkdir -p "$logdir" 2>/dev/null
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) ${tier:-?} ${did:-none} BLOCKED: $reason"
  printf '%s\n' "$line" >> "$logfile" 2>/dev/null
  bash "$ROOT/.claude/hooks/worklog-append.sh" "${did:-_unscoped}" block "$reason" >/dev/null 2>&1 || true
}
block() { log_block "$1" "$2" "$3"; echo "BLOCKED (tier ${2:-?}): $3" >&2; exit 2; }

[ "$RC" -ne 0 ] && block "_unscoped" "?" "unparseable tool input (fail-closed)"

# Surface per-lock expiry lines, then act on the final verdict line.
while IFS=$'\t' read -r kind f1 f2; do
  [ "$kind" = "EXPIRED" ] || continue
  bash "$ROOT/.claude/hooks/worklog-append.sh" --once "$f1" expiry "lock expiry $f2 passed — treated inactive; owner no longer confined" >/dev/null 2>&1 || true
done <<< "$OUT"

V=$(printf '%s\n' "$OUT" | tail -n 1)
KIND=$(printf '%s' "$V" | cut -f1)
F2=$(printf '%s' "$V" | cut -f2)
F3=$(printf '%s' "$V" | cut -f3)

# Zone policy:                       lock owner                     pure peer
#   CONTROL   -> block (everyone — lock dir, hooks, settings, grant are read-only)
#   OWNWORK   -> allow (T4: block)   its own work zone              n/a
#   OTHERZONE -> block               another delegation's zone      n/a
#   OUTSIDE   -> block               containment                    n/a
#   SCRATCH   -> allow (T4: block)   its own per-session scratchpad (pass 8b)   n/a
#   PEERZONE  -> n/a                                                block (collision)
#   PEERELSE  -> n/a                                                allow (its own repo/vault)
case "$KIND" in
  OK|NOROOT|NOLOCKS) exit 0 ;;
  BADLOCK)   block "_unscoped" "?" "unreadable lock file '$F2' (fail-closed)" ;;
  CONTROL)   block "$F2" "$F3" "control-plane file is read-only under an active delegation" ;;
  OWNWORK)
    if [ "$F3" = "T4" ]; then block "$F2" "$F3" "T4 is read-only - file writes forbidden"; fi
    exit 0 ;;
  SCRATCH)
    if [ "$F3" = "T4" ]; then block "$F2" "$F3" "T4 is read-only - even its own scratchpad"; fi
    exit 0 ;;
  OTHERZONE) block "$F2" "$F3" "write into another delegation's work repo blocked (collision)" ;;
  OUTSIDE)   block "$F2" "$F3" "path outside repo boundary" ;;
  PEERZONE)  block "$F2" "$F3" "peer write into an active work repo blocked (collision)" ;;
  PEERELSE)
    IFS=',' read -ra PDIDS <<< "$F2"
    for d in "${PDIDS[@]}"; do
      bash "$ROOT/.claude/hooks/worklog-append.sh" --once "$d" peer-allowed "peer session ${SID:0:8} active — wrote outside the work zone, allowed (no collision)" >/dev/null 2>&1 || true
    done
    exit 0 ;;
  *) block "_unscoped" "?" "guard verdict error: '$V' (fail-closed)" ;;
esac
exit 0
