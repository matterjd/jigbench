#!/bin/bash
# Brain-side delegation lock ACTIVATION (multi-lock era).
#
#   Usage: bash .claude/hooks/activate-lock.sh <delegation_id> <tier> <work_repo_path|""> \
#                                              <work_branch> <expiry-iso-utc> <release_hash> \
#                                              [--allow-no-owner]
#          bash .claude/hooks/activate-lock.sh --respawn <delegation_id> <new_release_hash> \
#                                              [<extend-minutes>]
#
# Writes config/delegation-locks/<delegation_id>.yml ATOMICALLY (temp file + mv) and appends
# the lock-set worklog line itself, so the brain needs no extra guarded command inside the
# locked window. Like release-lock.sh, this command carries no shell write TARGET, so the
# bash guard's target-based control-plane rule allows it even while other locks are active —
# that is exactly what enables a SECOND brain session to activate its own lock concurrently.
# Guarded sessions can never hand-write the lock dir (that IS a control-plane target).
#
# INVARIANTS enforced here (the guards assume them):
#   1. Single grant PER WORK REPO — refuse if a live lock already covers the same normalized
#      work_repo_path (blank = the control root). Registered repos are never nested, so
#      exact-path equality after normalization (resolve + lowercase on Windows) is the test.
#   2. PER-REPO LOCKS (mn#46, Matter's ruling 2026-08-22; pass 5 implements): one session may
#      hold N live locks provided their zones are DISJOINT — invariant 1 already enforces the
#      disjointness. The worker-containment half of the old one-per-session rule is preserved
#      mechanically: activation is REFUSED when the CALLER's cwd sits inside any live lock's
#      work zone — a worker lives in its zone, so it cannot mint itself a second one from
#      there. (Edge accepted conservatively: while a live lock covers the control root itself,
#      the brain also cannot mint a second lock, because its cwd is inside that zone.)
#   3. Mandatory future expiry, valid tier, sha256-shaped release_hash.
# Expired lock files are PRUNED here (worklog'd then deleted) — guards never delete state.
#
# LIMIT (unchanged doctrine): guardrail, not a sandbox. SID forgery or indirection scripts
# defeat this; see SUBAGENT-AUTHORIZATION.md §6 for the maintenance runbook.
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || { echo "activate-lock: no project root"; exit 1; }
LOCKS_DIR="$ROOT/config/delegation-locks"
mkdir -p "$LOCKS_DIR" 2>/dev/null
SID="${CLAUDE_CODE_SESSION_ID:-}"
WL="$ROOT/.claude/hooks/worklog-append.sh"

sanitize_id() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._-'; }
val() { grep -E "^$2:" "$1" | head -n1 | sed -E "s/^$2:[[:space:]]*//" | tr -d '"' | tr -d '\r'; }
refuse() { echo "activate-lock: REFUSED — $1"; exit 2; }

# ---- prune expired locks (worklog once, then delete) ----
for f in "$LOCKS_DIR"/*.yml; do
  [ -f "$f" ] || continue
  [ "$(val "$f" active)" = "true" ] || { rm -f "$f"; continue; }
  E=$(val "$f" expiry)
  [ -n "$E" ] || continue
  PAST=$(node -e 'const t=Date.parse(process.argv[1]); process.stdout.write(!Number.isNaN(t)&&t<Date.now()?"1":"0")' "$E" 2>/dev/null)
  if [ "$PAST" = "1" ]; then
    D=$(val "$f" delegation_id); [ -n "$D" ] || D=$(basename "$f" .yml)
    bash "$WL" --once "$D" expiry "expired lock pruned at activation (expiry $E)" >/dev/null 2>&1 || true
    rm -f "$f"
  fi
done

# ---- respawn mode: rotate the release hash under the SAME delegation id (A3) ----
if [ "${1:-}" = "--respawn" ]; then
  DID=$(sanitize_id "${2:-}")
  NEWHASH="${3:-}"
  EXTEND="${4:-}"
  case "$DID" in ""|*..*) refuse "bad delegation id" ;; esac
  LOCK="$LOCKS_DIR/$DID.yml"
  [ -f "$LOCK" ] || refuse "no live lock '$DID' to respawn under"
  printf '%s' "$NEWHASH" | grep -qE '^[0-9a-f]{64}$' || refuse "new release_hash must be 64 hex chars (sha256)"
  OWNER=$(val "$LOCK" owner_session)
  [ -n "$SID" ] || refuse "no CLAUDE_CODE_SESSION_ID in this environment — respawn is owner-gated"
  [ "$OWNER" = "$SID" ] || refuse "only the owning session may respawn this lock"
  EXP=$(val "$LOCK" expiry)
  if [ -n "$EXTEND" ]; then
    EXP=$(node -e 'const m=parseInt(process.argv[1],10)||0; process.stdout.write(new Date(Date.now()+m*60000).toISOString().replace(/\.\d+Z$/,"Z"))' "$EXTEND" 2>/dev/null)
  fi
  TMP=$(mktemp "$LOCKS_DIR/.tmp.XXXXXX") || refuse "cannot create temp lock file"
  printf 'active: true\nschema: 2\ndelegation_id: "%s"\ntier: "%s"\nrepo_path: "%s"\nwork_repo_path: "%s"\nwork_branch: "%s"\nexpiry: "%s"\nowner_session: "%s"\nrelease_hash: "%s"\n' \
    "$DID" "$(val "$LOCK" tier)" "$(val "$LOCK" repo_path)" "$(val "$LOCK" work_repo_path)" \
    "$(val "$LOCK" work_branch)" "$EXP" "$OWNER" "$NEWHASH" > "$TMP"
  mv -f "$TMP" "$LOCK"
  bash "$WL" "$DID" respawn "worker respawned under the same grant — release hash rotated, expiry $EXP" >/dev/null 2>&1 || true
  echo "activate-lock: respawn OK — lock '$DID' rotated (expiry $EXP)"
  exit 0
fi

# ---- normal activation ----
RAW_ID="${1:-}"; TIER="${2:-}"; WORKP="${3:-}"; BRANCH="${4:-}"; EXPIRY="${5:-}"; RHASH="${6:-}"
ALLOW_NO_OWNER=""
[ "${7:-}" = "--allow-no-owner" ] && ALLOW_NO_OWNER=1

DID=$(sanitize_id "$RAW_ID")
case "$DID" in ""|*..*) refuse "bad delegation id '$RAW_ID'" ;; esac
case "$TIER" in T1|T2|T3|T4) : ;; *) refuse "invalid tier '$TIER' (T1|T2|T3|T4)" ;; esac
[ -n "$BRANCH" ] || refuse "work_branch required"
printf '%s' "$RHASH" | grep -qE '^[0-9a-f]{64}$' || refuse "release_hash must be 64 hex chars (sha256 of the release token)"
FUTURE=$(node -e 'const t=Date.parse(process.argv[1]); process.stdout.write(!Number.isNaN(t)&&t>Date.now()?"1":"0")' "$EXPIRY" 2>/dev/null)
[ "$FUTURE" = "1" ] || refuse "expiry '$EXPIRY' is not a valid FUTURE ISO8601 timestamp (mandatory backstop)"
if [ -z "$SID" ] && [ -z "$ALLOW_NO_OWNER" ]; then
  refuse "no CLAUDE_CODE_SESSION_ID — an ownerless lock confines every session (pass --allow-no-owner only in a test harness)"
fi

# normalized zone of the request (blank work repo = control root)
NORM() { node -e 'const p=require("path");let x=p.resolve(process.argv[1]);if(process.platform==="win32")x=x.toLowerCase();process.stdout.write(x)' "$1" 2>/dev/null; }
REQZ=$(NORM "${WORKP:-$ROOT}")
[ -n "$REQZ" ] || refuse "cannot normalize work_repo_path '$WORKP'"

# Pass 7 (mn#47): a zone that resolves to a MISSING directory inverts the write guard —
# every legitimate write refused, a relative write allowed into a zone no grant named —
# while this script printed OK (live 2026-08-28: POSIX-form /c/... resolved against the
# drive to C:\c\...). Containment is meaningless until the zone provably EXISTS and, for a
# cross-repo grant, names a REGISTERED sibling (workspace.yml repos: — the
# cross_repo_targets: "registered" promise, previously prose-only). Fail closed on both.
DIREX=$(node -e 'const fs=require("fs");try{process.stdout.write(fs.statSync(process.argv[1]).isDirectory()?"1":"0")}catch(e){process.stdout.write("0")}' "$REQZ" 2>/dev/null)
[ "$DIREX" = "1" ] || refuse "work_repo_path '$WORKP' resolves to '$REQZ', which is not an existing directory (mn#47 — POSIX-form paths resolve against the drive; pass the Windows-form on-disk path)"
if [ -n "$WORKP" ]; then
  WS="$ROOT/config/workspace.yml"
  REG_OK=""
  if [ -f "$WS" ]; then
    while IFS= read -r RP; do
      RP=${RP//\\\\/\\}
      [ -n "$RP" ] || continue
      [ "$(NORM "$RP")" = "$REQZ" ] && { REG_OK=1; break; }
    done < <(grep -E '^[[:space:]]+path:[[:space:]]*"' "$WS" | sed -E 's/^[[:space:]]+path:[[:space:]]*"//; s/".*$//')
  fi
  [ -n "$REG_OK" ] || refuse "work_repo_path '$WORKP' is not a registered sibling (config/workspace.yml repos:) — cross_repo_targets is 'registered'"
fi

LOCK="$LOCKS_DIR/$DID.yml"
[ -f "$LOCK" ] && refuse "a lock named '$DID' already exists (release it or pick a new id)"

for f in "$LOCKS_DIR"/*.yml; do
  [ -f "$f" ] || continue
  [ "$(val "$f" active)" = "true" ] || continue
  OD=$(val "$f" delegation_id); [ -n "$OD" ] || OD=$(basename "$f" .yml)
  OZ=$(NORM "$(val "$f" work_repo_path)"); OW=$(val "$f" work_repo_path)
  [ -n "$OW" ] || OZ=$(NORM "$ROOT")
  if [ "$OZ" = "$REQZ" ]; then
    refuse "work repo already locked by '$OD' (expires $(val "$f" expiry)) — single grant per work repo"
  fi
  # mn#46 worker containment: the caller may not mint a lock while standing inside a live zone.
  CALLZ=$(NORM "$PWD")
  case "$CALLZ" in
    "$OZ"|"$OZ"/*|"$OZ"\\*)
      refuse "activation from inside live lock '$OD''s work zone — a worker cannot mint itself a second zone (per-repo locks, mn#46)" ;;
  esac
done

TMP=$(mktemp "$LOCKS_DIR/.tmp.XXXXXX") || refuse "cannot create temp lock file"
printf 'active: true\nschema: 2\ndelegation_id: "%s"\ntier: "%s"\nrepo_path: "%s"\nwork_repo_path: "%s"\nwork_branch: "%s"\nexpiry: "%s"\nowner_session: "%s"\nrelease_hash: "%s"\n' \
  "$DID" "$TIER" "$ROOT" "$WORKP" "$BRANCH" "$EXPIRY" "$SID" "$RHASH" > "$TMP"
mv -f "$TMP" "$LOCK"

bash "$WL" --once "$DID" lock-set "lock activated: tier $TIER, work-repo ${WORKP:-self}, branch $BRANCH, expiry $EXPIRY, owner ${SID:0:8}" >/dev/null 2>&1 || true
echo "activate-lock: OK — $DID active (tier $TIER, work-repo ${WORKP:-self}, expiry $EXPIRY). KEEP THE RELEASE TOKEN — release-lock.sh needs the preimage, not the hash; --respawn is the only recovery (mn#47)."
exit 0
