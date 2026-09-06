#!/usr/bin/env bash
# scripts/mcp-smoke.sh
#
# The REAL interop gate (EXECUTION-PLAN.md §4 S6's testable acceptance): builds everything,
# re-runs the stdout-purity + tools/list round trip (scripts/stdout-guard.sh), then drives a
# READ-ONLY end-to-end MCP session against the built binary using the real SDK Client +
# StdioClientTransport (packages/cli/src/commands/mcp.e2e.test.ts) — no global npm state, no
# writes to the user's own Claude Code config, ever, in this default path.
#
# Wave-4 council finding 2 (HIGH): a prior version of this script ALWAYS ran `npm link`
# (into global npm) and `claude mcp add` (into the CURRENT machine's `~/.claude.json`) — two
# real, global mutations a caller could trigger unintentionally just by running this script.
# Those two steps now run ONLY when `JIGBENCH_SMOKE_GLOBAL=1` is set; otherwise this script
# prints one SKIPPED line naming both steps and how to opt in, and still exits 0 for the
# read-only part above.
#
# FINDING (2026-09-06, verified live on this desk against Claude Code 2.1.259, kept from the
# prior version of this script — only reachable under the opt-in path now): a project-scoped
# `.mcp.json` entry (what `jigbench init` writes) is reported by `claude mcp list` as "Pending
# approval" until a human interactively approves it once in that project — Claude Code's own
# security gate against untrusted repos' checked-in `.mcp.json` files, not something this
# script should or safely could bypass. `claude mcp add <name> -- <command> <args...>` is the
# non-interactive equivalent of that one-time approval (a LOCAL-scope, user-initiated
# registration) — THAT is what the opt-in path uses to get a real, health-checked "Connected"
# status. It still runs `jigbench init` first and asserts `.mcp.json` itself is written
# correctly, matching the literal S6 acceptance.
#
# `jigbench` is not published to npm yet (EXECUTION-PLAN.md decision 12: private for now), so
# a bare `npx jigbench` would 404 against the real registry — the opt-in path `npm link`s the
# local build for its own duration and always `npm unlink`s it again, even on failure or a
# Ctrl-C (the cleanup trap runs either way, so an interrupted run can never leave the link or
# the claude registration behind).
#
# Usage:
#   bash scripts/mcp-smoke.sh                       # read-only: build + stdout-guard + e2e
#   JIGBENCH_SMOKE_GLOBAL=1 bash scripts/mcp-smoke.sh  # also: npm link + claude mcp add/list
#
# See scripts/mcp-smoke.test.sh: it asserts mechanically (fake npm/claude shims first on
# PATH) that a plain run of this script never invokes either global-state step.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/cli"
BIN="$CLI_DIR/dist/bin.js"

PASS=1
SERVER_NAME="jig-smoke-$$"
TARGET_REPO=""
LINKED=0

cleanup() {
  if [ -n "$TARGET_REPO" ] && [ -d "$TARGET_REPO" ]; then
    (cd "$TARGET_REPO" && claude mcp remove "$SERVER_NAME" -s local >/dev/null 2>&1) || true
    rm -rf "$TARGET_REPO"
  fi
  if [ "$LINKED" -eq 1 ]; then
    (cd "$CLI_DIR" && npm unlink -g jigbench >/dev/null 2>&1) || true
  fi
}
trap cleanup EXIT

BUILD_LOG="$(mktemp)"
echo "== mcp-smoke: build ==" >&2
if ! (cd "$REPO_ROOT" && npm run build >"$BUILD_LOG" 2>&1); then
  echo "FAIL: npm run build failed:" >&2
  cat "$BUILD_LOG" >&2
  rm -f "$BUILD_LOG"
  exit 1
fi
rm -f "$BUILD_LOG"
echo "OK: build" >&2

echo "== mcp-smoke: stdout-purity + tools/list round trip (scripts/stdout-guard.sh) ==" >&2
if ! bash "$HERE/stdout-guard.sh"; then
  echo "FAIL: stdout-guard.sh failed" >&2
  PASS=0
fi

# --- read-only MCP e2e: spawns the built binary, drives it with the real SDK Client over a
# real StdioClientTransport (packages/cli/src/commands/mcp.e2e.test.ts) — no global npm
# state, no claude CLI, no writes outside a throwaway temp repo it creates and removes itself.
echo "== mcp-smoke: read-only MCP e2e (real SDK Client + StdioClientTransport; no global state touched) ==" >&2
E2E_LOG="$(mktemp)"
if ! (cd "$CLI_DIR" && npx vitest run src/commands/mcp.e2e.test.ts >"$E2E_LOG" 2>&1); then
  echo "FAIL: the read-only MCP e2e failed:" >&2
  cat "$E2E_LOG" >&2
  PASS=0
else
  echo "OK: read-only MCP e2e" >&2
fi
rm -f "$E2E_LOG"

if [ "${JIGBENCH_SMOKE_GLOBAL:-0}" != "1" ]; then
  echo "SKIPPED: the global-state interop step (npm link into global npm; claude mcp add into ~/.claude.json) -- opt in with JIGBENCH_SMOKE_GLOBAL=1 to also verify a REAL 'claude mcp add' + 'claude mcp list' round trip" >&2
  if [ "$PASS" -eq 1 ]; then
    echo "PASS: mcp-smoke (read-only)" >&2
    exit 0
  else
    echo "FAIL: mcp-smoke (read-only)" >&2
    exit 1
  fi
fi

echo "== mcp-smoke: npm link (npx jigbench -> this build; jigbench isn't published yet) [JIGBENCH_SMOKE_GLOBAL=1] ==" >&2
if ! (cd "$CLI_DIR" && npm link >/dev/null 2>&1); then
  echo "FAIL: npm link failed" >&2
  exit 1
fi
LINKED=1

TARGET_REPO="$(mktemp -d)"
echo "== mcp-smoke: jigbench init --repo $TARGET_REPO ==" >&2
INIT_LOG="$(mktemp)"
if ! node "$BIN" init --repo "$TARGET_REPO" >"$INIT_LOG" 2>&1; then
  echo "FAIL: jigbench init failed:" >&2
  cat "$INIT_LOG" >&2
  PASS=0
fi
rm -f "$INIT_LOG"
if [ ! -f "$TARGET_REPO/.mcp.json" ]; then
  echo "FAIL: .mcp.json was not written by jigbench init" >&2
  PASS=0
else
  echo "OK: jigbench init wrote .mcp.json" >&2
fi

echo "== mcp-smoke: claude mcp add + claude mcp list (the real interop gate) [JIGBENCH_SMOKE_GLOBAL=1] ==" >&2
if ! command -v claude >/dev/null 2>&1; then
  echo "FAIL: the 'claude' CLI is not on PATH — cannot run the real interop gate" >&2
  exit 1
fi

ADD_LOG="$(mktemp)"
if ! (cd "$TARGET_REPO" && claude mcp add "$SERVER_NAME" -- npx jigbench mcp --repo "$TARGET_REPO" >"$ADD_LOG" 2>&1); then
  echo "FAIL: claude mcp add failed:" >&2
  cat "$ADD_LOG" >&2
  PASS=0
fi
rm -f "$ADD_LOG"

LIST_OUTPUT="$(cd "$TARGET_REPO" && claude mcp list 2>&1)"
echo "$LIST_OUTPUT" >&2

JIG_LINE="$(printf '%s\n' "$LIST_OUTPUT" | grep -F "$SERVER_NAME" || true)"
if [ -z "$JIG_LINE" ]; then
  echo "FAIL: claude mcp list did not mention $SERVER_NAME at all:" >&2
  PASS=0
elif printf '%s' "$JIG_LINE" | grep -qi "Connected"; then
  echo "OK: $JIG_LINE" >&2
else
  echo "FAIL: $SERVER_NAME is not reported healthy:" >&2
  echo "$JIG_LINE" >&2
  PASS=0
fi

if [ "$PASS" -eq 1 ]; then
  echo "PASS: mcp-smoke" >&2
  exit 0
else
  echo "FAIL: mcp-smoke" >&2
  exit 1
fi
