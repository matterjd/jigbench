#!/bin/bash
# QA gate — jigbench's real quality suite, mirrored from .github/workflows/ci.yml.
#
# Default = the FAST set, run automatically by the .claude/hooks/qa-gate.sh
# PostToolUse hook when a commit lands (config/workspace.yml `qa_gate:` block):
#   - typecheck  (also builds core + the four adapters + server — the rung the
#                 other legs RESOLVE against; a stale dist here reads as a code
#                 error, not a build error: see docs/ROADMAP.md's npm-ci note)
#   - test       (vitest across the workspaces)
#   - check:stdout  (stdio carries MCP JSON-RPC only)
#
# `--full` adds the legs CI runs that are too slow or too stateful per commit:
#   - build (every workspace), build:release, pack:release, check:mcp-smoke
#
# JIG_NO_MODEL=1 IS SET FOR THE TEST LEG ON PURPOSE, and it is the one line in
# this file worth arguing about. CI forces it (ci.yml "test (JIG_NO_MODEL=1)")
# and this desk is the only machine where Ollama is actually up — so without the
# pin, a desk green and a CI green would be answering different questions, and
# the desk's would be the weaker one to reason about. The model-present path is
# real and needs its own look, but it belongs in the retest (docs/TEST-RUN.md),
# not in a gate that fires after every commit.
#
# Exit 0 iff every leg passes; the first failure is reported and the remaining
# legs still run, so one red cannot hide another.
set -u
cd "$(dirname "$0")/.."
FULL=0; [ "${1:-}" = "--full" ] && FULL=1
FAILED=""
leg(){ local name="$1"; shift
  local start=$(date +%s)
  if "$@" >/tmp/jig-qa-leg.$$ 2>&1; then
    echo "GREEN $(( $(date +%s) - start ))s  $name"
  else
    echo "RED   $(( $(date +%s) - start ))s  $name"
    tail -15 "/tmp/jig-qa-leg.$$" | sed 's/^/      /'
    FAILED="$FAILED $name"
  fi
  rm -f "/tmp/jig-qa-leg.$$"
}

leg "typecheck"      npm run -s typecheck
leg "test"           env JIG_NO_MODEL=1 npm run -s test
leg "check:stdout"   npm run -s check:stdout

if [ "$FULL" = 1 ]; then
  leg "build"          npm run -s build
  leg "check:mcp-smoke" npm run -s check:mcp-smoke
  leg "build:release"  npm run -s build:release
  leg "pack:release"   npm run -s pack:release
fi

if [ -n "$FAILED" ]; then
  echo "QA GATE RED:$FAILED"
  exit 1
fi
echo "QA GATE GREEN ($([ "$FULL" = 1 ] && echo full || echo fast) set)"
