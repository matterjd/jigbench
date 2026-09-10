#!/bin/bash
# Regression harness for the QA-gate hook (DELIVERY-TEAM.md §10.2). Run from anywhere:
#   bash .claude/hooks/tests/verify-qa-gate.sh
# Exits 0 iff every case passes. Read-only to the real repo — all state lives in a
# throwaway temp git repo used as $CLAUDE_PROJECT_DIR.
#
# The hook under test is a PostToolUse(Bash) runner, not a guard: it runs the repo's
# configured gate command when a commit LANDS (fresh HEAD = the artifact check, not the
# command string's claim), once per commit sha. Unlike the guards it FAILS OPEN on bad
# input — a malformed payload must never block work; only a red suite may (exit 2).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
HOOKS=$(cd "$HERE/.." && pwd)
GATE="$HOOKS/qa-gate.sh"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS  $1"; }
no(){ FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }

winpath(){ if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
TR=$(winpath "$(mktemp -d)")/proj
mkdir -p "$TR/config" "$TR/scripts"
( cd "$TR" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && echo seed > seed.md && git add seed.md && git commit -qm seed )
export CLAUDE_PROJECT_DIR="$TR"
GITDIR=$(git -C "$TR" rev-parse --absolute-git-dir)
RAN="$TR/.gate-ran"   # the fake suite appends one line per execution + its cwd

# Fake suites. The pass suite records that (and where) it ran — proof of execution,
# not a report line (the diff-verify rule applied to the harness itself).
cat > "$TR/scripts/pass.sh" <<'EOF'
#!/bin/bash
echo "$(pwd)" >> .gate-ran
echo "suite green"
EOF
cat > "$TR/scripts/fail.sh" <<'EOF'
#!/bin/bash
echo "1 test red"
exit 1
EOF

cfg(){ # <enabled> <command>  — writes workspace.yml with a qa_gate block
  printf 'company: "t"\nqa_gate:\n  enabled: %s\n  command: "%s"\n  timeout_secs: 60\n  fresh_window_secs: 120\n' \
    "$1" "$2" > "$TR/config/workspace.yml"; }
jc(){ node -e 'process.stdout.write(JSON.stringify({tool_input:{command:process.argv[1]}}))' "$1"; }
runs(){ [ -f "$RAN" ] && wc -l < "$RAN" | tr -d ' ' || echo 0; }
clearmark(){ rm -f "$GITDIR/aedl-qa-gate.last" "$RAN"; }
fresh(){ ( cd "$TR" && echo "x$RANDOM" >> seed.md && git commit -qam bump ); }
stale(){ ( cd "$TR" && echo "x$RANDOM" >> seed.md \
  && GIT_COMMITTER_DATE="2020-01-01T00:00:00" git commit -qam old ); }

echo "── QA gate: config gating ──"
rm -f "$TR/config/workspace.yml"; clearmark; fresh
jc "git commit -m x" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 0 ] && ok "no workspace.yml -> silent no-op" || no "no config" "want exit 0, no run"

printf 'company: "t"\n' > "$TR/config/workspace.yml"; clearmark; fresh
jc "git commit -m x" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 0 ] && ok "no qa_gate block -> silent no-op" || no "no block" "want exit 0, no run"

cfg false "bash scripts/pass.sh"; clearmark; fresh
jc "git commit -m x" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 0 ] && ok "enabled:false -> silent no-op" || no "disabled" "want exit 0, no run"

cfg true ""; clearmark; fresh
jc "git commit -m x" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 0 ] && ok "empty command -> silent no-op" || no "empty cmd" "want exit 0, no run"

echo "── QA gate: firing conditions ──"
cfg true "bash scripts/pass.sh"; clearmark; fresh
jc "git status" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 0 ] && ok "non-commit command -> no run" || no "non-commit" "want no run"

clearmark; stale
jc "git commit -m x" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 0 ] && ok "no fresh commit (failed attempt) -> no run" || no "stale head" "want no run"

clearmark; fresh
OUT=$(jc "git commit -m x" | bash "$GATE" 2>/dev/null); RC=$?
[ "$RC" = 0 ] && [ "$(runs)" = 1 ] && ok "commit + fresh HEAD -> suite runs, exit 0" || no "fires on commit" "rc=$RC runs=$(runs)"
printf '%s' "$OUT" | grep -q "PASS" && ok "pass reported on stdout" || no "pass report" "no PASS in stdout"
head -1 "$RAN" 2>/dev/null | grep -qi "proj" && ok "suite runs with cwd = repo root" || no "cwd" "$(head -1 "$RAN" 2>/dev/null)"

jc "git commit -m x" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 1 ] && ok "same HEAD again -> deduped, no re-run" || no "dedupe" "runs=$(runs)"

fresh
jc "git commit --amend -m y" | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 2 ] && ok "new commit -> gate runs again" || no "re-gate" "runs=$(runs)"

echo "── QA gate: red suite + input handling ──"
cfg true "bash scripts/fail.sh"; clearmark; fresh
ERR=$(jc "git commit -m x" | bash "$GATE" 2>&1 >/dev/null); RC=$?
[ "$RC" = 2 ] && ok "red suite -> exit 2 (feedback to the model)" || no "red exit" "rc=$RC"
printf '%s' "$ERR" | grep -q "FAIL" && ok "failure summary on stderr" || no "fail report" "no FAIL in stderr"
printf '%s' "$ERR" | grep -q "test red" && ok "suite output carried in feedback" || no "fail output" "suite tail missing"

cfg true "bash scripts/pass.sh"; clearmark; fresh
echo 'not-json{{' | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = 0 ] && ok "bad JSON -> fail OPEN (runner, not guard)" || no "bad json" "want exit 0, no run"

# A prose command matching the regex after an already-gated commit must dedupe, not re-run.
jc "git commit -m x" | bash "$GATE" >/dev/null 2>&1   # gates the fresh commit
N=$(runs)
jc 'echo "git commit"' | bash "$GATE" >/dev/null 2>&1
[ "$?" = 0 ] && [ "$(runs)" = "$N" ] && ok "prose mention after gated commit -> deduped" || no "prose dedupe" "runs=$(runs) want $N"

echo
echo "qa-gate: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ] || exit 1
