#!/bin/bash
# aedl-kit-check — is this repo's AEDL armor intact, and is it current?
#
# The kit VENDORS the enforcement hooks: a provisioned repo carries its own copy
# and depends on nothing external at hook time. That is deliberate (guards run on
# every tool call; armor that needs a reachable source fails open or fails shut,
# and both are worse than a stale snapshot). The cost of vendoring is that the
# copy cannot notice the source harness moving on — so it ships a fingerprint,
# and this script is what reads it.
#
# Usage:
#   bash .claude/aedl-kit-check.sh                    # integrity + stamp
#   bash .claude/aedl-kit-check.sh --source <path>    # + CURRENT/STALE verdict
#   AEDL_KIT_SOURCE=<path> bash .claude/aedl-kit-check.sh
#
# Exit: 0 = intact and (if checkable) current · 1 = modified or STALE · 2 = cannot determine
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
MANIFEST="$ROOT/KIT-MANIFEST.txt"
SOURCE="${AEDL_KIT_SOURCE:-}"
[ "${1:-}" = "--source" ] && SOURCE="${2:-}"

if [ ! -f "$MANIFEST" ]; then
  echo "aedl-kit-check: no KIT-MANIFEST.txt at $ROOT" >&2
  echo "  This repo was not provisioned from the kit, or the manifest was removed." >&2
  echo "  Without it neither integrity nor staleness can be established." >&2
  exit 2
fi

built=$(sed -n '1p' "$MANIFEST")
tree=$(sed -n 's/^hooks-tree-sha: //p' "$MANIFEST")
eol=$(sed -n 's/^payload-line-endings: //p' "$MANIFEST")

echo "$built"
[ -n "$eol" ] && echo "Line endings:   $eol"
echo "hooks-tree-sha: ${tree:-<absent — kit predates fingerprinting; treat as STALE>}"
echo

# ---- integrity: do the installed hooks still match what shipped? -------------
# Catches a partial unpack and a local edit. It does NOT catch upstream drift —
# a perfectly intact copy of a year-old guard passes this and fails the next check.
if command -v sha256sum >/dev/null 2>&1; then HASH() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1;  then HASH() { shasum -a 256 "$1" | cut -d' ' -f1; }
else echo "integrity: SKIPPED (no sha256sum/shasum)"; HASH() { echo skip; }; fi

bad=0 checked=0
while read -r want path; do
  [ -z "${path:-}" ] && continue
  if [ ! -f "$ROOT/$path" ]; then echo "  MISSING  $path"; bad=$((bad+1)); continue; fi
  got=$(HASH "$ROOT/$path")
  [ "$got" = "skip" ] && continue
  checked=$((checked+1))
  if [ "$got" != "$want" ]; then echo "  MODIFIED $path"; bad=$((bad+1)); fi
done < <(sed -n '/^sha256:/,/^$/p' "$MANIFEST" | sed -n 's/^  \([0-9a-f]\{64\}\)  \(.*\)$/\1 \2/p')

if [ "$checked" -gt 0 ]; then
  [ "$bad" -eq 0 ] && echo "integrity: OK — $checked enforcement file(s) match the shipped kit" \
                   || echo "integrity: FAILED — $bad file(s) differ from the shipped kit"
fi

# ---- staleness: has the SOURCE harness moved past this snapshot? -------------
if [ -z "$SOURCE" ]; then
  echo
  echo "staleness: UNKNOWN — no source repo given."
  echo "  Re-run with --source <path-to-source-harness>, or compare by hand:"
  echo "    git -C <source> rev-parse HEAD:.claude/hooks"
  echo "  equal to hooks-tree-sha above = current; different = re-provision."
  [ "$bad" -eq 0 ] && exit 2 || exit 1
fi

if [ ! -d "$SOURCE/.git" ]; then
  echo "staleness: UNKNOWN — $SOURCE is not a git repo" >&2; exit 2
fi
cur=$(git -C "$SOURCE" rev-parse "HEAD:.claude/hooks" 2>/dev/null || echo "")
if [ -z "$cur" ]; then
  echo "staleness: UNKNOWN — $SOURCE has no .claude/hooks at HEAD" >&2; exit 2
fi

echo
if [ -z "$tree" ]; then
  echo "staleness: STALE — this kit predates fingerprinting; source is now $cur"; exit 1
elif [ "$cur" = "$tree" ]; then
  echo "staleness: CURRENT — enforcement matches $SOURCE @ HEAD"
  [ "$bad" -eq 0 ] || exit 1
else
  echo "staleness: STALE — re-provision."
  echo "  this repo: $tree"
  echo "  source:    $cur"
  echo "  Rebuild in the source (bash aedl-kit/build-kit.sh) and re-unpack the payload."
  exit 1
fi
