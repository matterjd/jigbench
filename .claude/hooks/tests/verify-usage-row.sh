#!/bin/bash
# Regression harness for usage-row-gate.sh. Run from anywhere:
#   bash .claude/hooks/tests/verify-usage-row.sh [gate-path]
# Red-provable (verify-close-reminder convention): point $1 at an always-exit-0 stub and
# every exit-2 case FAILS — a control that has never failed is not evidence. Read-only to
# the real repo — all state lives in a throwaway temp git repo used as $CLAUDE_PROJECT_DIR.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
GATE="${1:-$HERE/../usage-row-gate.sh}"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS  $1"; }
no(){ FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }
winpath(){ if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

TR=$(winpath "$(mktemp -d)")/proj
mkdir -p "$TR/notes/ai-usage/claude"
( cd "$TR" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t )
export CLAUDE_PROJECT_DIR="$TR"
LOG="$TR/notes/ai-usage/claude/usage-log.md"
printf '| Date | Window | Repos | Tool | Task | Description | Scale-Lane |\n|---|---|---|---|---|---|---|\n' > "$LOG"
( cd "$TR" && git add -A && git commit -qm seed )

jc(){ node -e 'process.stdout.write(JSON.stringify({tool_input:{command:process.argv[1]}}))' "$1"; }
run(){ jc "$1" | bash "$GATE" >/dev/null 2>&1; printf '%s' "$?"; }
runerr(){ jc "$1" | bash "$GATE" 2>&1 >/dev/null; }
addrow(){ printf '%s\n' "$1" >> "$LOG"; ( cd "$TR" && git add -A && git commit -qm row ); }

# 1. conforming row -> pass
addrow "| 2026-08-29 | 10:00-11:00 | matter-notes | claude-code (fable 5, high) | pass7-smoke | Short conforming description. | light · harness |"
[ "$(run 'git commit -m close')" = "0" ] && ok "conforming row passes" || no "conforming row" "want 0"

# 2. stamp dedupe: same HEAD, second commit-shaped command -> silent pass (no rework)
[ "$(run 'git commit -m again')" = "0" ] && ok "validated HEAD is stamped (no re-fire)" || no "stamp dedupe" "want 0"

# 3. over-cap Description -> exit 2, and the message carries the MEASURED number
LONG=$(node -e 'process.stdout.write("x".repeat(700))')
addrow "| 2026-08-29 | 11:00-12:00 | matter-notes | claude-code (fable 5, high) | pass7-smoke | $LONG | light · harness |"
[ "$(run 'git commit -m close')" = "2" ] && ok "700-char Description blocked" || no "over-cap row" "want 2"
runerr 'git commit -m close' | grep -q "700 chars" && ok "block message carries the measured length (control fired, not pattern luck)" || no "measured length in message" "no '700 chars'"

# 4. Tool cell without effort -> exit 2 (the 8-of-9 failure)
addrow "| 2026-08-29 | 12:00-13:00 | matter-notes | claude-code (opus 5) | pass7-smoke | Short description. | light · harness |"
[ "$(run 'git commit -m close')" = "2" ] && ok "Tool cell missing effort blocked" || no "effortless Tool cell" "want 2"

# 5. bad Lane -> exit 2
addrow "| 2026-08-29 | 13:00-14:00 | matter-notes | claude-code (opus 5, max) | pass7-smoke | Short description. | heavy · nonsense |"
[ "$(run 'git commit -m close')" = "2" ] && ok "unknown Lane blocked" || no "bad lane" "want 2"

# 6. fix the bad row -> pass again (the amend path stays open)
( cd "$TR" && head -n -1 notes/ai-usage/claude/usage-log.md > .t && mv .t notes/ai-usage/claude/usage-log.md )
addrow "| 2026-08-29 | 13:00-14:00 | matter-notes | claude-code (opus 5, max) | pass7-smoke | Short description. | heavy · mixed |"
[ "$(run 'git commit -m close')" = "0" ] && ok "repaired row passes (amend path)" || no "repaired row" "want 0"

# 6b. the stamp lands in the FIXTURE repo's .git even when the gate runs from another cwd
# (found on first live deploy: rev-parse --git-dir returns RELATIVE ".git" at a repo's
# toplevel, so the stamp followed the hook PROCESS's cwd — the real repo's .git received a
# throwaway fixture's HEAD sha)
rm -f "$TR/.git/usage-row-gate.ok"
OTHER=$(winpath "$(mktemp -d)")
( cd "$OTHER" && jc 'git commit -m close' | bash "$GATE" >/dev/null 2>&1 )
if [ -f "$TR/.git/usage-row-gate.ok" ] && [ ! -e "$OTHER/.git" ]; then ok "stamp follows the repo, not the caller's cwd"; else no "stamp location" "stamp missing from fixture .git or caller cwd polluted"; fi
rm -rf "$OTHER"

# 7. a commit NOT touching the log never fires
( cd "$TR" && echo x > other.md && git add -A && git commit -qm other )
[ "$(run 'git commit -m other')" = "0" ] && ok "commit not touching the log ignored (artifact-keyed)" || no "untouched commit" "want 0"

# 8. non-commit command never fires
addrow "| 2026-08-29 | 14:00-15:00 | matter-notes | claude-code (opus 5) | x | Bad row on HEAD. | light · harness |"
[ "$(run 'git status')" = "0" ] && ok "non-commit command ignored" || no "non-commit" "want 0"
# ...but a commit-shaped command against that same bad HEAD fires (no stamp on failure)
[ "$(run 'git commit -m close')" = "2" ] && ok "bad row keeps failing until fixed (failure is never stamped)" || no "unfixed row re-fires" "want 2"

# 9. pass 8: the effort must be a real picker value — "unstated" is not a legal spelling
addrow "| 2026-09-08 | 15:00-16:00 | matter-notes | claude-code (opus 5, unstated) | pass8 | Short description. | light · harness |"
[ "$(run 'git commit -m close')" = "2" ] && ok "effort 'unstated' blocked (enum low/medium/high/max)" || no "effort enum" "want 2"
addrow "| 2026-09-08 | 15:00-16:00 | matter-notes | claude-code (opus 5, max) | pass8 | Short description. | light · harness |"
[ "$(run 'git commit -m close')" = "0" ] && ok "effort 'max' passes the enum" || no "effort enum pass" "want 0"

rm -rf "$(dirname "$TR")"
echo "────────────────────────────"
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
