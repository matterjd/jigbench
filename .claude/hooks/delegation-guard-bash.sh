#!/bin/bash
# Tier-aware delegation guard for Bash (multi-lock era). PORTABLE: the CONTROL root is
# $CLAUDE_PROJECT_DIR (fallback: git toplevel) — the lock DIRECTORY (config/delegation-locks/)
# lives here and is read from here. Each active lock file names a WORK zone (its
# work_repo_path; blank = the control root). The caller's session either OWNS a lock
# (owner_session matches $CLAUDE_CODE_SESSION_ID — a spawned worker inherits the brain's id)
# and is confined + tier-gated against it, or owns none (pure PEER) and is bound only by the
# HARD RULES. Ambiguity (no owner recorded / no session id) stays owned/confined (fail-safe).
#
# Control-plane writes are matched on the command's actual WRITE TARGETS (lib/write-targets.js),
# NOT on path mentions — a grep pattern, issue body, or prose mention of a control path never
# blocks. An unparseable command falls back to the legacy mention rule (fail-closed only where
# control paths are actually named alongside a write token).
#
# No lock dir / no lock files -> allow (brain's normal state).
# Parse/enumeration failure while lock files exist -> fail CLOSED.
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0
LOCKS_DIR="$ROOT/config/delegation-locks"
[ -d "$LOCKS_DIR" ] || exit 0
# P1 (pass 5 follow-through): builtin glob, not ls — needs no PATH (the ls form failed OPEN
# under a fully shed PATH: rc 127 took the || exit 0 branch with live locks present), and it
# saves a fork on every Bash call. stdin is drained only after the early-exits.
FOUND=""; for _f in "$LOCKS_DIR"/*.yml; do [ -e "$_f" ] && { FOUND=1; break; }; done
[ -n "$FOUND" ] || exit 0
INPUT=$(cat)
HOOKDIR=$(cd "$(dirname "$0")" && pwd)
SID="${CLAUDE_CODE_SESSION_ID:-}"

COMMAND=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write(String((o.tool_input&&o.tool_input.command)||""))}catch(e){process.exit(3)}})')
PARSE=$?
# Pass 7 (mn#48): the hook event's cwd — one attribution source for the zone-scoped commit
# rule below. Empty on any failure; never load-bearing for a block on its own.
HOOKCWD=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write(String(o.cwd||""))}catch(e){}})' 2>/dev/null)
NORMP() { node -e 'const p=require("path");let x=p.resolve(process.argv[1]);if(process.platform==="win32")x=x.toLowerCase();process.stdout.write(x)' "$1" 2>/dev/null; }

ENUM=$(LOCKS_DIR="$LOCKS_DIR" SID="$SID" node "$HOOKDIR/lib/locks.js" 2>/dev/null)
ERC=$?

LIVE=0; BADLOCK=""
OWNED_DIDS=(); OWNED_TIERS=(); OWNED_WORKS=()
ALL_DIDS=(); ALL_WORKS=()
while IFS=$'\t' read -r kind f1 f2 f3 f4 f5 f6; do
  case "$kind" in
    EXPIRED)
      bash "$ROOT/.claude/hooks/worklog-append.sh" --once "$f1" expiry "lock expiry $f2 passed — treated inactive; owner no longer confined" >/dev/null 2>&1 || true ;;
    BADLOCK) BADLOCK="$f1" ;;
    LOCK)
      did="$f1"; tier="$f2"; work="$f4"; rel="$f6"
      [ "$tier" = "-" ] && tier=""            # locks.js emits "-" for empty fields (tab-collapse guard)
      [ "$work" = "-" ] && work=""
      [ -n "$work" ] || work="$ROOT"
      LIVE=$((LIVE+1)); ALL_DIDS+=("$did"); ALL_WORKS+=("$work")
      if [ "$rel" = "owned" ] || [ "$rel" = "ambig" ]; then
        OWNED_DIDS+=("$did"); OWNED_TIERS+=("$tier"); OWNED_WORKS+=("$work")
      fi ;;
  esac
done <<< "$ENUM"

# Pass 6 (F1): attribute a block to the zone the COMMAND ACTUALLY NAMES. With one owned
# lock the answer is that lock, exactly as before. With MORE THAN ONE, a block naming no
# zone is filed `_unscoped` (config/delegation-blocked.log) and lists its candidates —
# because the 2026-08-27 concurrent run filed all three of the day's blocks against
# OWNED_DIDS[0], and locks.js sorts names, so one lane always won. The ledger then asserted
# one lane was never blocked and the other three times; both were false. A record that
# guesses is worse than one that admits it does not know.
ATTR_CAND=""
attr_zone() {
  local i
  for i in "${!OWNED_DIDS[@]}"; do
    if echo "$COMMAND" | grep -qF "${OWNED_WORKS[$i]}"; then
      ATTR_DID="${OWNED_DIDS[$i]}"; ATTR_TIER="${OWNED_TIERS[$i]}"; return 0
    fi
  done
  return 1
}
if [ "${#OWNED_DIDS[@]}" -gt 1 ]; then
  ATTR_DID=""; ATTR_TIER=""
  attr_zone || { ATTR_DID="_unscoped"; ATTR_TIER="?"; ATTR_CAND="${OWNED_DIDS[*]}"; }
else
  ATTR_DID="${OWNED_DIDS[0]:-${ALL_DIDS[0]:-_unscoped}}"
  ATTR_TIER="${OWNED_TIERS[0]:-?}"
fi

log_block() {
  local reason="$1" logdir logfile line
  if [ -n "$ATTR_DID" ] && [ "$ATTR_DID" != "_unscoped" ]; then logdir="$ROOT/delegations/$ATTR_DID"; logfile="$logdir/blocked.log";
  else logdir="$ROOT/config"; logfile="$logdir/delegation-blocked.log"; fi
  mkdir -p "$logdir" 2>/dev/null
  local cand=""; [ -n "$ATTR_CAND" ] && cand=" (candidates: $ATTR_CAND)"
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) ${ATTR_TIER:-?} ${ATTR_DID:-none} BLOCKED: $reason${cand} :: $COMMAND"
  printf '%s\n' "$line" >> "$logfile" 2>/dev/null
  bash "$ROOT/.claude/hooks/worklog-append.sh" "${ATTR_DID:-_unscoped}" block "$reason :: $COMMAND" >/dev/null 2>&1 || true
}
block() { log_block "$1"; echo "BLOCKED (tier ${ATTR_TIER:-?}): $1" >&2; exit 2; }

[ "$ERC" -ne 0 ] && block "lock enumeration failed (fail-closed)"
[ -n "$BADLOCK" ] && block "unreadable lock file '$BADLOCK' (fail-closed)"
[ "$LIVE" -eq 0 ] && exit 0
[ "$PARSE" -ne 0 ] && block "unparseable tool input (fail-closed)"

# ---- HARD RULES that bind EVERY session (lock owners AND peers) ----
# Repo delete/rename protection is TARGET-BASED (roadmap P2.5, maintenance pass 3). A
# destructive command blocks only when a resolved TARGET **is** a protected root, is an
# ANCESTOR of one, or cannot be resolved at all. A mere mention never blocks.
#
# This replaced a mention-based rule whose comment claimed it was "deliberately over-broad
# for destruction." It was over-broad in the direction that annoyed and UNDER-broad in the
# direction that mattered, and the suite now pins both halves:
#   over-broad  — `cd <repo> && rm -rf dist` is an ordinary build step and was refused in
#                 three sessions (2026-07-06 budget-automation, 07-21 wisp, 08-01 cc).
#   under-broad — `rm -rf /`, `rm -rf $VAR`, and deleting the repo's own PARENT directory
#                 all sailed through, because none of them MENTIONS the repo path.
#
# Destruction stays STRICTER than control-plane writes: write-targets.js documents $VAR and
# substitution targets as accepted false-ALLOWS (fine for a recoverable write, not for an
# rm -rf), so lib/destr-targets.js fails CLOSED on those, on globs, on `.`/`..`, on a bare
# name colliding with a repo basename, and on any AMBIGUOUS parse. If either helper cannot
# run at all, fall back to the legacy mention rule rather than allowing.
DESTR_WHY=""
destr_mention() {
  echo "$COMMAND" | grep -qF "$ROOT" && return 0
  echo "$COMMAND" | grep -qE "(^|[[:space:]/\"'])$(basename "$ROOT")([[:space:]/\"']|$)" && return 0
  local i
  for i in "${!ALL_WORKS[@]}"; do
    local Z="${ALL_WORKS[$i]}"
    if echo "$COMMAND" | grep -qF "$Z" \
       || echo "$COMMAND" | grep -qE "(^|[[:space:]/\"'])$(basename "$Z")([[:space:]/\"']|$)"; then
      ATTR_DID="${ALL_DIDS[$i]}"; return 0
    fi
  done
  return 1
}
# Attribute the block to a delegation for the worklog — logging only, never the decision.
destr_attr() {
  local i
  for i in "${!ALL_WORKS[@]}"; do
    if echo "$COMMAND" | grep -qF "${ALL_WORKS[$i]}"; then ATTR_DID="${ALL_DIDS[$i]}"; return 0; fi
  done
  return 0
}
# 0 = a target endangers a protected root (BLOCK); 1 = allow.
destr_hit() {
  local tg trc out rc
  tg=$(printf '%s' "$COMMAND" | node "$HOOKDIR/lib/write-targets.js" 2>/dev/null); trc=$?
  if [ "$trc" -ne 0 ]; then
    destr_mention && { DESTR_WHY="target extraction failed - legacy mention rule"; return 0; }
    return 1
  fi
  out=$(printf '%s\n' "$tg" | node "$HOOKDIR/lib/destr-targets.js" "$ROOT" ${ALL_WORKS[@]+"${ALL_WORKS[@]}"} 2>/dev/null); rc=$?
  case "$rc" in
    0) return 1 ;;
    1) DESTR_WHY=$(printf '%s' "$out" | tr '\t' ' '); destr_attr; return 0 ;;
    *) destr_mention && { DESTR_WHY="classifier unavailable - legacy mention rule"; return 0; }; return 1 ;;
  esac
}
if echo "$COMMAND" | grep -qE "\brm\b[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*"; then
  destr_hit && block "repo delete forbidden (HARD RULE): ${DESTR_WHY}"
fi
if echo "$COMMAND" | grep -qE "\bmv\b"; then
  destr_hit && block "repo rename/move forbidden (HARD RULE): ${DESTR_WHY}"
fi

# Control-plane writes: TARGET-BASED. Only a command whose actual write destination is a
# control path blocks; mentions never do. AMBIGUOUS parse -> legacy mention rule (fail-closed
# only when a control path is actually named next to a write token).
CTRLT='(^|[/\\])config[/\\]delegation-locks([/\\]|$)|(^|[/\\])config[/\\]delegation-active\.yml$|(^|[/\\])\.claude[/\\]hooks([/\\]|$)|(^|[/\\])\.claude[/\\]settings(\.local)?\.json$|(^|[/\\])SUBAGENT-AUTHORIZATION\.md$'
AMB=""
TGT=$(printf '%s' "$COMMAND" | node "$HOOKDIR/lib/write-targets.js" 2>/dev/null) || AMB=1
while IFS= read -r t; do
  [ -n "$t" ] || continue
  if [ "$t" = "AMBIGUOUS" ]; then AMB=1; continue; fi
  if printf '%s' "$t" | grep -qiE "$CTRLT"; then
    block "control-plane path is the write target (HARD RULE)"
  fi
done <<< "$TGT"
if [ -n "$AMB" ]; then
  CTRL='(config/delegation-locks|config/delegation-active\.yml|\.claude/hooks/|\.claude/settings(\.local)?\.json|subagent-authorization\.md)'
  if echo "$COMMAND" | grep -qiE "$CTRL" && echo "$COMMAND" | grep -qiE '(([^0-9&]|^)>|\btee\b|\bmv\b|\bcp\b|\bdd\b|\btruncate\b|\brm\b|sed[[:space:]]+-i)'; then
    block "control-plane write suspected in unparseable command (fail-closed fallback)"
  fi
fi

# A session owning NO lock (pure peer) has cleared repo-destruction + control-plane; the
# confinement gates below are the lock owners' concern only.
[ "${#OWNED_DIDS[@]}" -eq 0 ] && exit 0

# Normalize away git GLOBAL options (`-C <path>`, `-c <k=v>`, `--git-dir=…`, `--work-tree=…`,
# etc.) that sit between `git` and its subcommand, so `git -C /path push` is policed exactly
# like `git push`. Without this, a one-flag rewrite evades every push/commit HARD RULE below
# (issue #3 follow-up — false-negative found on the 2026-07-05 lifecycle live run). Only used
# for git-subcommand detection; COMMAND stays authoritative for logging and shell-write rules.
GITN=$(printf '%s' "$COMMAND" | sed -E 's/(^|[^[:alnum:]_])git[[:space:]]+((-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--git-dir[=[:space:]][^[:space:]]+|--work-tree[=[:space:]][^[:space:]]+|--namespace[=[:space:]][^[:space:]]+|--exec-path[=[:space:]][^[:space:]]+|-p|--paginate|--no-pager|--bare|--no-replace-objects|--literal-pathspecs)[[:space:]]+)+/\1git /g')

# ---- HARD RULE 1, zone-scoped (pass 7 / mn#48): never commit to main — judged against
# the repo the commit actually TARGETS. The old form checked EVERY owned zone's branch, so
# one lane still on main blocked another lane's commit inside its correctly-branched zone,
# then self-cleared when the first lane branched — a transient-looking false positive
# (pass 6 fixed this exact shape for the tier gate (F2) and logging (F1); this was the
# remaining mirror). Attribution: `git -C <path>` first, else a SINGLE leading `cd <path>`,
# else the hook event's cwd (only when the command contains no cd at all). A commit that
# cannot be attributed — no signal, a $VAR path, multiple cds — fails CLOSED against every
# owned zone, exactly the old behavior, and says so. Known limit: in a compound with
# several git invocations the first `git -C` path wins the attribution.
if echo "$GITN" | grep -qE "git[[:space:]]+([a-z-]+[[:space:]]+)*commit"; then
  TDIR=$(printf '%s' "$COMMAND" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+"?([^"[:space:]]+)"?[[:space:]].*commit.*/\1/p' | head -n1)
  if [ -z "$TDIR" ]; then
    NCD=$(printf '%s' "$COMMAND" | grep -cE '(^|[;&|][[:space:]]*)cd[[:space:]]')
    if [ "$NCD" = "0" ]; then TDIR="$HOOKCWD"
    elif [ "$NCD" = "1" ]; then
      TDIR=$(printf '%s' "$COMMAND" | sed -nE 's/^[[:space:]]*cd[[:space:]]+"?([^"[:space:];&|]+)"?.*/\1/p')
    fi
  fi
  case "$TDIR" in *'$'*) TDIR="" ;; esac
  if [ -n "$TDIR" ]; then
    CT_DID=""; CT_TIER=""
    NTDIR=$(NORMP "$TDIR")
    for i in "${!OWNED_DIDS[@]}"; do
      NZ=$(NORMP "${OWNED_WORKS[$i]}")
      case "$NTDIR" in "$NZ"|"$NZ"/*|"$NZ"\\*) CT_DID="${OWNED_DIDS[$i]}"; CT_TIER="${OWNED_TIERS[$i]}"; break ;; esac
    done
    BR=$(git -C "$TDIR" rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ "$BR" = "main" ] || [ "$BR" = "master" ] || [ "$BR" = "HEAD" ] || [ -z "$BR" ]; then
      [ -n "$CT_DID" ] && { ATTR_DID="$CT_DID"; ATTR_TIER="$CT_TIER"; }
      block "commit on '${BR:-detached}' forbidden - use a local branch (HARD RULE)"
    fi
  else
    for i in "${!OWNED_DIDS[@]}"; do
      BR=$(git -C "${OWNED_WORKS[$i]}" rev-parse --abbrev-ref HEAD 2>/dev/null)
      if [ "$BR" = "main" ] || [ "$BR" = "master" ] || [ "$BR" = "HEAD" ] || [ -z "$BR" ]; then
        ATTR_DID="${OWNED_DIDS[$i]}"; ATTR_TIER="${OWNED_TIERS[$i]}"
        block "commit on '${BR:-detached}' in zone '${OWNED_DIDS[$i]}' forbidden - use a local branch (HARD RULE; commit target unattributable — every owned zone checked, fail closed)"
      fi
    done
  fi
fi

# ---- OWNED-lock confinement HARD RULES + tier gates (strictest owned lock wins) ----
for i in "${!OWNED_DIDS[@]}"; do
  ATTR_DID="${OWNED_DIDS[$i]}"; ATTR_TIER="${OWNED_TIERS[$i]}"; WORK="${OWNED_WORKS[$i]}"
  if echo "$GITN" | grep -qE "git[[:space:]]+push"; then
    if echo "$COMMAND" | grep -qE "(origin[[:space:]]+main|HEAD:main|:main([[:space:]]|$)|[[:space:]]main([[:space:]]|$))"; then
      block "push to main forbidden (HARD RULE)"
    fi
  fi
  # Pass 6 (F2): tier is a property of a GRANT, but zones are per-repo — so lane A's T3
  # was refusing lane B's push after B's own lock had released. The gate now applies when
  # the command NAMES this lock's zone, or when it names NO owned zone at all. That second
  # clause is the FAIL-CLOSED half and is load-bearing: a bare `git push` resolves to no
  # zone, so it still meets every owned tier exactly as it did before. Only a command that
  # explicitly names a DIFFERENT owned zone is exempted from this lock's tier.
  TIER_APPLIES=1
  if ! echo "$COMMAND" | grep -qF "$WORK"; then
    for j in "${!OWNED_WORKS[@]}"; do
      if echo "$COMMAND" | grep -qF "${OWNED_WORKS[$j]}"; then TIER_APPLIES=""; break; fi
    done
  fi
  if [ -n "$TIER_APPLIES" ]; then
    case "$ATTR_TIER" in
      T3|T4)
        echo "$GITN" | grep -qE "git[[:space:]]+push" && block "push not allowed at $ATTR_TIER"
        echo "$GITN" | grep -qE "git[[:space:]]+worktree[[:space:]]+add" && block "worktree not allowed at $ATTR_TIER"
        ;;
    esac
  fi
  case "$ATTR_TIER" in
    T2|T3|T4)
      echo "$COMMAND" | grep -qE "gh[[:space:]]+pr[[:space:]]+create" && block "opening a PR not allowed at $ATTR_TIER"
      ;;
  esac
  if [ "$ATTR_TIER" = "T4" ]; then
    echo "$COMMAND" | grep -qE "(>>?|[[:space:]]tee[[:space:]]|\brm\b|\bmv\b|\bcp\b|\bmkdir\b|\btouch\b|sed[[:space:]]+-i)" && block "T4 is read-only"
    echo "$GITN" | grep -qE "git[[:space:]]+(add|commit|switch[[:space:]]+-c|checkout[[:space:]]+-b|branch)" && block "T4 is read-only"
    echo "$COMMAND" | grep -qE "gh[[:space:]]+issue[[:space:]]+create" && block "creating a tracker issue not allowed at T4 (read-only; SUBAGENT-AUTHORIZATION §3)"
  fi
  # issue-create target confinement: hoisted BELOW this loop (pass 8 / mn#50) — see after "done".
done

# ---- issue-create target confinement, ONCE, across all owned locks (pass 8 / mn#50) ----
# T1-T3 may create issues, but only against an OWNED work repo's tracker. This check lived inside
# the per-lock loop until 2026-09-08, so at N=2 lane A's lock refused lane B's legitimate create
# (and named lane A's repo in the refusal, which read as a mis-issued grant). Same shape pass 6
# (F2) fixed for the tier gate and pass 7 (mn#48) for the commit rule. An explicit -R/--repo must
# match ONE of the owned work repos' origins; GH_REPO overrides, $VAR targets and cd-ambiguous
# bare creates fail CLOSED exactly as before. Attribution follows the matching lock.
if echo "$COMMAND" | grep -qE "gh[[:space:]]+issue[[:space:]]+create"; then
  echo "$COMMAND" | grep -qE "(^|[[:space:]])GH_REPO=" && block "gh issue create under GH_REPO override - target unresolvable (owned work-repo trackers only)"
  RTARGETS=$(printf '%s' "$COMMAND" | grep -oE "(^|[[:space:]])(-R|--repo)([[:space:]]+|=)[^[:space:]]+" | sed -E 's/^[[:space:]]*(-R|--repo)([[:space:]]+|=)//')
  if [ -n "$RTARGETS" ]; then
    OWNED_REPOS=()
    for i in "${!OWNED_DIDS[@]}"; do
      WURL=$(git -C "${OWNED_WORKS[$i]}" remote get-url origin 2>/dev/null)
      OWNED_REPOS[$i]=$(printf '%s' "$WURL" | sed -E 's#^(https?://github\.com/|git@github\.com:)##; s#\.git$##' | tr '[:upper:]' '[:lower:]')
    done
    while IFS= read -r RT; do
      [ -z "$RT" ] && continue
      case "$RT" in *'$'*) block "gh issue create -R '$RT' - variable target unresolvable, fail closed (owned work-repo trackers only)";; esac
      NT=$(printf '%s' "$RT" | sed -E 's#^(https?://github\.com/|git@github\.com:)##; s#\.git$##' | tr '[:upper:]' '[:lower:]')
      HIT=""
      for i in "${!OWNED_DIDS[@]}"; do
        if [ -n "${OWNED_REPOS[$i]}" ] && [ "$NT" = "${OWNED_REPOS[$i]}" ]; then HIT=1; ATTR_DID="${OWNED_DIDS[$i]}"; ATTR_TIER="${OWNED_TIERS[$i]}"; break; fi
      done
      [ -n "$HIT" ] || block "gh issue create targets '$RT' - owned work-repo trackers only (owned: ${OWNED_REPOS[*]:-unresolvable})"
    done <<RTEOF
$RTARGETS
RTEOF
  elif echo "$COMMAND" | grep -qE "(^|[;&|][[:space:]]*|[[:space:]])cd[[:space:]]"; then
    block "bare gh issue create combined with cd - target ambiguous; use -R <work-repo> explicitly"
  fi
fi

exit 0
