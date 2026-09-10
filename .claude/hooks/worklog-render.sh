#!/bin/bash
# Render a delegation's work log as one human-readable, chronological timeline (issue #4).
# Backs the `@foam -delegate log <id>` subcommand. Read-only: prints, never writes.
#   Usage: worklog-render.sh <delegation_id>
# Merges the plain-English worklog.md with the raw blocked.log (the security ledger), so a
# reader sees lock-set -> spawn -> allows/blocks -> release in one place, even for the rare
# block that predates the worklog. Both are already timestamp-prefixed, so a stable sort by
# the leading ISO timestamp interleaves them correctly.
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || { echo "worklog-render: no project root" >&2; exit 1; }
RAW_ID="${1:-}"
DID=$(printf '%s' "$RAW_ID" | tr -cd 'A-Za-z0-9._-')
case "$DID" in ""|*..*) echo "worklog-render: usage: worklog-render.sh <delegation_id>" >&2; exit 2 ;; esac

DIR="$ROOT/delegations/$DID"
WL="$DIR/worklog.md"
BL="$DIR/blocked.log"
[ -d "$DIR" ] || { echo "worklog-render: no delegation '$DID' at $DIR" >&2; exit 2; }

echo "# Delegation timeline — $DID"
echo

TMP=$(mktemp) || exit 1
# worklog data lines (skip the markdown header/blurb: keep only ISO-timestamp lines).
[ -f "$WL" ] && grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$WL" >> "$TMP" 2>/dev/null
# blocked.log lines carry the raw blocked command (`… :: $COMMAND`), which can hold secrets and is
# UNREDACTED on disk. The rendered timeline is the human-readable artifact (copied into tickets), so
# scrub it through the same canonical filter before printing. Tag each line so a reader can tell the
# raw security ledger from the narrated worklog; de-dupe below.
REDACT="$(dirname "$0")/redact-secrets.sh"
if [ -f "$BL" ]; then
  bash "$REDACT" < "$BL" 2>/dev/null | while IFS= read -r l; do [ -n "$l" ] && printf '%s  [blocked.log]\n' "$l"; done >> "$TMP"
fi

if [ ! -s "$TMP" ]; then
  echo "_(no events recorded yet)_"
  rm -f "$TMP"; exit 0
fi

# Stable chronological sort by leading timestamp; collapse exact-duplicate lines.
sort -s -k1,1 "$TMP" | awk '!seen[$0]++'
rm -f "$TMP"
echo
C=$(grep -cE '^[0-9]{4}' "$WL" 2>/dev/null); echo "_Rendered from worklog.md + blocked.log; read-only. ${C:-0} worklog event(s)._"
exit 0
