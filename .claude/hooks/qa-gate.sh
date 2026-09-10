#!/bin/bash
# QA gate (DELIVERY-TEAM.md §10.2, mn#19 done-when 3): run the repo's configured
# quality suite when a change LANDS — a completed commit, not every keystroke.
# PostToolUse(Bash) hook. A RUNNER, not a guard:
#   - fires only when config/workspace.yml carries an enabled qa_gate block with a
#     command — absent/disabled ⇒ silent no-op (this is how the vault stays quiet
#     while provisioned project repos get a live gate from the same settings file);
#   - keys on the ARTIFACT, not the command string's claim: the command must look
#     like a git commit AND HEAD must actually be fresh (a failed commit attempt
#     leaves no fresh commit ⇒ silence), AND that sha not already gated (marker in
#     the real git dir, so worktrees dedupe correctly);
#   - the command regex alone can be fired by prose that merely mentions a commit
#     (the a-token-a-description-can-contain failure); the artifact + marker checks
#     are the controls prose can't fake;
#   - FAILS OPEN on malformed input — a runner must never block work; only a red
#     suite may (exit 2 feeds the failure back to the model to fix before moving on).
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0
CFG="$ROOT/config/workspace.yml"
[ -f "$CFG" ] || exit 0

# P1: the config gate runs BEFORE stdin is drained — in a repo with no qa_gate block this
# hook fires on EVERY Bash call and must cost as close to nothing as possible (audit measured
# ~300-460ms/call of pure no-op overhead with the old order).
BLOCK=$(tr -d '\r' < "$CFG" | awk '/^qa_gate:/{f=1;next} f&&/^[^[:space:]#]/{f=0} f')
[ -n "$BLOCK" ] || exit 0
val(){ printf '%s\n' "$BLOCK" | sed -n "s/^[[:space:]]*$1:[[:space:]]*//p" | head -1 \
       | sed 's/[[:space:]]#.*$//; s/^"//; s/"[[:space:]]*$//; s/[[:space:]]*$//'; }
[ "$(val enabled)" = "true" ] || exit 0
GATE_CMD=$(val command)
[ -n "$GATE_CMD" ] || exit 0
INPUT=$(cat)
TIMEOUT_SECS=$(val timeout_secs); TIMEOUT_SECS=${TIMEOUT_SECS:-600}
FRESH_SECS=$(val fresh_window_secs); FRESH_SECS=${FRESH_SECS:-120}

CMD=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write(String((o.tool_input&&o.tool_input.command)||""))}catch(e){process.stdout.write("")}})' 2>/dev/null)
[ -n "$CMD" ] || exit 0
printf '%s' "$CMD" | grep -qE '(^|[^[:alnum:]_.-])git[^|;&]*[[:space:]]commit([^[:alnum:]_-]|$)' || exit 0

# Artifact check: did a commit actually land just now?
HEAD_SHA=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null) || exit 0
HEAD_CT=$(git -C "$ROOT" log -1 --format=%ct 2>/dev/null) || exit 0
NOW=$(date +%s)
[ $(( NOW - HEAD_CT )) -le "$FRESH_SECS" ] || exit 0

# Once per commit: marker lives in the REAL git dir (worktree-safe, never staged).
GITDIR=$(git -C "$ROOT" rev-parse --absolute-git-dir 2>/dev/null) || exit 0
MARK="$GITDIR/aedl-qa-gate.last"
[ -f "$MARK" ] && [ "$(cat "$MARK" 2>/dev/null)" = "$HEAD_SHA" ] && exit 0
printf '%s' "$HEAD_SHA" > "$MARK"   # mark before running: one gate per sha, pass or fail

START=$(date +%s)
if command -v timeout >/dev/null 2>&1; then
  OUT=$(cd "$ROOT" && timeout "$TIMEOUT_SECS" bash -c "$GATE_CMD" 2>&1); RC=$?
else
  OUT=$(cd "$ROOT" && bash -c "$GATE_CMD" 2>&1); RC=$?
fi
DUR=$(( $(date +%s) - START ))

if [ "$RC" = 0 ]; then
  echo "[qa-gate] PASS ${DUR}s — '$GATE_CMD' @ ${HEAD_SHA:0:9} (DELIVERY-TEAM.md §10.2)"
  exit 0
fi
{
  if [ "$RC" = 124 ]; then
    echo "[qa-gate] FAIL — '$GATE_CMD' timed out after ${TIMEOUT_SECS}s @ ${HEAD_SHA:0:9}"
  else
    echo "[qa-gate] FAIL (rc=$RC, ${DUR}s) — '$GATE_CMD' @ ${HEAD_SHA:0:9}"
  fi
  echo "The commit landed but the QA gate is RED (DELIVERY-TEAM.md §10.2/§7). Triage now:"
  echo "Critical/Blocker -> fix before building on it; anything else -> file it with the debt label and keep moving."
  echo "--- last suite output (truncated) ---"
  printf '%s\n' "$OUT" | tail -40 | cut -c1-400
} >&2
exit 2
