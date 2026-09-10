#!/bin/bash
# Session open ritual (AGENTS.md "Session open & close" — the SEAT-NEUTRAL doctrine).
# SessionStart hook: stdout is injected as context the model sees at session open.
# READ-ONLY — reads HANDOFF.md + git state, writes NOTHING.
#
# Cites AGENTS.md rather than DELIVERY-TEAM.md §10.1 (2026-08-20): this hook fires for ALL
# THREE seats, and an anchor into one seat's charter is wrong for the other two. The "§10.N"
# anchors were also undecodable — DELIVERY-TEAM.md has no numbered subsections.
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0
BR=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)
DIRTY=$(git -C "$ROOT" status --porcelain 2>/dev/null); GITRC=$?
echo "== SESSION OPEN RITUAL (AGENTS.md 'Session open & close' — do this before the first task) =="
echo "Branch: ${BR:-unknown}"
if [ -n "$DIRTY" ]; then
  echo "Tree: DIRTY. Two possible owners, and they need OPPOSITE responses:"
  echo "  (a) a previous session did not close — factor it into scope; or"
  echo "  (b) ANOTHER SEAT IS WORKING THIS TREE RIGHT NOW (mn#34). More than one seat can be"
  echo "      rooted here at once, and mn#25 forbids the worktree that would separate them."
  echo "  'git status' answers WHAT is dirty, never WHOSE it is. Do not stage or close over"
  echo "  files this session did not touch — that has committed another session's unfinished"
  echo "  work three times (AGENTS.md 'Who owns the close')."
  printf '%s\n' "$DIRTY" | head -10
else
  # P1: an empty porcelain from a FAILED git is not clean — the signal this ritual exists
  # to surface (another seat's work) must never be faked by a broken instrument.
  if [ "${GITRC:-0}" -ne 0 ]; then
    echo "Tree: UNKNOWN (git unavailable in the hook environment — do NOT trust clean)"
  else
    echo "Tree: clean"
  fi
  if grep -q "^agent_exchange:" "$ROOT/config/workspace.yml" 2>/dev/null; then
    echo "Exchange: check the INBOUND backlog now — drain (<=3 notes) BEFORE the first dispatch (pass-5/P1 doctrine; a stalled inbound once sat 8 days while outbound ticked daily)."
  fi
fi
if [ -f "$ROOT/HANDOFF.md" ]; then
  # Surface the baton's own seat, if it records one. AGENTS.md irreducible-core item 1 puts
  # `seat` in the state block precisely so close rule 4 ("merge if it changed under you") is
  # decidable; a session cannot apply that rule without knowing whose baton it is holding.
  # Parse the STRUCTURAL field, never the phrase. A `\b<X> seat\b` scan matches the first PROSE
  # mention — in this repo's own baton that is "the Design seat's lane" in the priorities block,
  # which sits ABOVE the field and reports the wrong seat with total confidence.
  # Shipped broken 2026-08-20 and caught the same hour by running the hook against the baton it
  # had just been written for: a gate keyed on a token that prose can contain IS fired by prose.
  PRIOR_SEAT=$(grep -m1 -oiE '^\*\*seat:\*\*[[:space:]]*(Portfolio|Delivery|Design)' "$ROOT/HANDOFF.md" 2>/dev/null | grep -oiE '(Portfolio|Delivery|Design)')
  echo "--- HANDOFF.md head ---"
  head -20 "$ROOT/HANDOFF.md"
  echo "--- HANDOFF.md handoff sentence ---"
  tail -3 "$ROOT/HANDOFF.md"
  echo "--- end baton digest ---"
  if [ -n "$PRIOR_SEAT" ]; then
    echo "Baton on disk was written by: ${PRIOR_SEAT}. If your seat differs, close rule 4 applies —"
    echo "MERGE HANDOFF.md rather than overwriting it."
  else
    echo "Baton on disk records NO seat. Add one when you close (AGENTS.md irreducible-core item 1)."
  fi
  echo "Open ritual: (1) Read HANDOFF.md IN FULL — the digest above is the entry point, not the record. (2) Name your seat, one of THREE: Portfolio (docs/CONTROL-SESSION.md — dispatch, don't build) | Delivery (docs/DELIVERY-TEAM.md — build a feature in one project repo) | Design (docs/DESIGN-TEAM.md — new designs, prototypes, art-gen, drift audit; cross-program). Portfolio and Design are both cross-program: Portfolio DISPATCHES, Design never does. (3) If a Delivery seat on a feature, append today's 3-line standup to docs/team/<feature>/STANDUPS.md. (4) State the session goal in your first reply, and (5) record your seat in the HANDOFF state block when you close — that is what makes close rule 4 decidable for the next session."
else
  echo "HANDOFF.md MISSING — no baton. Create one on first use (AGENTS.md close rule 5) and say so."
fi
exit 0
