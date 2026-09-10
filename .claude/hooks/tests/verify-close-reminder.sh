#!/bin/bash
# Regression harness for close-loop-reminder.sh (added in maintenance pass 6, finding F4).
#   bash .claude/hooks/tests/verify-close-reminder.sh [path-to-hook]
# The optional argument exists so the suite can be pointed at the PRE-FIX hook to prove it
# can go red — a control that has never failed is not evidence (memory: "a control that
# never ran reports green").
#
# The hook is SILENT (no stdout) unless every gate passes; firing means it printed its
# decision JSON. Read-only to the real repo: all state lives in a throwaway git repo.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
HOOK="${1:-$(cd "$HERE/.." && pwd)/close-loop-reminder.sh}"
MARK="close-loop-reminder-s10p4"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS  $1"; }
no(){ FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }

winpath(){ if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
TR=$(winpath "$(mktemp -d)")/proj
mkdir -p "$TR"
( cd "$TR" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && echo seed > seed.md && git add seed.md && git commit -qm seed )
# g4 needs a close to LOOK owed: leave the tree dirty.
echo dirty >> "$TR/seed.md"
export CLAUDE_PROJECT_DIR="$TR"

iso(){ node -e 'process.stdout.write(new Date(Date.now()-Number(process.argv[1])*60000).toISOString())' "$1"; }
# Build a transcript. $1 = file, $2 = minutes ago for the timestamped line ("none" = no
# timestamp anywhere), $3 = "lead" to put an untimestamped last-prompt line first.
mktx(){
  local f="$1" mins="$2" lead="${3:-}"
  : > "$f"
  [ "$lead" = "lead" ] && echo '{"type":"last-prompt","leafUuid":"u","sessionId":"s"}' >> "$f"
  if [ "$mins" = "none" ]; then echo '{"type":"user","message":"no clock here"}' >> "$f"
  else node -e 'process.stdout.write(JSON.stringify({type:"user",timestamp:process.argv[1]}))' "$(iso "$mins")" >> "$f"; echo >> "$f"; fi
  echo '{"type":"assistant","message":"tail"}' >> "$f"
}
run(){ # <transcript> <stop_hook_active> -> stdout of the hook
  node -e 'process.stdout.write(JSON.stringify({stop_hook_active:process.argv[2]==="1",transcript_path:process.argv[1]}))' "$1" "$2" | bash "$HOOK" 2>/dev/null
}
expfire(){ # <transcript> <want fire:1/0> <label>
  local out; out=$(run "$1" 0)
  local got=0; printf '%s' "$out" | grep -qF "$MARK" && got=1
  [ "$got" = "$2" ] && ok "$3" || no "$3" "want fire=$2 got=$got"
}

# The transcript must live OUTSIDE the repo: an untracked file inside $TR makes the tree
# dirty and g4 fires for the right reason on the wrong evidence (found while writing this).
T="$TR/../t.jsonl"
# THE DEFECT: an untimestamped first line made FIRST=0, which SKIPPED the age gate entirely.
mktx "$T" 5 lead;    expfire "$T" 0 "young session (5 min) behind an untimestamped first line does NOT fire"
mktx "$T" 600 lead;  expfire "$T" 1 "old session (10h) behind an untimestamped first line DOES fire"
# Fail-closed: an age we cannot establish is not an old session.
mktx "$T" none lead; expfire "$T" 0 "no timestamp anywhere -> silent (fail CLOSED, not open)"
# No regression on the legacy shape the old code was written for.
mktx "$T" 5;         expfire "$T" 0 "young session, timestamp on line 1 (legacy shape) does not fire"
mktx "$T" 600;       expfire "$T" 1 "old session, timestamp on line 1 (legacy shape) fires"
# The other gates must still hold.
mktx "$T" 600 lead; echo "{\"m\":\"$MARK\"}" >> "$T"
                     expfire "$T" 0 "already reminded this session (marker present) -> silent"
mktx "$T" 600 lead
out=$(run "$T" 1); got=0; printf '%s' "$out" | grep -qF "$MARK" && got=1
[ "$got" = 0 ] && ok "stop_hook_active -> silent (loop guard)" || no "stop_hook_active" "fired"
# g4: a clean tree with nothing ahead and no delegation footprint stays silent even when old.
( cd "$TR" && git checkout -q -- seed.md )
mktx "$T" 600 lead;  expfire "$T" 0 "clean tree, nothing owed -> silent even at 10h"

echo "────────────────────────────"
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
