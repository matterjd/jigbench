#!/usr/bin/env bash
# scripts/mcp-smoke.test.sh
#
# Wave-4 council finding 2 (HIGH): asserts MECHANICALLY that a plain `bash
# scripts/mcp-smoke.sh` (JIGBENCH_SMOKE_GLOBAL unset) never invokes `npm link` or
# `claude mcp add` — those two calls mutate the CURRENT machine's global npm registry and
# `~/.claude.json`, and mcp-smoke.sh is meant to be safe to run on a whim.
#
# How: fake `npm`/`claude` shims go on PATH FIRST. The fake `claude` shim fails loudly
# (non-zero exit, a marker line) for ANY invocation — mcp-smoke.sh's read-only path never
# calls `claude` at all, so any call at all is already a violation. The fake `npm` shim only
# intercepts `npm link` (the one global-state npm subcommand) — everything else (`npm run
# build`, `npx vitest`, `npm unlink` from the cleanup trap, which is a harmless no-op if
# nothing was ever linked) passes straight through to the REAL npm on PATH, via `exec`, so
# mcp-smoke.sh's legitimate build + test steps still run for real.
#
# Usage: bash scripts/mcp-smoke.test.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

REAL_NPM="$(command -v npm || true)"
if [ -z "$REAL_NPM" ]; then
  echo "FAIL: no real npm on PATH to delegate to" >&2
  exit 1
fi

FAKE_BIN_DIR="$(mktemp -d)"
MARKER_FILE="$(mktemp)"
cleanup() {
  rm -rf "$FAKE_BIN_DIR" "$MARKER_FILE"
}
trap cleanup EXIT

cat >"$FAKE_BIN_DIR/npm" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "link" ]; then
  echo "MARKER: npm link was invoked (args: \$*)" >>"$MARKER_FILE"
  echo "FAIL(fake npm): npm link must never run without JIGBENCH_SMOKE_GLOBAL=1" >&2
  exit 1
fi
exec "$REAL_NPM" "\$@"
EOF
chmod +x "$FAKE_BIN_DIR/npm"

cat >"$FAKE_BIN_DIR/claude" <<EOF
#!/usr/bin/env bash
echo "MARKER: claude was invoked (args: \$*)" >>"$MARKER_FILE"
echo "FAIL(fake claude): the claude CLI must never run without JIGBENCH_SMOKE_GLOBAL=1" >&2
exit 1
EOF
chmod +x "$FAKE_BIN_DIR/claude"

echo "== mcp-smoke.test.sh: running mcp-smoke.sh with fake npm/claude shims first on PATH, JIGBENCH_SMOKE_GLOBAL unset ==" >&2
SMOKE_LOG="$(mktemp)"
if ! (cd "$REPO_ROOT" && PATH="$FAKE_BIN_DIR:$PATH" env -u JIGBENCH_SMOKE_GLOBAL bash "$HERE/mcp-smoke.sh" >"$SMOKE_LOG" 2>&1); then
  echo "FAIL: mcp-smoke.sh itself failed (it should exit 0 for the read-only, JIGBENCH_SMOKE_GLOBAL-unset path):" >&2
  cat "$SMOKE_LOG" >&2
  rm -f "$SMOKE_LOG"
  exit 1
fi

if ! grep -q "SKIPPED: the global-state interop step" "$SMOKE_LOG"; then
  echo "FAIL: mcp-smoke.sh did not print its SKIPPED line for the global-state step:" >&2
  cat "$SMOKE_LOG" >&2
  rm -f "$SMOKE_LOG"
  exit 1
fi
rm -f "$SMOKE_LOG"

if [ -s "$MARKER_FILE" ]; then
  echo "FAIL: mcp-smoke.sh invoked npm link and/or claude while JIGBENCH_SMOKE_GLOBAL was unset:" >&2
  cat "$MARKER_FILE" >&2
  exit 1
fi

echo "OK: a plain run of mcp-smoke.sh (JIGBENCH_SMOKE_GLOBAL unset) never invoked npm link or claude, and printed the SKIPPED line" >&2
exit 0
