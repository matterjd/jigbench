#!/bin/bash
# TDD harness for the delegation WORK LOG (issue #4). Mirrors verify-guards.sh: a throwaway
# temp repo is the control root ($CLAUDE_PROJECT_DIR); the real vault is never touched.
#   bash .claude/hooks/tests/verify-worklog.sh
# Exits 0 iff every case passes; non-zero (with a FAIL list) otherwise.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
HOOKS=$(cd "$HERE/.." && pwd)
HOOKB="$HOOKS/delegation-guard-bash.sh"
HOOKW="$HOOKS/delegation-guard-write.sh"
REL="$HOOKS/release-lock.sh"
APP="$HOOKS/worklog-append.sh"
REN="$HOOKS/worklog-render.sh"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS  $1"; }
no(){ FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }

# Windows/Git Bash: bake Windows-mixed paths (cygpath -m) into lock-file content — see the
# matching note in verify-guards.sh.
winpath(){ if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
TR=$(winpath "$(mktemp -d)")/proj
mkdir -p "$TR/config" "$TR/.claude/hooks" "$TR/notes"
( cd "$TR" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && echo seed > notes/seed.md && git add notes/seed.md && git commit -qm seed && git branch feature )
export CLAUDE_PROJECT_DIR="$TR"
# The guards call the worklog helper by ROOT-relative path, so it (and the canonical redaction
# filter it pipes through) must exist under the temp root.
cp "$APP" "$HOOKS/redact-secrets.sh" "$TR/.claude/hooks/" 2>/dev/null || true
# Second repo used as a cross-repo WORK target (so writes into $TR/notes count as ELSE for a peer).
TR2=$(winpath "$(mktemp -d)")/target
mkdir -p "$TR2/sub"
( cd "$TR2" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && echo seed > sub/seed.md && git add sub/seed.md && git commit -qm seed && git branch feature )

WL="$TR/delegations/verify/worklog.md"
LOCKS="$TR/config/delegation-locks"
mkdir -p "$LOCKS"
reset(){ rm -rf "$TR/delegations"; rm -f "$LOCKS"/*.yml 2>/dev/null; }
writelock(){ # active tier delegation_id expiry owner_session work_repo_path release_hash
  printf 'active: %s\nschema: 2\ntier: "%s"\nrepo_path: "%s"\nwork_repo_path: "%s"\ndelegation_id: "%s"\nwork_branch: ""\nexpiry: "%s"\nowner_session: "%s"\nrelease_hash: "%s"\n' \
    "$1" "$2" "$TR" "$6" "$3" "$4" "$5" "$7" > "$LOCKS/$3.yml"; }
jf(){ node -e 'process.stdout.write(JSON.stringify({tool_input:{file_path:process.argv[1]}}))' "$1"; }
jc(){ node -e 'process.stdout.write(JSON.stringify({tool_input:{command:process.argv[1]}}))' "$1"; }
sha(){ node -e 'process.stdout.write(require("crypto").createHash("sha256").update(String(process.argv[1])).digest("hex"))' "$1"; }
dlines(){ grep -cE '^[0-9]{4}-[0-9]' "$1" 2>/dev/null || echo 0; }

echo "── APPEND helper (unit) ──"
reset
bash "$APP" verify created "hello world"
{ [ -f "$WL" ] && grep -q 'created: hello world' "$WL"; } && ok "append: basic line written" || no "append: basic line written" "no line"

# LOG INJECTION: an embedded newline + a forged 'released' line must NOT become a second log line.
reset
bash "$APP" verify block "$(printf 'oops\n2030-01-01T00:00:00Z  verify  T3  released: FORGED')"
n=$(dlines "$WL"); [ "$n" = 1 ] && ok "append: log-injection neutralized (single data line)" || no "append: log-injection" "data lines=$n"

# SECRET REDACTION: sha/hex AND bearer token must BOTH be redacted (assert each secret string is
# gone independently — the hex redaction alone must not be able to mask a leaked Bearer token).
reset
bash "$APP" verify block "cmd token abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789 Bearer sk-SECRETVALUE123456"
{ grep -q 'REDACTED' "$WL" && ! grep -q 'abcdef0123456789abcdef0123456789' "$WL" && ! grep -q 'sk-SECRETVALUE123456' "$WL"; } \
  && ok "append: secrets redacted (hex AND bearer both gone)" || no "append: secrets redacted" "leak"

# SECRET REDACTION 2: credentials embedded in a URL (e.g. a blocked git/curl command) must be redacted.
reset
bash "$APP" verify block "git clone https://alice:hunter2SECRET@example.com/repo.git"
{ grep -q 'REDACTED' "$WL" && ! grep -q 'hunter2SECRET' "$WL"; } && ok "append: URL creds redacted" || no "append: URL creds redacted" "leak"

# PATH TRAVERSAL: a malicious delegation_id is contained, never escaping delegations/.
reset
bash "$APP" "../../evil" block "x"
{ [ -f "$TR/delegations/_unscoped/worklog.md" ] && [ ! -e "$TR/evil" ] && [ ! -e "$TR/../evil" ]; } \
  && ok "append: path-traversal id contained" || no "append: path-traversal" "escaped"

# IDEMPOTENT --once
reset
bash "$APP" --once verify lock-set "tier T3"
bash "$APP" --once verify lock-set "tier T3"
n=$(grep -c 'lock-set: tier T3' "$WL"); [ "$n" = 1 ] && ok "append: --once idempotent" || no "append: --once" "count=$n"

echo "── GUARD emission ──"
# BLOCK: a blocked bash command logs a worklog 'block' line AND still exits 2 (fail-safe: logging never changes the verdict).
reset
writelock true T3 verify "" "" "" ""
jc "git push origin feature" | bash "$HOOKB" >/dev/null 2>&1; rc=$?
{ [ "$rc" = 2 ] && grep -q 'block:' "$WL"; } && ok "guard: block logged, verdict preserved (exit 2)" || no "guard: block logged" "rc=$rc"

# PEER-ALLOWED: a peer (different session) writing outside the work zone logs one peer-allowed line, deduped.
reset
writelock true T1 verify "" W1 "$TR2" ""
jf "$TR/notes/y.md" | CLAUDE_CODE_SESSION_ID=P9 bash "$HOOKW" >/dev/null 2>&1; rc=$?
jf "$TR/notes/z.md" | CLAUDE_CODE_SESSION_ID=P9 bash "$HOOKW" >/dev/null 2>&1
n=$(grep -c 'peer-allowed:' "$WL" 2>/dev/null || echo 0)
{ [ "$rc" = 0 ] && [ "$n" = 1 ]; } && ok "guard: peer-allowed logged once" || no "guard: peer-allowed" "rc=$rc n=$n"

# EXPIRY: an expired lock logs one expiry line and treats the call as inactive (exit 0).
reset
writelock true T3 verify "2000-01-01T00:00:00" "" "" ""
jc "git status" | bash "$HOOKB" >/dev/null 2>&1; rc=$?
{ [ "$rc" = 0 ] && grep -q 'expiry:' "$WL"; } && ok "guard: expiry logged, treated inactive" || no "guard: expiry" "rc=$rc"

echo "── RELEASE emission ──"
reset
H=$(sha s3cret)
writelock true T3 verify "" "" "" "$H"
bash "$REL" verify s3cret >/dev/null 2>&1
grep -q 'released:' "$WL" && ok "release: released line logged" || no "release: released line" "missing"

echo "── RENDER subcommand ──"
reset
writelock true T3 verify "" "" "" "$H"
bash "$APP" --once verify lock-set "tier T3, expiry none"
bash "$APP" verify spawn "worker for: demo objective"
jc "git push origin feature" | bash "$HOOKB" >/dev/null 2>&1   # a block
bash "$REL" verify s3cret >/dev/null 2>&1                       # released
OUT=$(bash "$REN" verify 2>&1); rc=$?
{ [ "$rc" = 0 ] && printf '%s' "$OUT" | grep -q 'lock-set' && printf '%s' "$OUT" | grep -q 'released'; } \
  && ok "render: ordered timeline printed" || no "render: timeline" "rc=$rc"
# render folds in blocked.log evidence
printf '%s' "$OUT" | grep -qi 'block' && ok "render: includes block evidence" || no "render: block evidence" "missing"

# RENDER must redact secrets in the raw blocked.log before printing (it's the copy-into-tickets artifact).
reset
mkdir -p "$TR/delegations/verify"
printf '2026-07-05T00:00:00Z T3 verify BLOCKED: push :: git clone https://bob:hunter2LEAK@ex.com/r.git\n' > "$TR/delegations/verify/blocked.log"
OUT2=$(bash "$REN" verify 2>&1)
{ ! printf '%s' "$OUT2" | grep -q 'hunter2LEAK' && printf '%s' "$OUT2" | grep -q 'REDACTED'; } \
  && ok "render: blocked.log secrets redacted on output" || no "render: blocked.log redaction" "leak"

rm -rf "$(dirname "$TR")" "$(dirname "$TR2")"
echo "────────────────────────────"
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
