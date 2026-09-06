#!/usr/bin/env bash
# scripts/fixture-smoke.sh — S7 end-to-end smoke test for fixtures.
#
# F10: "the proxy serves fixture responses for /api/* when a fixture is loaded". Starts the
# Ledger .NET API, `ng serve` for the Ledger Angular app, surveys it, starts jigbench's own
# server (plate proxy pointed at the Angular dev server), creates and loads a fixture, then
# checks:
#   - GET through the plate proxy carries x-jig-fixture: overdue-heavy and differs from the
#     real API's own answer
#   - unloading the fixture restores the real upstream's answer (byte-identical to the direct
#     API call again)
#
# Follows examples/smoke.sh and scripts/plate-smoke.sh's pattern: PASS/FAIL per check,
# everything stopped by port->PID (never by process name) in a trap on exit. Run after
# `npm run build` at the repo root and `cd examples/ledger-angular && npm ci`.
#
# Ordering note: `jigbench survey` is a one-shot CLI write to .jig/survey/survey.json — there
# is no live file-watch, so it runs BEFORE `jigbench serve` starts (JigStore only reads
# survey.json at boot / on an explicit reload()). Running it after the server started would
# leave the running process on the stub survey the whole test.
#
# --repo note: both `survey` and `serve` are pointed at `examples/` (the PARENT of
# ledger-api/ledger-angular), never at `examples/ledger-angular` alone — the dotnet adapter's
# findDotnetRoot() explicitly supports "a --repo pointed at a parent folder that contains the
# .NET app as a sibling" (packages/adapters/dotnet/src/find-root.ts), and only that survey
# shape has any endpoints/responseSchema at all (the angular adapter alone yields component
# model schemas but zero endpoints — a fixture generated from that has empty `responses`).
# Both commands must share the SAME --repo so they read/write the SAME .jig/ folder.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/examples/ledger-api"
WEB_DIR="$REPO_ROOT/examples/ledger-angular"
JIG_REPO="$REPO_ROOT/examples"
BIN="$REPO_ROOT/packages/cli/dist/bin.js"

API_PORT=5210
WEB_PORT=4200
BENCH_PORT=4600
PLATE_PORT=4601

API_LOG="/tmp/jig-fixture-smoke-api.log"
WEB_LOG="/tmp/jig-fixture-smoke-web.log"
JIG_LOG="/tmp/jig-fixture-smoke-jig.log"
SURVEY_LOG="/tmp/jig-fixture-smoke-survey.log"
FIXTURED_HEADERS="/tmp/jig-fixture-smoke-fixtured-headers.txt"
FIXTURED_BODY="/tmp/jig-fixture-smoke-fixtured-body.json"
UPSTREAM_BODY="/tmp/jig-fixture-smoke-upstream-body.json"
UNLOADED_HEADERS="/tmp/jig-fixture-smoke-unloaded-headers.txt"
UNLOADED_BODY="/tmp/jig-fixture-smoke-unloaded-body.json"

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

pass() { echo "PASS: $1"; }
fail() {
  echo "FAIL: $1"
  ALL_PASS=0
}

cleanup() {
  for port in "$PLATE_PORT" "$BENCH_PORT" "$WEB_PORT" "$API_PORT"; do
    pid="$(pid_on_port "$port")"
    if [ -n "$pid" ]; then
      taskkill //PID "$pid" //F >/dev/null 2>&1 && echo "stopped pid $pid (port $port)"
    fi
  done
  rm -rf "$JIG_REPO/.jig"
  echo "removed $JIG_REPO/.jig"
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

echo "surveying the clamped repo (writes .jig/survey/survey.json before the server boots) ..."
if node "$BIN" survey --repo "$JIG_REPO" > "$SURVEY_LOG" 2>&1; then
  pass "jigbench survey exited 0 ($(grep -c 'schema' "$SURVEY_LOG" 2>/dev/null || true) summary line(s) — see $SURVEY_LOG)"
else
  fail "jigbench survey exited non-zero — see $SURVEY_LOG"
  exit 1
fi
if grep -q '"stub": *true\|stub: true\|Note: every adapter' "$SURVEY_LOG"; then
  fail "survey came back as a stub — fixtures need real endpoints/schemas ($SURVEY_LOG)"
fi

echo "starting jigbench on :$BENCH_PORT (plate on :$PLATE_PORT, target :$WEB_PORT) ..."
(node "$BIN" --repo "$JIG_REPO" --target "http://localhost:$WEB_PORT" --no-open \
  --port "$BENCH_PORT" --plate-port "$PLATE_PORT") > "$JIG_LOG" 2>&1 &
wait_for_port "$BENCH_PORT" "jigbench bench" || exit 1
wait_for_port "$PLATE_PORT" "jigbench plate" || exit 1

echo "creating fixture overdue-heavy (seed 42) ..."
create_status="$(curl -s -o /tmp/jig-fixture-smoke-create.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/fixtures" \
  -H 'content-type: application/json' \
  -d '{"name":"overdue-heavy","seed":42}')"
if [ "$create_status" = "201" ]; then
  pass "POST /api/fixtures created overdue-heavy (201)"
else
  fail "POST /api/fixtures returned $create_status, expected 201 — $(cat /tmp/jig-fixture-smoke-create.json 2>/dev/null)"
fi

echo "loading overdue-heavy ..."
load_status="$(curl -s -o /tmp/jig-fixture-smoke-load.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/fixtures/overdue-heavy/load")"
if [ "$load_status" = "200" ] && grep -q '"active":"overdue-heavy"' /tmp/jig-fixture-smoke-load.json; then
  pass "POST /api/fixtures/overdue-heavy/load activated it"
else
  fail "load did not activate overdue-heavy (status $load_status) — $(cat /tmp/jig-fixture-smoke-load.json 2>/dev/null)"
fi

echo "GET /api/plate should now show fixture: overdue-heavy ..."
if curl -s "http://localhost:$BENCH_PORT/api/plate" | grep -q '"fixture":"overdue-heavy"'; then
  pass "GET /api/plate reports fixture: overdue-heavy"
else
  fail "GET /api/plate does not report the loaded fixture"
fi

echo "curling the plate proxy's /api/invoices (should answer from the fixture) ..."
curl -s -D "$FIXTURED_HEADERS" -o "$FIXTURED_BODY" "http://127.0.0.1:$PLATE_PORT/api/invoices" >/dev/null

if grep -qi '^x-jig-fixture: *overdue-heavy' "$FIXTURED_HEADERS"; then
  pass "the plate's /api/invoices carries x-jig-fixture: overdue-heavy"
else
  fail "the plate's /api/invoices is missing x-jig-fixture: overdue-heavy — headers: $(cat "$FIXTURED_HEADERS")"
fi

echo "curling the real API directly on :$API_PORT for comparison ..."
curl -s -o "$UPSTREAM_BODY" "http://localhost:$API_PORT/api/invoices"

if ! diff -q "$FIXTURED_BODY" "$UPSTREAM_BODY" >/dev/null 2>&1; then
  pass "the fixture's /api/invoices differs from the real API's own answer"
else
  fail "the fixture's /api/invoices is byte-identical to the real API — the interceptor did not win"
fi

echo "unloading the fixture ..."
unload_status="$(curl -s -o /tmp/jig-fixture-smoke-unload.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/fixtures/unload")"
if [ "$unload_status" = "200" ]; then
  pass "POST /api/fixtures/unload cleared the active fixture"
else
  fail "unload returned $unload_status, expected 200"
fi

echo "curling the plate proxy's /api/invoices again (should now be the real upstream) ..."
curl -s -D "$UNLOADED_HEADERS" -o "$UNLOADED_BODY" "http://127.0.0.1:$PLATE_PORT/api/invoices" >/dev/null

if ! grep -qi '^x-jig-fixture:' "$UNLOADED_HEADERS"; then
  pass "after unload, x-jig-fixture is absent — the interceptor declined"
else
  fail "after unload, x-jig-fixture is STILL present — the interceptor did not release control"
fi

if diff -q "$UNLOADED_BODY" "$UPSTREAM_BODY" >/dev/null 2>&1; then
  pass "after unload, the plate's /api/invoices matches the real API again"
else
  fail "after unload, the plate's /api/invoices no longer matches the real API"
fi

if [ "$ALL_PASS" -eq 1 ]; then
  echo "SMOKE: PASS"
  exit 0
else
  echo "SMOKE: FAIL — logs at $API_LOG, $WEB_LOG, $JIG_LOG, $SURVEY_LOG"
  exit 1
fi
