#!/bin/bash
# Close-loop reminder (AGENTS.md "Session open & close" — the SEAT-NEUTRAL doctrine).
# Stop hook, quiet by design: REMINDER ONLY — the reason text forbids auto-running
# the close; @aedl -close stays the human's to trigger.
# READ-ONLY — reads git state + the session transcript, writes NOTHING.
#
# 2026-08-20, under SUBAGENT-AUTHORIZATION.md §6 with Matter's approval on record. Two fixes:
#
#   1. CITATION. This cited "DELIVERY-TEAM.md §10.4" in text shown to EVERY seat. The hook
#      fires for all three, and an anchor into one seat's charter is wrong for the other two.
#      Worse, the anchor was undecodable: DELIVERY-TEAM.md has no numbered subsections — its
#      "## 10. What happens without being asked" is a plain list, so "§10.4" resolves to
#      nothing a grep can find. AGENTS.md "Session open & close" is the seat-neutral rule and
#      names all three charters.
#
#   2. OWNERSHIP. Gate g4 was `git status --porcelain | head -1` — ANY dirty file, regardless
#      of owner — used as a proxy for "THIS session owes a close". That proxy is false the
#      moment two seats share a working tree, which mn#25 makes the expected case (it forbids
#      the worktree that would separate them) and mn#34 documents. It fired live on
#      2026-08-19 at a Portfolio seat about a Delivery seat's in-progress build; had the close
#      run, it would have committed another session's unfinished work onto their own branch.
#      The gate cannot know whose files these are, so it no longer claims to: it now REPORTS
#      what is dirty and makes the ownership question explicit instead of asserting an answer.
#
# Silent (exit 0, no output) unless ALL gates pass, so it fires at most once per session:
#   g1  not already inside a stop-hook continuation (loop guard)
#   g2  not already reminded this session (marker grep of the transcript)
#   g3  session age >= MIN_AGE_MIN (wind-down proxy; Stop has no real wind-down event)
#   g4  a close MAY be owed: dirty tree OR commits ahead of upstream — ownership undetermined
MARK="close-loop-reminder-s10p4"
MIN_AGE_MIN=45
INPUT=$(cat)
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0

VALS=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);process.stdout.write((o.stop_hook_active?1:0)+" "+(o.transcript_path||"-"))}catch(e){process.stdout.write("0 -")}})' 2>/dev/null)
# P1: a reminder fails SILENT when its own instrument is gone — with node missing, VALS is
# empty and every safety gate below would silently skip, turning a courtesy into a stop-loop.
[ -n "$VALS" ] || exit 0
ACTIVE=${VALS%% *}
TRANSCRIPT=${VALS#* }
[ "$ACTIVE" = "1" ] && exit 0

if [ -f "$TRANSCRIPT" ]; then
  grep -qF "$MARK" "$TRANSCRIPT" && exit 0
  # Pass 6 (F4): take the first line that HAS a timestamp, and FAIL CLOSED when none does.
  # The old form read `head -1` only, but line 1 of a transcript is
  # {"type":"last-prompt","leafUuid","sessionId"} with NO timestamp field — so FIRST was 0,
  # the `[ "$FIRST" -gt 0 ]` guard was false, and the ENTIRE age comparison was skipped
  # rather than enforced. The reminder therefore fired at any age, which is what Matter
  # reported on 2026-08-28. An age we cannot establish is not evidence of an old session.
  FIRST=$(head -200 "$TRANSCRIPT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const ln of s.split(String.fromCharCode(10))){const t=ln.trim();if(!t)continue;try{const o=JSON.parse(t);const v=Date.parse(o.timestamp||"");if(v){process.stdout.write(String(v));return}}catch(e){}}process.stdout.write("0")})' 2>/dev/null)
  NOW=$(( $(date +%s) * 1000 ))
  [ "${FIRST:-0}" -gt 0 ] || exit 0
  [ $(( NOW - FIRST )) -lt $(( MIN_AGE_MIN * 60000 )) ] && exit 0
fi

DIRTY=$(git -C "$ROOT" status --porcelain 2>/dev/null)
AHEAD=$(git -C "$ROOT" rev-list --count "@{u}..HEAD" 2>/dev/null || echo 0)
# mn#45 (pass 5): the sessions most likely to skip the close have a GITIGNORED footprint —
# delegations/ records — and read as "clean, 0 ahead". A delegation file touched in the last
# 12h means a session worked here recently and a close may be owed regardless of porcelain.
DELEG_RECENT=$(find "$ROOT/delegations" -type f -mmin -720 2>/dev/null | head -1)
[ -z "$DIRTY" ] && [ "${AHEAD:-0}" = "0" ] && [ -z "$DELEG_RECENT" ] && exit 0

# Name what is actually dirty. The reminder cannot know whose it is, so it hands the evidence
# over rather than asserting ownership it has no way to establish.
DLIST=$(printf '%s\n' "$DIRTY" | head -6 | tr '\n' ';' | sed 's/;$//')
[ -z "$DLIST" ] && DLIST="(nothing dirty)"
[ -n "$DELEG_RECENT" ] && DLIST="$DLIST; recent delegation footprint (gitignored): $(basename "$(dirname "$DELEG_RECENT")")"

cat <<JSON
{"decision":"block","reason":"[$MARK] Close-loop reminder (AGENTS.md 'Session open & close'): the session is ${MIN_AGE_MIN}+ min old and a close MAY be owed. Ahead of upstream: ${AHEAD:-0} commit(s). Dirty: ${DLIST}. FIRST decide whether that work is YOURS — more than one seat can be rooted in this repo at once (mn#25/mn#34), and git status answers WHAT is dirty, never WHOSE it is. If any of it belongs to another session, do NOT close over it: say so and leave it alone. If it is yours, ASK the human whether to run @aedl -close now. Do NOT run it yourself - the close is theirs to trigger. If they decline, continue working; this reminder fires once per session."}
JSON
exit 0
