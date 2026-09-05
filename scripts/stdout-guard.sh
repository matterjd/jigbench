#!/usr/bin/env bash
# scripts/stdout-guard.sh
#
# stdout is reserved (AGENTS.md "stdout is reserved"): packages/server and packages/cli
# speak MCP over stdio starting in S6, and stdout must carry JSON-RPC ONLY. In S1, `jigbench
# mcp` hasn't implemented MCP yet — it should write NOTHING to stdout at all. This script
# proves it, against the real built binary, not against a mock.
#
# Usage: bash scripts/stdout-guard.sh   (run after `npm run build`)

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
BIN="$REPO_ROOT/packages/cli/dist/bin.js"

if [ ! -f "$BIN" ]; then
  echo "FAIL: $BIN does not exist — run 'npm run build' first." >&2
  exit 1
fi

TARGET_REPO="$(mktemp -d)"
STDOUT_FILE="$(mktemp)"
STDERR_FILE="$(mktemp)"
cleanup() {
  rm -rf "$TARGET_REPO" "$STDOUT_FILE" "$STDERR_FILE"
}
trap cleanup EXIT

node "$BIN" mcp --repo "$TARGET_REPO" >"$STDOUT_FILE" 2>"$STDERR_FILE"
EXIT_CODE=$?

STDOUT_BYTES=$(wc -c <"$STDOUT_FILE" | tr -d ' ')

if [ "$STDOUT_BYTES" -ne 0 ]; then
  echo "FAIL: jigbench mcp wrote $STDOUT_BYTES byte(s) to stdout:" >&2
  cat "$STDOUT_FILE" >&2
  exit 1
fi

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "FAIL: jigbench mcp exited with code $EXIT_CODE (expected 0)" >&2
  echo "--- stderr ---" >&2
  cat "$STDERR_FILE" >&2
  exit 1
fi

echo "OK: jigbench mcp wrote 0 bytes to stdout and exited 0" >&2
exit 0
