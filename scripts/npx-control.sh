#!/usr/bin/env bash
# scripts/npx-control.sh
#
# S10's decisive gate: proves `npx jigbench` works from a packed tarball in a CLEAN directory
# OUTSIDE this repo -- no workspace symlinks, no monorepo node_modules, no `npm link`, only the
# HOME-level npm/npx cache a real end user would have. Run after
# `npm run build:release && npm run pack:release` (root scripts) have produced a
# jigbench-<version>.tgz at the repo root; CI (.github/workflows/ci.yml) runs this exact script
# in that order.
#
# Builds a throwaway git repo containing a copy of examples/ledger-angular (source only, no
# node_modules) and examples/ledger-api (with its recorded openapi.v1.json) as SIBLINGS at the
# fixture repo's root -- packages/adapters/{angular,dotnet}'s own find-root.ts search the repo
# root, or exactly one level down, for an angular.json / a .csproj, so this is the shape that
# search expects. The Angular fixture's `ng build`/`npm install` is deliberately never run
# here (its node_modules would be heavy and CI doesn't need a running dev server just to
# survey the SOURCE) -- only jigbench's own commands ever touch this fixture.
#
# Usage: bash scripts/npx-control.sh <path-to-tarball>
#   bash scripts/npx-control.sh "$(pwd)/jigbench-0.2.0.tgz"

set -euo pipefail

TARBALL="${1:?usage: npx-control.sh <path-to-tarball>}"
if [ ! -f "$TARBALL" ]; then
  echo "FAIL: $TARBALL does not exist -- run 'npm run build:release && npm run pack:release' first." >&2
  exit 1
fi
TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
TGZ_NAME="$(basename "$TARBALL")"

# #22: the tarball must carry its own README and LICENSE — 0.1.0 shipped neither, so the npm
# page for `jigbench` showed no readme. `packages/cli/scripts/copy-release-assets.mjs` copies
# the root README.md and LICENSE next to the cli's package.json (npm always includes both,
# whatever `files` says); this reads the packed artifact itself — the same listing
# `npm pack --dry-run` prints, but of the file that will actually be published.
echo "== npx control: the tarball carries README.md and LICENSE ==" >&2
TARBALL_LISTING="$(tar -tzf "$TARBALL")"
for required in package/README.md package/LICENSE package/package.json package/dist/bin.js; do
  echo "$TARBALL_LISTING" | grep -qx "$required" || {
    echo "FAIL: $TGZ_NAME does not contain $required -- run 'npm run build:release && npm run pack:release' (the release build copies README.md and LICENSE into packages/cli)" >&2
    exit 1
  }
done
echo "OK: tarball carries README.md, LICENSE, package.json, dist/bin.js" >&2

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

# Cross-platform "who is listening on this port" -> PID, so cleanup can stop the server by
# port -> PID (never by process name — a `node` process-name kill is never safe on a desk
# running many unrelated node processes). Windows/Git Bash carries the real (System32)
# `netstat`; POSIX runners use `lsof`.
find_listener_pid() {
  local port="$1"
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*)
      netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $NF}' | head -1
      ;;
    *)
      lsof -t -i ":$port" -sTCP:LISTEN 2>/dev/null | head -1
      ;;
  esac
}

kill_pid() {
  local pid="$1"
  [ -z "$pid" ] && return 0
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) taskkill //PID "$pid" //F >/dev/null 2>&1 || true ;;
    *) kill "$pid" 2>/dev/null || true ;;
  esac
}

PORT=4680
PLATE_PORT=4681
STAGE="$(mktemp -d)"
# Retry-safe: a cold npx boot that stdout-guard.sh had to kill (mcp check, below) may leave a
# Windows child process a beat behind its own termination, still holding a handle inside
# $STAGE. This control's verdict is the four checks above (survey / init / serve+health / mcp)
# -- not whether the OS let go of a temp directory a few hundred ms sooner -- so a still-busy
# $STAGE after two tries is a WARN, never a FAIL.
cleanup() {
  kill_pid "$(find_listener_pid "$PORT")"
  kill_pid "$(find_listener_pid "$PLATE_PORT")"
  rm -rf "$STAGE" 2>/dev/null || true
  if [ -d "$STAGE" ]; then
    sleep 2
    rm -rf "$STAGE" 2>/dev/null || true
  fi
  if [ -d "$STAGE" ]; then
    echo "WARN: could not remove $STAGE (still busy) -- leaving it for OS cleanup; this does not fail the control" >&2
  fi
}
trap cleanup EXIT

echo "== npx control: staging a clean fixture repo at $STAGE ==" >&2
cp -r "$REPO_ROOT/examples/ledger-angular" "$STAGE/ledger-angular"
rm -rf "$STAGE/ledger-angular/node_modules"
cp -r "$REPO_ROOT/examples/ledger-api" "$STAGE/ledger-api"
cp "$TARBALL" "$STAGE/$TGZ_NAME"
(
  cd "$STAGE"
  git init -q
  git -c user.email=npx-control@jigbench.local -c user.name="Jig npx control" add -A
  git -c user.email=npx-control@jigbench.local -c user.name="Jig npx control" commit -q -s \
    -m "seed: npx-control fixture (ledger-angular + ledger-api)"
)

echo "== npx control: survey ==" >&2
SURVEY_OUT="$(cd "$STAGE" && npx --yes "./$TGZ_NAME" survey 2>&1)"
echo "$SURVEY_OUT" >&2
echo "$SURVEY_OUT" | grep -qE '^Survey — [0-9]+ components [0-9]+ routes [0-9]+ endpoints [0-9]+ schemas [0-9]+ gauges$' || {
  echo "FAIL: survey did not print the expected human summary line" >&2
  exit 1
}
echo "$SURVEY_OUT" | grep -q '^  angular: ' || { echo "FAIL: survey did not detect the Angular adapter" >&2; exit 1; }
echo "$SURVEY_OUT" | grep -q '^  dotnet: ' || { echo "FAIL: survey did not detect the .NET adapter" >&2; exit 1; }
echo "OK: survey (both adapters detected, human summary printed)" >&2

echo "== npx control: init ==" >&2
(cd "$STAGE" && npx --yes "./$TGZ_NAME" init >&2)
if [ ! -f "$STAGE/.mcp.json" ]; then
  echo "FAIL: .mcp.json was not written by jigbench init" >&2
  exit 1
fi
grep -q '"jigbench"' "$STAGE/.mcp.json" || { echo "FAIL: .mcp.json does not name jigbench as the mcp command" >&2; exit 1; }
echo "OK: init wrote .mcp.json" >&2

echo "== npx control: serve (--no-open --port $PORT) ==" >&2
(cd "$STAGE" && nohup npx --yes "./$TGZ_NAME" --no-open --port "$PORT" --plate-port "$PLATE_PORT" >"$STAGE/serve.log" 2>&1 &)

HEALTH=""
for _ in $(seq 1 30); do
  if HEALTH="$(curl -sf "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"; then
    break
  fi
  sleep 1
done
if [ -z "$HEALTH" ]; then
  echo "FAIL: jigbench never answered http://127.0.0.1:$PORT/api/health within 30s" >&2
  cat "$STAGE/serve.log" >&2
  exit 1
fi
echo "health: $HEALTH" >&2
echo "$HEALTH" | grep -q '"ok":true' || { echo "FAIL: /api/health did not report ok:true" >&2; exit 1; }

ROOT_HTML="$(curl -sf "http://127.0.0.1:$PORT/")"
ROOT_DIV_COUNT="$(printf '%s' "$ROOT_HTML" | grep -c '<div id="root"')"
if [ "$ROOT_DIV_COUNT" -lt 1 ]; then
  echo "FAIL: the bench HTML at / does not contain <div id=\"root\"> -- got:" >&2
  echo "$ROOT_HTML" >&2
  exit 1
fi
echo "OK: / served the bundled bench HTML (<div id=\"root\"> x$ROOT_DIV_COUNT)" >&2

kill_pid "$(find_listener_pid "$PORT")"
kill_pid "$(find_listener_pid "$PLATE_PORT")"
echo "OK: stopped the bench/plate server (port -> PID, never by process name)" >&2

# A cold runner extracts the tarball (first `npx --yes` use), resolves it, boots node, AND
# answers `initialize` -- that can run well past stdout-guard.sh's 10s default, so this control
# gives it 120s here specifically (a warm local run, or the plain `npm run check:stdout` CI
# step against the workspace build, keeps the 10s default -- see stdout-guard.sh).
echo "== npx control: mcp (stdout purity via scripts/stdout-guard.sh) ==" >&2
(cd "$STAGE" && JIG_MCP_CMD="npx --yes ./$TGZ_NAME" JIG_GUARD_TIMEOUT=120 bash "$REPO_ROOT/scripts/stdout-guard.sh")

echo "PASS: npx control -- survey, init, serve+health+html, and mcp all green against the packed tarball in a clean directory" >&2
