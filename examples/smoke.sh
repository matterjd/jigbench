#!/usr/bin/env bash
# smoke.sh — starts the Ledger API and the Ledger Angular dev server, waits for both ports,
# checks /api/invoices through the Angular proxy and the API's OpenAPI document, prints
# PASS/FAIL per check, then stops both processes by PID (found via their listening port — never
# by process name). All data served is fake; see README.md.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$SCRIPT_DIR/ledger-api"
WEB_DIR="$SCRIPT_DIR/ledger-angular"
API_PORT=5210
WEB_PORT=4200
API_LOG="/tmp/jig-ledger-api-smoke.log"
WEB_LOG="/tmp/jig-ledger-angular-smoke.log"

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
  echo "FAIL: $label ($url)"
  ALL_PASS=0
  return 1
}

cleanup() {
  for port in "$API_PORT" "$WEB_PORT"; do
    pid="$(pid_on_port "$port")"
    if [ -n "$pid" ]; then
      taskkill //PID "$pid" //F >/dev/null 2>&1 && echo "stopped pid $pid (port $port)"
    fi
  done
}
trap cleanup EXIT

echo "starting ledger-api on :$API_PORT ..."
(cd "$API_DIR" && dotnet run --no-launch-profile --urls "http://localhost:$API_PORT") \
  > "$API_LOG" 2>&1 &
wait_for_port "$API_PORT" "ledger-api" || exit 1

echo "starting ledger-angular on :$WEB_PORT ..."
(cd "$WEB_DIR" && npx ng serve --port "$WEB_PORT") > "$WEB_LOG" 2>&1 &
wait_for_port "$WEB_PORT" "ledger-angular" || exit 1

check "invoices through the Angular proxy" "http://localhost:$WEB_PORT/api/invoices" '"number"'
check "OpenAPI document names /api/invoices" "http://localhost:$API_PORT/openapi/v1.json" '/api/invoices'

if [ "$ALL_PASS" -eq 1 ]; then
  echo "SMOKE: PASS"
  exit 0
else
  echo "SMOKE: FAIL — logs at $API_LOG and $WEB_LOG"
  exit 1
fi
