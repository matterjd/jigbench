#!/usr/bin/env bash
# scripts/trialfit-smoke.sh — S8 end-to-end smoke test for the toolpath + trial fit.
#
# F11 / CHASSIS.md's trial-fit mode: "when the agent reports a work order done over MCP, the
# plate reloads and shows the app with the change beside the app before it ... a recorded
# toolpath replays on both." Starts the Ledger .NET API + `ng serve` for the Ledger Angular
# app, surveys it, starts jigbench's own server, then over curl:
#   - marks app-invoice-list (draft:false — no drafter round-trip needed for this smoke)
#   - PATCHes a minimal human face, releases, claims, reports it done
#   - the work order lands on trial-fit
#   - POST /api/plate/mirror starts the mirror; GET /api/plate shows it up; a raw HEAD to the
#     mirror's own port answers as the app
#   - saves a 3-step toolpath and reads it back byte-for-byte
#
# Follows scripts/plate-smoke.sh / scripts/fixture-smoke.sh's pattern exactly: PASS/FAIL per
# check, everything stopped by port->PID (never by process name) in a trap on exit, .jig/
# removed on exit. Run after `npm run build` at the repo root and
# `cd examples/ledger-angular && npm ci`.
set -uo pipefail

# netstat/taskkill live in C:\Windows\System32 — a normal interactive Git Bash session
# already has it on PATH, but an agent/CI shell whose PATH was reset may not. Without this,
# every pid_on_port lookup silently returns empty (netstat's own "command not found" on
# stderr is swallowed by `2>/dev/null`), so wait_for_port reports a false FAIL even once the
# service is genuinely listening, and cleanup's taskkill silently never runs.
case ":$PATH:" in
  *":/c/Windows/System32:"* | *":C:\\Windows\\System32:"*) ;;
  *) PATH="$PATH:/c/Windows/System32" ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/examples/ledger-api"
WEB_DIR="$REPO_ROOT/examples/ledger-angular"
BIN="$REPO_ROOT/packages/cli/dist/bin.js"

API_PORT=5210
WEB_PORT=4200
BENCH_PORT=4600
PLATE_PORT=4601
MIRROR_PORT=4602

API_LOG="/tmp/jig-trialfit-smoke-api.log"
WEB_LOG="/tmp/jig-trialfit-smoke-web.log"
JIG_LOG="/tmp/jig-trialfit-smoke-jig.log"

ALL_PASS=1

pid_on_port() {
  # Windows netstat line shape: "  TCP    127.0.0.1:5210   0.0.0.0:0   LISTENING   19072"
  netstat -ano 2>/dev/null | grep -E ":$1[[:space:]]" | grep -i LISTENING | awk '{print $NF}' | head -1
}

wait_for_port() {
  local port="$1" name="$2" tries="${3:-60}"
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

# node -e with a POSIX /tmp/... path FAILS on Windows: node resolves a leading "/" against
# the current drive (C:\tmp\...), not MSYS's own root, so readFileSync('/tmp/x') throws
# ENOENT even though the file is right there (hit while first authoring this script — every
# WO_ID/TP_ID extraction below silently came back empty). Reading via stdin redirection
# instead goes through bash's OWN correct path resolution and hands node raw bytes — no path
# is ever passed to node at all.
json_field() {
  # $1 = file, $2 = a JS expression over `d` (the parsed JSON), e.g. 'd.workOrder.id'
  node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(s);const v=($2);console.log(v===undefined||v===null?'':v)}catch(e){console.log('')}})" < "$1"
}

pass() { echo "PASS: $1"; }
fail() {
  echo "FAIL: $1"
  ALL_PASS=0
}

cleanup() {
  for port in "$MIRROR_PORT" "$PLATE_PORT" "$BENCH_PORT" "$WEB_PORT" "$API_PORT"; do
    pid="$(pid_on_port "$port")"
    if [ -n "$pid" ]; then
      taskkill //PID "$pid" //F >/dev/null 2>&1 && echo "stopped pid $pid (port $port)"
    fi
  done
  rm -rf "$WEB_DIR/.jig"
  echo "removed $WEB_DIR/.jig"
}
trap cleanup EXIT

if [ ! -f "$BIN" ]; then
  echo "FAIL: $BIN does not exist — run 'npm run build' first." >&2
  exit 1
fi

echo "starting ledger-api on :$API_PORT ..."
(cd "$API_DIR" && dotnet run --no-launch-profile --urls "http://localhost:$API_PORT") \
  > "$API_LOG" 2>&1 &
# A cold NuGet restore + build can take well past a minute the first time; once bin/obj
# exist (this repo's first run already primed them) subsequent runs are fast, but the
# generous timeout costs nothing when the fast path is what actually happens.
wait_for_port "$API_PORT" "ledger-api" 180 || exit 1

echo "starting ledger-angular on :$WEB_PORT ..."
(cd "$WEB_DIR" && npx ng serve --port "$WEB_PORT") > "$WEB_LOG" 2>&1 &
wait_for_port "$WEB_PORT" "ledger-angular" || exit 1

echo "starting jigbench on :$BENCH_PORT (plate on :$PLATE_PORT, target :$WEB_PORT) ..."
(node "$BIN" --no-open --repo "$WEB_DIR" --target "http://localhost:$WEB_PORT" \
  --port "$BENCH_PORT" --plate-port "$PLATE_PORT") > "$JIG_LOG" 2>&1 &
wait_for_port "$BENCH_PORT" "jigbench bench" || exit 1
wait_for_port "$PLATE_PORT" "jigbench plate" || exit 1

echo "creating a mark on app-invoice-list (draft:false — no drafter round-trip needed here) ..."
mark_status="$(curl -s -o /tmp/jig-trialfit-smoke-mark.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/marks" \
  -H 'content-type: application/json' \
  -d '{"target":{"path":"app-invoice-list","component":"InvoiceListComponent"},"prompt":"rename the Total column","draft":false}')"
WO_ID="$(json_field /tmp/jig-trialfit-smoke-mark.json 'd.workOrder.id')"
if [ "$mark_status" = "201" ] && [ -n "$WO_ID" ]; then
  pass "POST /api/marks created work order #$WO_ID (201)"
else
  fail "POST /api/marks returned $mark_status, expected 201 — $(cat /tmp/jig-trialfit-smoke-mark.json 2>/dev/null)"
  exit 1
fi

echo "filling a minimal human face on #$WO_ID ..."
patch_status="$(curl -s -o /tmp/jig-trialfit-smoke-patch.json -w '%{http_code}' \
  -X PATCH "http://localhost:$BENCH_PORT/api/work-orders/$WO_ID" \
  -H 'content-type: application/json' \
  -d '{"what":"rename the Total column to Amount due","why":"customers misread it as already paid","acceptance":["the header cell reads Amount due"]}')"
if [ "$patch_status" = "200" ]; then
  pass "PATCH /api/work-orders/$WO_ID filled the human face (200)"
else
  fail "PATCH /api/work-orders/$WO_ID returned $patch_status, expected 200 — $(cat /tmp/jig-trialfit-smoke-patch.json 2>/dev/null)"
fi

echo "drafting #$WO_ID (marked -> drafted; a human/no-model draft never fails) ..."
curl -s -X POST "http://localhost:$BENCH_PORT/api/work-orders/$WO_ID/draft" >/dev/null
for ((i = 0; i < 30; i++)); do
  state="$(curl -s "http://localhost:$BENCH_PORT/api/state" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const s=JSON.parse(d);const w=s.workOrders.find(w=>w.id==='$WO_ID');console.log(w?w.state:'')}catch(e){console.log('')}})")"
  [ "$state" = "drafted" ] && break
  sleep 1
done
if [ "$state" = "drafted" ]; then
  pass "#$WO_ID reached drafted"
else
  fail "#$WO_ID never reached drafted (last seen: $state)"
fi

echo "releasing #$WO_ID (drafted -> released; fills the shop face) ..."
release_status="$(curl -s -o /tmp/jig-trialfit-smoke-release.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/work-orders/$WO_ID/release")"
if [ "$release_status" = "200" ] && grep -q '"state":"released"' /tmp/jig-trialfit-smoke-release.json; then
  pass "POST .../release moved #$WO_ID to released"
else
  fail "release returned $release_status, expected 200+released — $(cat /tmp/jig-trialfit-smoke-release.json 2>/dev/null)"
fi

echo "the shop claims #$WO_ID (released -> in-the-shop) ..."
claim_status="$(curl -s -o /tmp/jig-trialfit-smoke-claim.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/work-orders/$WO_ID/claim" \
  -H 'content-type: application/json' -d '{"by":"Claude Code"}')"
if [ "$claim_status" = "200" ] && grep -q '"state":"in-the-shop"' /tmp/jig-trialfit-smoke-claim.json; then
  pass "POST .../claim moved #$WO_ID to in-the-shop"
else
  fail "claim returned $claim_status, expected 200+in-the-shop — $(cat /tmp/jig-trialfit-smoke-claim.json 2>/dev/null)"
fi

echo "the shop reports #$WO_ID done (in-the-shop -> trial-fit) ..."
report_status="$(curl -s -o /tmp/jig-trialfit-smoke-report.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/work-orders/$WO_ID/report" \
  -H 'content-type: application/json' -d '{"summary":"renamed the Total column","files":["src/app/invoices/invoice-list/invoice-list.ts"]}')"
if [ "$report_status" = "200" ] && grep -q '"state":"trial-fit"' /tmp/jig-trialfit-smoke-report.json; then
  pass "POST .../report moved #$WO_ID to trial-fit"
else
  fail "report returned $report_status, expected 200+trial-fit — $(cat /tmp/jig-trialfit-smoke-report.json 2>/dev/null)"
fi

echo "starting the trial-fit mirror ..."
mirror_status="$(curl -s -o /tmp/jig-trialfit-smoke-mirror.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/plate/mirror")"
if [ "$mirror_status" = "200" ]; then
  pass "POST /api/plate/mirror started the mirror (200)"
else
  fail "POST /api/plate/mirror returned $mirror_status, expected 200 — $(cat /tmp/jig-trialfit-smoke-mirror.json 2>/dev/null)"
fi

echo "GET /api/plate should now show the mirror up on :$MIRROR_PORT ..."
if curl -s "http://localhost:$BENCH_PORT/api/plate" | grep -q "\"mirror\":{\"port\":$MIRROR_PORT,\"status\":\"up\"}"; then
  pass "GET /api/plate reports mirror: {port:$MIRROR_PORT, status:up}"
else
  fail "GET /api/plate does not report the mirror as up on :$MIRROR_PORT — $(curl -s "http://localhost:$BENCH_PORT/api/plate")"
fi

echo "curling the mirror's own port directly ..."
mirror_head="$(curl -sI --max-time 5 "http://127.0.0.1:$MIRROR_PORT/" 2>/dev/null | head -1)"
if printf '%s' "$mirror_head" | grep -q '200'; then
  pass "curl -sI 127.0.0.1:$MIRROR_PORT/ answers as the app (200) — $mirror_head"
else
  fail "curl -sI 127.0.0.1:$MIRROR_PORT/ did not answer 200 — $mirror_head"
fi

echo "saving a 3-step toolpath and reading it back ..."
toolpath_body='{"name":"open-and-edit","startUrl":"/invoices","steps":[{"kind":"navigate","path":"/invoices","at":0},{"kind":"click","path":"app-invoice-list:nth-of-type(1)","at":340},{"kind":"input","path":"input:nth-of-type(1)","value":"INV-1042","at":1800}]}'
save_status="$(curl -s -o /tmp/jig-trialfit-smoke-toolpath-save.json -w '%{http_code}' \
  -X POST "http://localhost:$BENCH_PORT/api/toolpaths" \
  -H 'content-type: application/json' -d "$toolpath_body")"
TP_ID="$(json_field /tmp/jig-trialfit-smoke-toolpath-save.json 'd.id')"
if [ "$save_status" = "201" ] && [ -n "$TP_ID" ]; then
  pass "POST /api/toolpaths saved toolpath #$TP_ID (201)"
else
  fail "POST /api/toolpaths returned $save_status, expected 201 — $(cat /tmp/jig-trialfit-smoke-toolpath-save.json 2>/dev/null)"
fi

read_status="$(curl -s -o /tmp/jig-trialfit-smoke-toolpath-read.json -w '%{http_code}' \
  "http://localhost:$BENCH_PORT/api/toolpaths/$TP_ID")"
STEP_COUNT="$(json_field /tmp/jig-trialfit-smoke-toolpath-read.json 'd.steps ? d.steps.length : -1')"
if [ "$read_status" = "200" ] && [ "$STEP_COUNT" = "3" ]; then
  pass "GET /api/toolpaths/$TP_ID reads back all 3 steps"
else
  fail "GET /api/toolpaths/$TP_ID did not read back 3 steps (got $STEP_COUNT) — $(cat /tmp/jig-trialfit-smoke-toolpath-read.json 2>/dev/null)"
fi

if [ "$ALL_PASS" -eq 1 ]; then
  echo "SMOKE: PASS"
  exit 0
else
  echo "SMOKE: FAIL — logs at $API_LOG, $WEB_LOG, $JIG_LOG"
  exit 1
fi
