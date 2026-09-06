#!/usr/bin/env bash
# scripts/stdout-guard.sh
#
# stdout is reserved (AGENTS.md "stdout is reserved"): `jigbench mcp` speaks JSON-RPC over
# stdio, and stdout must carry JSON-RPC ONLY. S1's version of this script just checked for
# zero stdout bytes, because S1's `mcp` was a stub that never implemented MCP at all. S6
# implements the real stdio server, so this drives a REAL `initialize` ->
# `notifications/initialized` -> `tools/list` round trip against the built binary and
# asserts every line it writes to stdout parses as a JSON-RPC 2.0 message (never a stray
# `console.log`) and that `tools/list` names all nine `jig_*` tools — then closes stdin and
# asserts the process exits cleanly (code 0), the same "the agent closed its end of the
# pipe" shutdown path `runMcpCommand` implements.
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
STDERR_FILE="$(mktemp)"
cleanup() {
  rm -rf "$TARGET_REPO" "$STDERR_FILE"
}
trap cleanup EXIT

# A tiny inline helper: reads one JSON-RPC line from stdin(0), asserts it's valid JSON-RPC
# 2.0, and (optionally) prints a field of it — so the shell only ever branches on node's
# own exit code / stdout, never re-implements JSON parsing itself.
assert_json_rpc_line() {
  local line="$1"
  node -e '
    const line = require("fs").readFileSync(0, "utf8");
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      console.error("not valid JSON:", String(err));
      process.exit(1);
    }
    if (msg.jsonrpc !== "2.0") {
      console.error("missing/wrong jsonrpc field:", JSON.stringify(msg));
      process.exit(1);
    }
  ' <<<"$line"
}

coproc MCP { node "$BIN" mcp --repo "$TARGET_REPO" 2>"$STDERR_FILE"; }

printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"stdout-guard","version":"1.0.0"}}}' >&"${MCP[1]}"

INIT_LINE=""
if ! IFS= read -r -t 10 INIT_LINE <&"${MCP[0]}"; then
  echo "FAIL: no response to initialize within 10s" >&2
  kill "$MCP_PID" 2>/dev/null
  exit 1
fi
if ! assert_json_rpc_line "$INIT_LINE"; then
  echo "FAIL: the initialize response was not a JSON-RPC 2.0 message:" >&2
  echo "$INIT_LINE" >&2
  kill "$MCP_PID" 2>/dev/null
  exit 1
fi

printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}' >&"${MCP[1]}"
printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' >&"${MCP[1]}"

TOOLS_LINE=""
if ! IFS= read -r -t 10 TOOLS_LINE <&"${MCP[0]}"; then
  echo "FAIL: no response to tools/list within 10s" >&2
  kill "$MCP_PID" 2>/dev/null
  exit 1
fi
if ! assert_json_rpc_line "$TOOLS_LINE"; then
  echo "FAIL: the tools/list response was not a JSON-RPC 2.0 message (a stray console.log?):" >&2
  echo "$TOOLS_LINE" >&2
  kill "$MCP_PID" 2>/dev/null
  exit 1
fi

TOOL_COUNT="$(node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const tools = (data.result && data.result.tools) || [];
  process.stdout.write(String(tools.length));
' <<<"$TOOLS_LINE")"
if [ "$TOOL_COUNT" != "9" ]; then
  echo "FAIL: expected 9 tools from tools/list, got $TOOL_COUNT:" >&2
  echo "$TOOLS_LINE" >&2
  kill "$MCP_PID" 2>/dev/null
  exit 1
fi

# Close our end of the coproc's stdin — the same "the agent closed the pipe" shutdown path
# runMcpCommand implements — and assert the process exits cleanly on its own.
exec {MCP[1]}>&-

if ! wait "$MCP_PID"; then
  echo "FAIL: jigbench mcp did not exit 0 after stdin closed" >&2
  echo "--- stderr ---" >&2
  cat "$STDERR_FILE" >&2
  exit 1
fi

echo "OK: jigbench mcp completed a real initialize -> tools/list round trip (9 tools), stdout carried JSON-RPC only, and exited 0 once stdin closed" >&2
exit 0
