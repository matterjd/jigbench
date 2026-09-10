#!/usr/bin/env bash
# run-tests.sh — suite for the aedl-roadmap snapshot writer (mn#15, Gate 8).
#
# Run:   bash .claude/skills/aedl-roadmap/scripts/tests/run-tests.sh
# Exit:  0 = all green · 1 = at least one failure.
#
# The suite's centre of gravity is D3: SELECT = lexicographic max of the
# YYYY-MM-DD basename; STAMP = the SELECTED file's mtime. Both clauses are tested
# against fixtures where lexicographic order and mtime order DISAGREE, because on
# an ordinary day they agree and a correct implementation and an mtime-ordering one
# both go green. A test built from an ordinary day is worth nothing.
set -u
export LC_ALL=C

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPTS_DIR=$(cd "$HERE/.." && pwd)
SKILL_DIR=$(cd "$SCRIPTS_DIR/.." && pwd)
REPO_ROOT=$(cd "$SKILL_DIR/../../.." && pwd)
WRITER="$SCRIPTS_DIR/write-snapshot.sh"

TMPROOT=$(mktemp -d) || { echo "cannot mktemp"; exit 1; }
trap 'rm -rf "$TMPROOT"' EXIT

pass=0
fail=0
failed=""

ok() { pass=$((pass + 1)); printf 'PASS  %s\n' "$1"; }
ko() {
  fail=$((fail + 1))
  failed="$failed$1
"
  printf 'FAIL  %s\n        %s\n' "$1" "$2"
}
assert_eq() { # name expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else ko "$1" "expected [$2] · got [$3]"; fi
}
assert_ne() { # name notexpected actual
  if [ "$2" != "$3" ]; then ok "$1"; else ko "$1" "expected anything but [$2]"; fi
}
assert_contains() { # name needle haystack
  case "$3" in
  *"$2"*) ok "$1" ;;
  *) ko "$1" "expected to contain [$2] · got [$(printf '%s' "$3" | tr '\n' ' ' | cut -c1-160)…]" ;;
  esac
}

# Pull key=value out of a one-line receipt. Keys are unique per receipt.
field() { # key text
  printf '%s\n' "$2" | sed -n "s/.*[[:space:]]\{1,\}$1=\([^[:space:]]*\).*/\1/p" | head -1
}

# Independent of the writer's own helper on purpose: fixtures are stamped with
# whole-second epochs, so the expected millisecond value is arithmetic, not a
# second reading through the same instrument.
ms_of() { # file -> epoch milliseconds
  local raw sec frac
  raw=$(stat -c '%.9Y' "$1" 2>/dev/null) || return 1
  sec=${raw%%.*}
  frac=${raw#*.}
  [ "$frac" = "$raw" ] && frac=000000000
  frac="${frac}000000000"
  printf '%s%s\n' "$sec" "$(printf '%s' "$frac" | cut -c1-3)"
}

mkdoc() { # a minimal contract-shaped document
  cat <<'JSON'
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-15T18:00:00Z",
  "repos": [
    {
      "repo": "owner/example-repo",
      "open": 1,
      "unreachable": false,
      "issues": [
        {
          "number": 23,
          "title": "Pin *.sh to LF so every vendored kit builds portable",
          "state": "OPEN",
          "repo": "owner/example-repo",
          "labels": ["debt"]
        }
      ]
    }
  ]
}
JSON
}

echo "=== aedl-roadmap snapshot writer — test suite ==="
echo "writer: $WRITER"
if [ ! -f "$WRITER" ]; then
  echo
  echo "!! writer not found — every test below fails by construction (this is the red run)"
fi
echo

# ---------------------------------------------------------------------------
# S1 — the writer script: selection (D3), stamping (D3), writing (AC 1/AC 3),
#      the adapter boundary (D2), and payload validation (D5/D6).
# ---------------------------------------------------------------------------

# --- selection & stamping ---------------------------------------------------

d="$TMPROOT/s1-empty"
mkdir -p "$d"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
rc=$?
assert_eq "S1.01a latest: empty directory exits 1" "1" "$rc"
assert_contains "S1.01b latest: empty directory reports SNAPSHOT_NONE" "SNAPSHOT_NONE" "$out"

# THE DISCRIMINATING FIXTURE. Lexicographic max is 2026-08-15; mtime max is
# 2026-08-14. An implementation that orders by mtime returns 2026-08-14 and fails.
now=$(date +%s)
hour_ago=$((now - 3600))
d="$TMPROOT/s1-disagree"
mkdir -p "$d"
mkdoc >"$d/2026-08-14-issues.json"
mkdoc >"$d/2026-08-15-issues.json"
touch -d "@$now" "$d/2026-08-14-issues.json"
touch -d "@$hour_ago" "$d/2026-08-15-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.02 latest: DISCRIMINATING — lexicographic max wins over the newer mtime" \
  "2026-08-15-issues.json" "$(field file "$out")"
assert_eq "S1.03 latest: DISCRIMINATING — distilledAt is the SELECTED file's mtime" \
  "${hour_ago}000" "$(field distilledAtMs "$out")"
assert_ne "S1.04 latest: distilledAt is NOT the directory's newest mtime" \
  "${now}000" "$(field distilledAtMs "$out")"

d="$TMPROOT/s1-noise"
mkdir -p "$d"
mkdoc >"$d/2026-08-15-issues.json"
mkdoc >"$d/2026-08-99-issues.json.bak"
mkdoc >"$d/2026-8-16-issues.json"
mkdoc >"$d/2026-08-17-ISSUES.json"
mkdoc >"$d/snapshot-example.json"
mkdoc >"$d/x2026-08-18-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.05 latest: basenames that do not match the rule are ignored" \
  "2026-08-15-issues.json" "$(field file "$out")"

d="$TMPROOT/s1-year"
mkdir -p "$d"
mkdoc >"$d/2025-12-31-issues.json"
mkdoc >"$d/2026-01-01-issues.json"
touch -d "@$now" "$d/2025-12-31-issues.json"
touch -d "@$hour_ago" "$d/2026-01-01-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.06 latest: lexicographic order holds across a year boundary" \
  "2026-01-01-issues.json" "$(field file "$out")"


# --- D-026 (mn#32): the SELECT rule must not admit IMPOSSIBLE dates ----------
# The rule took the lexicographic max of a shape-matched basename, so a single stray
# 9999-99-99-issues.json shadowed every real snapshot PERMANENTLY and SILENTLY, its mtime
# becoming distilledAt. Every other failure in this contract degrades quietly to "no
# reconciliation yet"; this one is loud and wrong -- a confident timestamp and a full set
# of counts from a file nobody meant to publish.
# SELECT stays a PURE FUNCTION OF THE BASENAME: no filesystem access, no clock. That
# property is the point of the rule, so these cases must never need either.

d="$TMPROOT/s1-impossible-month"
mkdir -p "$d"
mkdoc >"$d/2026-08-15-issues.json"
mkdoc >"$d/2026-13-01-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.40 latest: an impossible MONTH (13) loses to a real snapshot" \
  "2026-08-15-issues.json" "$(field file "$out")"

d="$TMPROOT/s1-impossible-day"
mkdir -p "$d"
mkdoc >"$d/2026-08-15-issues.json"
mkdoc >"$d/2026-08-32-issues.json"
mkdoc >"$d/2026-08-00-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.41 latest: an impossible DAY (32, and 00) loses to a real snapshot" \
  "2026-08-15-issues.json" "$(field file "$out")"

d="$TMPROOT/s1-sentinel"
mkdir -p "$d"
mkdoc >"$d/2026-08-15-issues.json"
mkdoc >"$d/9999-99-99-issues.json"
touch -d "@$now" "$d/9999-99-99-issues.json"
touch -d "@$hour_ago" "$d/2026-08-15-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.42 latest: DISCRIMINATING — the 9999-99-99 sentinel loses to a real snapshot" \
  "2026-08-15-issues.json" "$(field file "$out")"
assert_eq "S1.42b latest: and distilledAt comes from the REAL file, not the sentinel" \
  "${hour_ago}000" "$(field distilledAtMs "$out")"

# The narrowing must not cost a single LEGITIMATE date. A fix that rejects valid input is
# also a defect, and a selection test that only ever feeds it garbage cannot see that.
d="$TMPROOT/s1-boundaries"
mkdir -p "$d"
mkdoc >"$d/2026-01-01-issues.json"
mkdoc >"$d/2026-12-31-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.43 latest: month 12 and day 31 are VALID and still selectable" \
  "2026-12-31-issues.json" "$(field file "$out")"

d="$TMPROOT/s1-month-boundary"
mkdir -p "$d"
mkdoc >"$d/2026-09-30-issues.json"
mkdoc >"$d/2026-10-01-issues.json"
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
assert_eq "S1.44 latest: the 09->10 month boundary still orders correctly" \
  "2026-10-01-issues.json" "$(field file "$out")"
# --- writing ----------------------------------------------------------------

d="$TMPROOT/s1-write"
today=$(date -u +%F)
out=$(mkdoc | bash "$WRITER" write --dir "$d" 2>&1)
rc=$?
assert_eq "S1.07a write: exits 0" "0" "$rc"
assert_eq "S1.07b write: creates <UTC date>-issues.json (AC 1)" "yes" \
  "$([ -f "$d/$today-issues.json" ] && echo yes || echo no)"
assert_eq "S1.07c write: the file is byte-identical to stdin" "same" \
  "$(mkdoc | diff -q - "$d/$today-issues.json" >/dev/null 2>&1 && echo same || echo differs)"

d="$TMPROOT/s1-date"
out=$(mkdoc | bash "$WRITER" write --dir "$d" --date 2026-01-02 2>&1)
assert_eq "S1.08 write: --date overrides the basename" "yes" \
  "$([ -f "$d/2026-01-02-issues.json" ] && echo yes || echo no)"

d="$TMPROOT/s1-mkdir/deep/er"
out=$(mkdoc | bash "$WRITER" write --dir "$d" --date 2026-01-02 2>&1)
assert_eq "S1.09 write: creates the target directory when it is missing" "yes" \
  "$([ -f "$d/2026-01-02-issues.json" ] && echo yes || echo no)"

# AC 3 — a second run on the same day rewrites and re-stamps.
d="$TMPROOT/s1-rerun"
target="$d/2026-01-02-issues.json"
mkdoc | bash "$WRITER" write --dir "$d" --date 2026-01-02 >/dev/null 2>&1
before=$(ms_of "$target" 2>/dev/null || echo "")
mkdoc | sed 's/"open": 1/"open": 2/' | bash "$WRITER" write --dir "$d" --date 2026-01-02 >/dev/null 2>&1
after=$(ms_of "$target" 2>/dev/null || echo "")
assert_eq "S1.10 write: a second run on the same day rewrites the content" "yes" \
  "$(grep -q '"open": 2' "$target" 2>/dev/null && echo yes || echo no)"
if [ -n "$before" ] && [ -n "$after" ] && [ "$after" -gt "$before" ] 2>/dev/null; then
  ok "S1.11 write: a second run strictly advances mtime (AC 3) [$before -> $after]"
else
  ko "S1.11 write: a second run strictly advances mtime (AC 3)" \
    "before=[$before] after=[$after] — if these are equal the filesystem tick, not the writer, is the limit; separate the runs, do not round"
fi

# --- refusals ---------------------------------------------------------------

d="$TMPROOT/s1-empty-stdin"
out=$(printf '' | bash "$WRITER" write --dir "$d" --date 2026-01-02 2>&1)
rc=$?
assert_eq "S1.12a write: empty stdin is refused with the payload code" "3" "$rc"
assert_eq "S1.12b write: empty stdin writes nothing" "no" \
  "$([ -f "$d/2026-01-02-issues.json" ] && echo yes || echo no)"

d="$TMPROOT/s1-keep"
target="$d/2026-01-02-issues.json"
mkdoc | bash "$WRITER" write --dir "$d" --date 2026-01-02 >/dev/null 2>&1
sum_before=$(cksum <"$target" 2>/dev/null)
out=$(printf '{"schemaVersion": 1, "generatedAt": "x"' | bash "$WRITER" write --dir "$d" --date 2026-01-02 2>&1)
rc=$?
sum_after=$(cksum <"$target" 2>/dev/null)
assert_eq "S1.13a write: an invalid payload is refused with the payload code" "3" "$rc"
assert_eq "S1.13b write: a refused payload leaves the existing snapshot untouched" \
  "$sum_before" "$sum_after"

# D2 — the script writes; it never fetches. Proven behaviourally: a poisoned `gh`
# is put FIRST on PATH and leaves a marker if it is ever executed. A grep for the
# string "gh" would be fired by a comment describing the rule; this cannot be.
bindir="$TMPROOT/poison-bin"
mkdir -p "$bindir"
marker="$TMPROOT/gh-was-called"
printf '#!/usr/bin/env bash\ntouch "%s"\nexit 0\n' "$marker" >"$bindir/gh"
chmod +x "$bindir/gh"
d="$TMPROOT/s1-nogh"
mkdoc | PATH="$bindir:$PATH" bash "$WRITER" write --dir "$d" --date 2026-01-02 >/dev/null 2>&1
PATH="$bindir:$PATH" bash "$WRITER" latest --dir "$d" >/dev/null 2>&1
assert_eq "S1.14 D2: no tracker access — a poisoned gh on PATH is never invoked" "no" \
  "$([ -f "$marker" ] && echo yes || echo no)"

# --- payload validation -----------------------------------------------------

out=$(mkdoc | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.15 validate: a contract-shaped document passes" "0" "$rc"

out=$(mkdoc | sed 's/\["debt"\]/[{"id":"LA_kwD","name":"debt","color":"D93F0B"}]/' | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.16a validate: labels as tracker objects are refused (D5)" "3" "$rc"
assert_contains "S1.16b validate: the refusal names labels" "labels" "$out"

out=$(mkdoc | sed 's/"state": "OPEN"/"state": "open"/' | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.17a validate: a lowercase state is refused (D5)" "3" "$rc"
assert_contains "S1.17b validate: the refusal names state" "state" "$out"

out=$(mkdoc | sed 's/"unreachable": false/"unreachable": true/' | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.18a validate: an unreachable repo with a numeric count is refused (D6)" "3" "$rc"
assert_contains "S1.18b validate: the refusal names unreachable" "unreachable" "$out"

out=$(mkdoc | sed -e 's/"unreachable": false/"unreachable": true/' -e 's/"open": 1/"open": null/' | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.19 validate: an unreachable repo with a null count is accepted (D6)" "0" "$rc"

out=$(mkdoc | sed 's/"repos":/"repoz":/' | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.20 validate: a missing top-level key is refused" "3" "$rc"

out=$(printf '{"schemaVersion": 1, "generatedAt": "x", "repos": [{"repo": "a"' | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.21 validate: a truncated document is refused" "3" "$rc"

# String-content immunity: a title that CONTAINS the forbidden shapes must still
# pass. A validator built out of grep would fail this and call a legitimate issue
# title a schema violation.
poison='{
  "schemaVersion": 1,
  "generatedAt": "2026-08-15T18:00:00Z",
  "repos": [
    {
      "repo": "owner/example-repo",
      "open": 1,
      "unreachable": false,
      "issues": [
        {
          "number": 99,
          "title": "reject \"labels\":[{\"name\":\"x\"}] and \"state\": \"open\" and \\\"unreachable\\\": true",
          "state": "OPEN",
          "repo": "owner/example-repo",
          "labels": ["debt"]
        }
      ]
    }
  ]
}'
out=$(printf '%s\n' "$poison" | bash "$WRITER" validate 2>&1)
rc=$?
assert_eq "S1.22 validate: a title CONTAINING the forbidden shapes is still accepted" "0" "$rc"

# --- hygiene ----------------------------------------------------------------
# Issue #23: *.sh is not pinned to LF here and core.autocrlf=true re-expands text
# files on checkout. MSYS2 bash tolerates CR; a Linux or macOS runner does not.
#
# Counted as BYTES, not matched as a pattern. `od -c "$f" | grep '\\r'` looks like
# it works and does not: grep collapses the escape and matches the letter r, so it
# fired on 318 lines of a file holding zero CR bytes. od stays the tool for reading
# a file by eye; tr is the one that can be asserted on.
#
# ASSERTED ON THE COMMITTED BLOB, not the working tree — deliberately. What
# portability depends on is what is stored: a Linux or macOS checkout of an LF blob
# yields LF. On Windows with core.autocrlf=true the worktree copy comes back CRLF
# after EVERY checkout, which says nothing about portability and would make this
# gate permanently red. A test that is always red is a test everyone learns to
# ignore, and it would take the other 60 down with it. The worktree count is still
# reported below, because #23 is real and should stay visible — it just is not the
# thing being asserted.
crlf=""
for f in "$WRITER" "$HERE/run-tests.sh"; do
  [ -f "$f" ] || continue
  rel=${f#"$REPO_ROOT"/}
  if git -C "$REPO_ROOT" cat-file -e "HEAD:$rel" 2>/dev/null; then
    blob=$(git -C "$REPO_ROOT" show "HEAD:$rel" | wc -c | tr -d ' ')
    # An EMPTY read counts CR=0 and passes vacuously — the exact way a broken
    # comparison reports green. On Windows, git's `<rev>:<path>` argument is a
    # known casualty of MSYS path conversion, so this is a live failure mode and
    # not a hypothetical. No bytes read => the check did not run => fail loudly.
    if [ "$blob" -eq 0 ]; then
      crlf="$crlf $(basename "$f"):BLOB-UNREADABLE"
      continue
    fi
    n=$(git -C "$REPO_ROOT" show "HEAD:$rel" | tr -dc '\r' | wc -c | tr -d ' ')
  else
    # not yet committed (mid-slice): the worktree copy is all there is to check
    n=$(tr -dc '\r' <"$f" | wc -c | tr -d ' ')
  fi
  [ "$n" -eq 0 ] || crlf="$crlf $(basename "$f"):${n}CR"
done
assert_eq "S1.23 hygiene: the slice's shell files are LF in git (issue #23)" "" "$crlf"

# Informational only — never asserted. Surfaces the #23 condition on this desk
# without gating on it.
wt=""
for f in "$WRITER" "$HERE/run-tests.sh"; do
  [ -f "$f" ] || continue
  n=$(tr -dc '\r' <"$f" | wc -c | tr -d ' ')
  [ "$n" -eq 0 ] || wt="$wt $(basename "$f"):${n}CR"
done
[ -z "$wt" ] || printf 'NOTE  worktree copies carry CR (issue #23, core.autocrlf):%s\n' "$wt"

# ---------------------------------------------------------------------------
# S2 — the handover contract and its pinned example (AC 4).
#
# What A4a-iii-snap consumes. The example is not decoration: it is fed through
# the writer's own validator, so "the shape is pinned" is a thing the suite can
# decide rather than a claim in a document.
# ---------------------------------------------------------------------------

EXAMPLE="$SKILL_DIR/references/snapshot-example.json"
CONTRACT="$SKILL_DIR/references/snapshot-contract.md"

assert_eq "S2.01 the pinned example exists at a stable path" "yes" \
  "$([ -f "$EXAMPLE" ] && echo yes || echo no)"

out=$(bash "$WRITER" validate <"$EXAMPLE" 2>&1)
rc=$?
assert_eq "S2.02a the pinned example passes the writer's own validator" "0" "$rc"
# check_repo() refuses a repos[] record without "open", so a passing example
# carries per-repo counts by construction, not by inspection.
assert_eq "S2.02b the example carries every repo shape the contract names" "3" "$(field repos "$out")"

# D4 — the example must live where the selection rule cannot reach it.
assert_eq "S2.03a the example is NOT inside docs/roadmap-snapshots/" "no" \
  "$(case "$EXAMPLE" in *docs/roadmap-snapshots/*) echo yes ;; *) echo no ;; esac)"
d="$TMPROOT/s2-d4"
mkdir -p "$d"
cp "$EXAMPLE" "$d/snapshot-example.json" 2>/dev/null
out=$(bash "$WRITER" latest --dir "$d" 2>&1)
rc=$?
assert_eq "S2.03b even dropped INTO the snapshot directory the example cannot be selected (D4)" "1" "$rc"

assert_eq "S2.04 the handover contract exists at a stable path" "yes" \
  "$([ -f "$CONTRACT" ] && echo yes || echo no)"

ctext=$(cat "$CONTRACT" 2>/dev/null || echo "")
assert_contains "S2.05 the contract states the rule as lexicographic max of the basename (AC 4)" \
  "lexicographic max" "$ctext"
assert_contains "S2.06 the contract says in as many words that it is NOT mtime ordering (AC 4)" \
  "not mtime ordering" "$ctext"
assert_contains "S2.07a the contract names distilledAt" "distilledAt" "$ctext"
assert_contains "S2.07b the contract names the mtime of the selected file as its source" \
  "mtime" "$ctext"
assert_contains "S2.08 the contract documents the unreachable/null rule (D6)" \
  "unreachable" "$ctext"
assert_contains "S2.09 the contract tells the consumer not to read generatedAt as distilledAt" \
  "generatedAt" "$ctext"

# The ticket names the per-issue field list. Enforced in the validator, so the
# example proves it rather than being eyeballed for it.
out=$(bash "$WRITER" validate <<'JSON' 2>&1
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-15T18:00:00Z",
  "repos": [
    {
      "repo": "owner/example-repo",
      "open": 1,
      "unreachable": false,
      "issues": [{ "number": 23, "title": "t", "state": "OPEN", "labels": [] }]
    }
  ]
}
JSON
)
rc=$?
assert_eq "S2.10a an issues[] record missing a contract field is refused" "3" "$rc"
assert_contains "S2.10b the refusal names the missing field" "repo" "$out"

# ---------------------------------------------------------------------------
# S3 — SKILL.md names the write step (AC 2).
#
# AC 2's control is `grep -in snapshot SKILL.md`, which returned NOTHING before
# this slice. Naming the step somewhere in the file is not enough: it has to be
# in the Standard Process, or the step is documented where nobody following the
# process will read it.
# ---------------------------------------------------------------------------

SKILL_MD="$SKILL_DIR/SKILL.md"

section() { # heading file -> the body under "## <heading>"
  awk -v h="$1" '
    $0 == "## " h { inb = 1; next }
    /^## / { if (inb) exit }
    inb { print }
  ' "$2" 2>/dev/null
}

hits=$(grep -in snapshot "$SKILL_MD" 2>/dev/null | wc -l | tr -d ' ')
if [ "$hits" -gt 0 ]; then
  ok "S3.01 AC 2: the red control is now green — grep -in snapshot returns $hits line(s)"
else
  ko "S3.01 AC 2: the red control is now green" "grep -in snapshot SKILL.md returned nothing"
fi

sp=$(section "Standard Process" "$SKILL_MD")
assert_contains "S3.02 the Standard Process names the snapshot write step (AC 2)" "snapshot" "$sp"
assert_contains "S3.03 the Standard Process names the script that performs it" \
  "write-snapshot.sh" "$sp"
assert_contains "S3.04 the Standard Process states the write happens on every run" \
  "every" "$sp"

gr=$(section "Guardrails" "$SKILL_MD")
assert_contains "S3.05 a guardrail covers the snapshot write" "snapshot" "$gr"
# D8 — the two must not be conflated: --dry-run writes nothing; a no-change run
# still writes and re-stamps.
assert_contains "S3.06 the guardrail keeps --dry-run writing nothing (D8)" "dry-run" "$gr"
assert_contains "S3.07 the guardrail says a no-change run still writes (D8)" "no-change" "$gr"

eo=$(section "Expected Output" "$SKILL_MD")
assert_contains "S3.08 the Expected Output block reports the snapshot" "SNAPSHOT" "$eo"

assert_contains "S3.09 SKILL.md points at the handover contract" \
  "snapshot-contract.md" "$(cat "$SKILL_MD" 2>/dev/null || echo '')"

# Step 7 has to be executable, not aspirational: "hand the records to the script"
# is prose unless the step also says how to shape them, and hand-assembling the
# payload issue by issue is where D5's normalization would quietly get skipped.
assert_contains "S3.10a the write step carries a paste-able adapter-side shaping command" \
  "gh issue list" "$sp"
assert_contains "S3.10b the shaping command normalizes labels to name strings (D5)" \
  "labels[].name" "$sp"

# ---------------------------------------------------------------------------
# S4 — repo plumbing (D7): the snapshots are ignored, the directory survives.
#
# The pair only works together. Ignore the directory outright and git stops
# descending into it, so the .gitkeep negation never fires and the directory is
# missing on a fresh clone — which is the AC 1 path.
# ---------------------------------------------------------------------------

ignored() { # repo-relative path -> yes/no  (check-ignore: 0 ignored, 1 not)
  if git -C "$REPO_ROOT" check-ignore -q "$1" 2>/dev/null; then echo yes; else echo no; fi
}

assert_eq "S4.01 a dated snapshot is gitignored (D7)" "yes" \
  "$(ignored docs/roadmap-snapshots/2026-01-02-issues.json)"
assert_eq "S4.02 the directory is kept by a .gitkeep" "yes" \
  "$([ -f "$REPO_ROOT/docs/roadmap-snapshots/.gitkeep" ] && echo yes || echo no)"
assert_eq "S4.03 the .gitkeep itself is NOT ignored" "no" \
  "$(ignored docs/roadmap-snapshots/.gitkeep)"
if git -C "$REPO_ROOT" ls-files --error-unmatch docs/roadmap-snapshots/.gitkeep >/dev/null 2>&1; then
  ok "S4.04 the .gitkeep is tracked, so the directory exists on a fresh clone"
else
  ko "S4.04 the .gitkeep is tracked, so the directory exists on a fresh clone" \
    "git ls-files could not match it — an ignored-and-untracked .gitkeep keeps nothing"
fi
assert_eq "S4.05 the pinned example is NOT ignored — it has to ship" "no" \
  "$(ignored .claude/skills/aedl-roadmap/references/snapshot-example.json)"

echo
echo "=== $pass passed · $fail failed ==="
if [ "$fail" -ne 0 ]; then
  echo "failed:"
  printf '%s' "$failed" | sed 's/^/  - /'
  exit 1
fi
exit 0
