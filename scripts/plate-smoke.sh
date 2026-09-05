#!/usr/bin/env bash
# scripts/plate-smoke.sh — S3 end-to-end smoke test for the plate proxy.
#
# Starts the Ledger .NET API, `ng serve` for the Ledger Angular app, and jigbench's own
# server (with the plate proxy pointed at the Angular dev server), then checks:
#   - the plate serves the target's HTML with the loupe script injected
#   - the loupe script itself is servable
#   - a deep route (/invoices) is proxied through correctly
#   - the bench's GET /api/plate reports the proxy as up
#   - X-Frame-Options is not present on the proxied response (it would block the bench iframe)
#
# Follows examples/smoke.sh's pattern: PASS/FAIL per check, everything stopped by port->PID
# (never by process name) in a trap on exit. Run after `npm run build` at the repo root and
# `cd examples/ledger-angular && npm ci`.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/examples/ledger-api"
WEB_DIR="$REPO_ROOT/examples/ledger-angular"
BIN="$REPO_ROOT/packages/cli/dist/bin.js"

API_PORT=5210
WEB_PORT=4200
BENCH_PORT=4600
PLATE_PORT=4601

API_LOG="/tmp/jig-plate-smoke-api.log"
WEB_LOG="/tmp/jig-plate-smoke-web.log"
JIG_LOG="/tmp/jig-plate-smoke-jig.log"

ALL_PASS=1

pid_on_port() {
  # Windows netstat line shape: "  TCP    127.0.0.1:5210   0.0.0.0:0   LISTENING   19072"
  netstat -ano 2>/dev/null | grep -E ":$1[[:space:]]" | grep -i LISTENING | awk '{print $NF}' | head -1
}

wait_for_port() {
  local port="$1" name="$2" tries=60
  for ((i = 0; i < tries; i++)); do
    if [ -n "$(pid_on_port "$port")" ]; then
      echo "up: $name is listening on :$port"
      return 0
    fi
    sleep 1
  done
  echo "FAIL: $name never started listening on :$port"
  return 1
}

check() {
  local label="$1" url="$2" needle="$3" tries=30 body=""
  for ((i = 0; i < tries; i++)); do
    body="$(curl -s --max-time 5 "$url" 2>/dev/null)"
    if [ -n "$body" ] && printf '%s' "$body" | grep -q "$needle"; then
      echo "PASS: $label ($url)"
      return 0
    fi
    sleep 1
  done
  echo "FAIL: $label ($url) — last body: ${body:0:200}"
  ALL_PASS=0
  return 1
}

cleanup() {
  for port in "$PLATE_PORT" "$BENCH_PORT" "$WEB_PORT" "$API_PORT"; do
    pid="$(pid_on_port "$port")"
    if [ -n "$pid" ]; then
      taskkill //PID "$pid" //F >/dev/null 2>&1 && echo "stopped pid $pid (port $port)"
    fi
  done
}
trap cleanup EXIT

if [ ! -f "$BIN" ]; then
  echo "FAIL: $BIN does not exist — run 'npm run build' first." >&2
  exit 1
fi

echo "starting ledger-api on :$API_PORT ..."
(cd "$API_DIR" && dotnet run --no-launch-profile --urls "http://localhost:$API_PORT") \
  > "$API_LOG" 2>&1 &
wait_for_port "$API_PORT" "ledger-api" || exit 1

echo "starting ledger-angular on :$WEB_PORT ..."
(cd "$WEB_DIR" && npx ng serve --port "$WEB_PORT") > "$WEB_LOG" 2>&1 &
wait_for_port "$WEB_PORT" "ledger-angular" || exit 1

echo "starting jigbench on :$BENCH_PORT (plate on :$PLATE_PORT, target :$WEB_PORT) ..."
(node "$BIN" --no-open --repo "$WEB_DIR" --target "http://localhost:$WEB_PORT" \
  --port "$BENCH_PORT" --plate-port "$PLATE_PORT") > "$JIG_LOG" 2>&1 &
wait_for_port "$BENCH_PORT" "jigbench bench" || exit 1
wait_for_port "$PLATE_PORT" "jigbench plate" || exit 1

check "plate root HTML has the loupe script injected" "http://localhost:$PLATE_PORT/" '/__jig/loupe.js'
check "loupe script is servable" "http://localhost:$PLATE_PORT/__jig/loupe.js" '\[jig\] loupe ready'
check "a deep route (/invoices) is proxied as HTML" "http://localhost:$PLATE_PORT/invoices" '<html'
check "GET /api/plate reports the proxy up" "http://localhost:$BENCH_PORT/api/plate" '"status":"up"'

echo "checking X-Frame-Options is absent on the proxied response ..."
xfo="$(curl -sI --max-time 5 "http://localhost:$PLATE_PORT/" 2>/dev/null | grep -i x-frame-options || true)"
if [ -z "$xfo" ]; then
  echo "PASS: no x-frame-options header on the proxied response"
else
  echo "FAIL: x-frame-options still present: $xfo"
  ALL_PASS=0
fi

if [ "$ALL_PASS" -eq 1 ]; then
  echo "SMOKE: PASS"
  exit 0
else
  echo "SMOKE: FAIL — logs at $API_LOG, $WEB_LOG, $JIG_LOG"
  exit 1
fi
