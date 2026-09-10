#!/bin/bash
# PostToolUse(Bash) gate for the v2 usage-row schema (maintenance pass 7, 2026-08-29).
#
# The schema lived only in prose — SKILL.md said "measure it before writing", the log's
# legend stated the cap — and 8 of the last 9 rows broke it (4 over the 600-char cap, 8
# missing the effort half of the Tool cell; the latest Description ran 1,410 chars).
# A recorded rule no process consumes is decoration; this gate is the consumer.
#
# Design (mirrors qa-gate.sh): key on the ARTIFACT, never the command's claim — the gate
# fires only when HEAD actually touched notes/ai-usage/claude/usage-log.md. Exit 2 feeds
# the exact violations back to the model so the row is fixed and amended before the close
# proceeds. Unlike qa-gate there is NO config switch: qa-gate's workspace.yml key silently
# self-disabled it on this very machine, and a gate that can be off by omission reports
# green forever. Where the log never changes, this gate simply never fires.
#
# Fail-open by design: this is bookkeeping enforcement, not a security control. A shed
# PATH or missing tool must not block every commit on the machine (the security guards
# fail closed; see delegation-guard-bash.sh).
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0
LOG="$ROOT/notes/ai-usage/claude/usage-log.md"
[ -f "$LOG" ] || exit 0
command -v git >/dev/null 2>&1 && command -v awk >/dev/null 2>&1 && command -v node >/dev/null 2>&1 || exit 0

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write(String((o.tool_input&&o.tool_input.command)||""))}catch(e){}})' 2>/dev/null)
printf '%s' "$COMMAND" | grep -qE "git.*commit" || exit 0

HEADSHA=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)
[ -n "$HEADSHA" ] || exit 0
# --absolute-git-dir, not --git-dir: at a repo's toplevel the latter returns RELATIVE
# ".git", which the shell then resolves against this PROCESS's cwd — on first deploy the
# stamp landed in the wrong repo's .git carrying a test fixture's HEAD sha.
GITDIR=$(git -C "$ROOT" rev-parse --absolute-git-dir 2>/dev/null)
STAMP="$GITDIR/usage-row-gate.ok"
[ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$HEADSHA" ] && exit 0
git -C "$ROOT" diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | grep -qx "notes/ai-usage/claude/usage-log.md" || exit 0

ROW=$(grep -v '^[[:space:]]*$' "$LOG" | tail -n 1)
fail() {
  echo "usage-row-gate: the just-committed usage row breaks the v2 schema (SKILL.md session-close step 3b) — fix the newest row in notes/ai-usage/claude/usage-log.md and amend. $1" >&2
  exit 2
}
case "$ROW" in \|*) : ;; *) fail "The last non-blank line of the log is not a table row: '$(printf '%.80s' "$ROW")'." ;; esac

TOOLC=$(printf '%s\n' "$ROW" | awk -F'|' '{gsub(/^ +| +$/,"",$5); print $5}')
DLEN=$(printf '%s\n' "$ROW" | awk -F'|' '{gsub(/^ +| +$/,"",$7); print length($7)}')
LANEC=$(printf '%s\n' "$ROW" | awk -F'|' '{gsub(/^ +| +$/,"",$8); print $8}')

ERR=""
[ "${DLEN:-0}" -le 600 ] 2>/dev/null || ERR="${ERR}Description is ${DLEN} chars (cap 600 — trim it). "
printf '%s' "$TOOLC" | grep -qE '^claude-code \([a-z0-9][a-z0-9 .-]*, (low|medium|high|max)\)$' \
  || ERR="${ERR}Tool cell is '${TOOLC}' — must be 'claude-code (<model>, <effort>)' with effort one of low/medium/high/max (pass 8: 'unstated' is not a spelling — the launcher's picker knew it; ask the human). "
printf '%s' "$LANEC" | grep -qE '(harness|product|mixed)[[:space:]]*$' \
  || ERR="${ERR}Scale-Lane cell is '${LANEC}' — must end with harness|product|mixed. "

[ -n "$ERR" ] && fail "$ERR"
printf '%s' "$HEADSHA" > "$STAMP" 2>/dev/null
exit 0
