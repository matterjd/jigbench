#!/usr/bin/env bash
# scripts/stdout-guard.sh
#
# stdout is reserved (AGENTS.md "stdout is reserved"): `jigbench mcp` speaks JSON-RPC over
# stdio, and stdout must carry JSON-RPC ONLY. A prior version of this script read exactly two
# lines off the process's stdout (the `initialize` and `tools/list` responses) and validated
# only those two lines — a stray `console.log` anywhere else in the run (before either
# response, between them, or after `tools/list`, e.g. from an async heartbeat tick or any
# other timer) sat completely unread, and this guard still printed OK (wave-4 council
# finding 1).
#
# This version tees the child's ENTIRE stdout, for the WHOLE run (initialize ->
# notifications/initialized -> tools/list -> a short hold -> stdin closed -> process exit),
# to a file, then asserts on THAT FILE as a whole, not on the two lines read interactively:
#   (a) every non-empty line parses as a JSON-RPC 2.0 message (`"jsonrpc":"2.0"` plus an
#       `id` or a `method`) — never a stray console.log or any other non-JSON-RPC text;
#   (b) the line count is EXACTLY the number of requests answered (2: initialize,
#       tools/list) — no extra lines, from any source;
#   (c) tools/list names all nine jig_* tools;
#   (d) the process exits 0 once stdin is closed — the same "the agent closed its end of the
#       pipe" shutdown path `runMcpCommand` implements.
#
# `JIG_HEARTBEAT_MS` (packages/server/src/mcp/server.ts's `heartbeatRefreshMsFromEnv`) passes
# through to the child unchanged, and `STDOUT_GUARD_HOLD_SECONDS` (default 0.3s) controls how
# long this script holds the connection open, past `tools/list`, before closing stdin — this
# is what lets a RED CONTROL run fast: set `JIG_HEARTBEAT_MS=50` so several heartbeat ticks
# land inside that hold window, add a temporary `console.log('debug')` inside the heartbeat
# tick (packages/server/src/mcp/heartbeat.ts's `ShopHeartbeat.start()`), rebuild, and this
# guard must FAIL — then remove the injection, rebuild, and it must pass again. That red/green
# pair is the proof this guard reads the WHOLE stream, not just two lines; it is a manual
# verification step (not a permanent automated test) — its output belongs in the commit body.
# At the real ~10s default heartbeat interval, a 0.3s hold never lets one fire at all, so nothing
# about a normal green run changes.
#
# `JIG_MCP_CMD` (S10): when set, this is the exact command to run instead of `node
# packages/cli/dist/bin.js` — e.g. `JIG_MCP_CMD="npx --yes ./jigbench-0.1.0.tgz"` to run this
# SAME purity/shape control against a packed release tarball in a clean directory (the S10
# npx control), rather than the workspace's own tsc build. Word-split, so quote it as one
# shell-parseable string; `mcp --repo "$TARGET_REPO"` is always appended after it.
#
# `JIG_GUARD_TIMEOUT` (seconds, default 10, must be a positive integer): how long each of the
# two interactive reads below (the `initialize` and `tools/list` responses) waits before
# declaring FAIL. A cold `npx --yes <tarball>` run has to extract the tarball, resolve it, boot
# node, AND answer `initialize` -- on a cold CI runner that can take much longer than a warm
# local `node packages/cli/dist/bin.js`, so scripts/npx-control.sh raises this for its own mcp
# check. The outer per-child watchdog (the `timeout` wrapping the coproc below) scales with
# this value too, so raising it actually helps instead of being cut off by an unrelated,
# shorter bound.
#
# Usage:
#   bash scripts/stdout-guard.sh                                    (run after `npm run build`)
#   JIG_MCP_CMD="npx --yes ./jigbench-0.1.0.tgz" bash scripts/stdout-guard.sh   (npx control)
#   JIG_GUARD_TIMEOUT=120 JIG_MCP_CMD="npx --yes ./jigbench-0.1.0.tgz" bash scripts/stdout-guard.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
BIN="$REPO_ROOT/packages/cli/dist/bin.js"

GUARD_TIMEOUT="${JIG_GUARD_TIMEOUT:-10}"
if ! [[ "$GUARD_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "FAIL: JIG_GUARD_TIMEOUT must be a positive integer (got '${JIG_GUARD_TIMEOUT:-}')" >&2
  exit 1
fi
# Outer watchdog for the WHOLE child run (cold start + both interactive reads + the hold
# below): scale with GUARD_TIMEOUT so a caller who raises the read timeout for a slow cold npx
# boot isn't silently cut off a few seconds later by this separate, previously-fixed bound.
CHILD_TIMEOUT=$((GUARD_TIMEOUT * 2 + 15))

MEASURE_NPX_ELAPSED=0
if [ -n "${JIG_MCP_CMD:-}" ]; then
  # shellcheck disable=SC2206 -- deliberate word-splitting of a caller-supplied command string
  MCP_CMD=(${JIG_MCP_CMD})
  case "$JIG_MCP_CMD" in
    npx*) MEASURE_NPX_ELAPSED=1 ;;
  esac
else
  if [ ! -f "$BIN" ]; then
    echo "FAIL: $BIN does not exist — run 'npm run build' first." >&2
    exit 1
  fi
  MCP_CMD=(node "$BIN")
fi

TARGET_REPO="$(mktemp -d)"
STDOUT_FILE="$(mktemp)"
STDERR_FILE="$(mktemp)"
cleanup() {
  rm -rf "$TARGET_REPO" "$STDOUT_FILE" "$STDERR_FILE"
}
trap cleanup EXIT

# A tiny inline helper: reads one JSON-RPC line from stdin(0), asserts it's valid JSON-RPC
# 2.0 — so the shell only ever branches on node's own exit code, never re-implements JSON
# parsing itself. This is just an early sanity check on the two interactively-read lines; the
# REAL purity/shape assertions run against the full $STDOUT_FILE capture below.
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

# Kills the coproc's child on ANY failure path and WAITS for it to actually be gone before
# returning. A timeout used to just `kill "$MCP_PID"` and move on — on Windows that signal
# doesn't reliably reach the real node/npx process the shell wrapper spawned, so the child kept
# running and holding an open handle inside $TARGET_REPO; the caller's own `rm -rf` of that
# directory (this script's `cleanup` trap, or npx-control.sh's fixture cleanup) then raced it
# and failed with "Device or resource busy". `taskkill //T //F` (never by process name) takes
# the whole process tree down; `wait` afterward reaps it so control never returns early.
kill_mcp() {
  echo "killing coproc MCP_PID=$MCP_PID" >&2
  kill "$MCP_PID" 2>/dev/null || true
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*)
      if kill -0 "$MCP_PID" 2>/dev/null; then
        taskkill //PID "$MCP_PID" //T //F >/dev/null 2>&1 || true
      fi
      ;;
  esac
  wait "$MCP_PID" 2>/dev/null || true
}

# The pipeline's own exit status is node's, not tee's: `set -o pipefail` is scoped to this
# coproc's own subshell (bash runs a `coproc NAME { list; }` block as a subshell), so it never
# touches this script's own shell options. `tee` mirrors node's ENTIRE stdout to $STDOUT_FILE
# for the whole run; ${MCP[0]} (this coproc's read end, i.e. tee's own stdout) still carries
# the same bytes in real time for the two interactive reads below. `timeout "$CHILD_TIMEOUT"`
# bounds the whole child run (a cold start plus the hold below, scaled off JIG_GUARD_TIMEOUT
# above) — a real agent session stays connected far longer than this; this timeout only bounds
# THIS script's own run.
COPROC_START_NS="$(date +%s%N)"
coproc MCP { set -o pipefail; timeout "$CHILD_TIMEOUT" "${MCP_CMD[@]}" mcp --repo "$TARGET_REPO" 2>"$STDERR_FILE" | tee "$STDOUT_FILE"; }

printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"stdout-guard","version":"1.0.0"}}}' >&"${MCP[1]}"

INIT_LINE=""
if ! IFS= read -r -t "$GUARD_TIMEOUT" INIT_LINE <&"${MCP[0]}"; then
  echo "FAIL: no response to initialize within ${GUARD_TIMEOUT}s" >&2
  kill_mcp
  exit 1
fi
if [ "$MEASURE_NPX_ELAPSED" -eq 1 ]; then
  ELAPSED_NS=$(( $(date +%s%N) - COPROC_START_NS ))
  ELAPSED_MS=$(( ELAPSED_NS / 1000000 ))
  printf 'TIMING: npx cold start -> initialize response took %d.%03ds\n' "$((ELAPSED_MS / 1000))" "$((ELAPSED_MS % 1000))" >&2
fi
if ! assert_json_rpc_line "$INIT_LINE"; then
  echo "FAIL: the initialize response was not a JSON-RPC 2.0 message:" >&2
  echo "$INIT_LINE" >&2
  kill_mcp
  exit 1
fi

printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}' >&"${MCP[1]}"
printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' >&"${MCP[1]}"

TOOLS_LINE=""
if ! IFS= read -r -t "$GUARD_TIMEOUT" TOOLS_LINE <&"${MCP[0]}"; then
  echo "FAIL: no response to tools/list within ${GUARD_TIMEOUT}s" >&2
  kill_mcp
  exit 1
fi
if ! assert_json_rpc_line "$TOOLS_LINE"; then
  echo "FAIL: the tools/list response was not a JSON-RPC 2.0 message (a stray console.log?):" >&2
  echo "$TOOLS_LINE" >&2
  kill_mcp
  exit 1
fi

# See the header comment: this hold is what gives a fast (red-control) heartbeat tick a
# chance to fire while the connection is still open, without changing anything about a
# normal run at the real ~10s interval.
sleep "${STDOUT_GUARD_HOLD_SECONDS:-0.3}"

# Close our end of the coproc's stdin — the same "the agent closed the pipe" shutdown path
# runMcpCommand implements — and assert the pipeline (i.e. node itself, via pipefail) exits 0
# on its own.
exec {MCP[1]}>&-

if ! wait "$MCP_PID"; then
  echo "FAIL: jigbench mcp did not exit 0 after stdin closed (or timed out)" >&2
  echo "--- stdout (captured in full) ---" >&2
  cat "$STDOUT_FILE" >&2
  echo "--- stderr ---" >&2
  cat "$STDERR_FILE" >&2
  kill_mcp
  exit 1
fi

# --- (a) every non-empty stdout line from the WHOLE run (not just the two lines read above)
#     is JSON-RPC 2.0; (b) exactly 2 lines total; (c) tools/list named all 12 tools (the
#     original 9 plus S11's jig_prompts/jig_prompt/jig_mark_built, registered unconditionally
#     from createJigMcpServer) -----------------------------------------------------------
node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const lines = fs.readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");

  if (lines.length !== 2) {
    console.error(`expected exactly 2 stdout lines total (the initialize + tools/list responses), got ${lines.length} -- a stray write somewhere else in the run:`);
    console.error(JSON.stringify(lines, null, 2));
    process.exit(1);
  }

  const parsed = [];
  for (const line of lines) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (err) {
      console.error("a stdout line did not parse as JSON (a stray console.log?):", String(err));
      console.error(line);
      process.exit(1);
    }
    if (msg.jsonrpc !== "2.0" || (msg.id === undefined && msg.method === undefined)) {
      console.error("a stdout line parsed as JSON but is not a JSON-RPC 2.0 message:", JSON.stringify(msg));
      process.exit(1);
    }
    parsed.push(msg);
  }

  const toolsResponse = parsed.find((m) => m.id === 2);
  if (!toolsResponse) {
    console.error("no response with id:2 (tools/list) was found on stdout");
    process.exit(1);
  }
  const tools = (toolsResponse.result && toolsResponse.result.tools) || [];
  if (tools.length !== 12) {
    console.error(`expected 12 tools from tools/list, got ${tools.length}:`, JSON.stringify(tools.map((t) => t.name)));
    process.exit(1);
  }
' "$STDOUT_FILE"
CHECK_STATUS=$?
if [ "$CHECK_STATUS" -ne 0 ]; then
  echo "FAIL: stdout purity/shape check failed (see above) -- full captured stdout:" >&2
  cat "$STDOUT_FILE" >&2
  exit 1
fi

echo "OK: jigbench mcp completed a real initialize -> tools/list round trip (12 tools); the ENTIRE stdout stream -- not just the two responses read interactively -- carried JSON-RPC only with no extra lines; and the process exited 0 once stdin closed" >&2
exit 0
