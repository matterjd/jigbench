#!/usr/bin/env bash
# write-snapshot.sh — the aedl-roadmap skill's dated snapshot writer (mn#15, Gate 8).
#
#   write    [--dir DIR] [--date YYYY-MM-DD]   < snapshot.json
#            Write the reconciliation snapshot to DIR/<date>-issues.json and
#            re-stamp its mtime. Runs on EVERY reconciliation, including a run
#            that found no divergence — mtime IS distilledAt downstream, so a
#            skipped write makes a fresh reconciliation read as stale.
#   latest   [--dir DIR]
#            Resolve the snapshot a consumer should read, and its distilledAt.
#            This is the reference implementation of the handover contract's
#            newest-file rule; command-center's provider mirrors it.
#   validate                                    < snapshot.json
#            Check a payload against the contract without writing anything.
#            This is the dry-run path: --dry-run never calls `write`.
#
# THE RULE THIS SCRIPT EXISTS TO HOLD (contract §"Which file is newest"):
#   SELECT = lexicographic max of the basename matching
#            ^[0-9]{4}-[0-9]{2}-[0-9]{2}-issues\.json$
#   STAMP  = the mtime of THAT selected file.
# They are two independent clauses. Collapsing them into "newest by mtime" agrees
# with the rule on every ordinary day and disagrees exactly when it matters, which
# is why this is code and not a sentence in a skill file.
#
# THE BOUNDARY: this script writes; it never fetches. Issue records arrive on
# stdin, already gathered through the issue-tracker adapter. It must never shell
# out to `gh` — "tracker access only through the adapter" is a standing guardrail
# of the skill, and a script that reached past it to save one pipe would break it.
#
# Exit codes: 0 ok · 1 no snapshot found (latest) · 2 usage · 3 invalid payload
#             · 4 filesystem error
set -u
export LC_ALL=C

SELF_DIR=$(cd "$(dirname "$0")" && pwd)
# .../<repo>/.claude/skills/aedl-roadmap/scripts -> <repo>
DEFAULT_ROOT=$(cd "$SELF_DIR/../../../.." && pwd)
DEFAULT_DIR="$DEFAULT_ROOT/docs/roadmap-snapshots"

fail() {
  code=$1
  shift
  printf '%s\n' "$*" >&2
  exit "$code"
}

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
}

# --- time helpers -----------------------------------------------------------
# mtime as epoch MILLISECONDS: command-center reads it through
# FsAdapter.statMtimeMs, so milliseconds is the unit the contract speaks.
mtime_ms() {
  raw=$(stat -c '%.9Y' "$1" 2>/dev/null || true)
  case "$raw" in
  '' | *[!0-9.]*) raw='' ;;
  esac
  [ -n "$raw" ] || raw=$(stat -c '%Y' "$1" 2>/dev/null || true)
  [ -n "$raw" ] || raw=$(stat -f '%m' "$1" 2>/dev/null || true)
  [ -n "$raw" ] || return 1
  sec=${raw%%.*}
  frac=${raw#*.}
  [ "$frac" = "$raw" ] && frac=000000000
  frac="${frac}000000000"
  printf '%s%s\n' "$sec" "${frac:0:3}"
}

iso_of_ms() {
  ms=$1
  sec=${ms%???}
  msec=${ms: -3}
  [ -n "$sec" ] || sec=0
  base=$(date -u -d "@$sec" +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -r "$sec" +%Y-%m-%dT%H:%M:%S 2>/dev/null || true)
  [ -n "$base" ] || {
    printf 'unknown\n'
    return 0
  }
  printf '%s.%sZ\n' "$base" "$msec"
}

# --- D3: selection ----------------------------------------------------------
# Lexicographic max of the basename. No sort, no pipe, no mtime: the comparison
# is spelled out so that reading the code answers "which ordering is this?".
#
# D-026 (mn#32, ruled 2026-08-21, option 1): the date COMPONENTS are validated --
# month 01-12, day 01-31 -- because a shape-only match admitted impossible dates.
# A single stray 9999-99-99-issues.json shadowed every real snapshot PERMANENTLY
# and SILENTLY, and its mtime became distilledAt. Every other failure in this
# contract degrades quietly to "no reconciliation yet"; that one is loud and wrong.
# The narrowing is deliberately NOT a calendar check: 2026-02-31 still selects.
# Rejecting it would need the month, which is a per-month rule, and this stays a
# PURE FUNCTION OF THE BASENAME -- no filesystem, no clock -- which is the property
# the whole rule exists to have. Impossible-by-any-month is the line.
select_latest() {
  dir=$1
  max=''
  [ -d "$dir" ] || return 1
  for f in "$dir"/*; do
    [ -f "$f" ] || continue
    base=${f##*/}
    [[ $base =~ ^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-issues\.json$ ]] || continue
    if [ -z "$max" ] || [[ $base > $max ]]; then max=$base; fi
  done
  [ -n "$max" ] || return 1
  printf '%s\n' "$max"
}

# --- payload validation -----------------------------------------------------
# A single-pass JSON scanner. It validates STRUCTURE, so a check can never be
# fired by the CONTENT of a string: an issue title that quotes the forbidden
# shapes is data, and a grep-shaped validator would reject it. What it enforces:
#   D5 — labels[] holds name strings, not the tracker's label objects;
#        state keeps the tracker's uppercase form.
#   D6 — an unreachable repo records "open": null, never a count.
#   AC4 — every repos[] record carries a per-repo count.
validate_file() {
  awk '
    function err(msg) { errs++; printf("SNAPSHOT_INVALID: %s\n", msg) }
    function haskey(d, k) { return index(keyorder[d], SUBSEP k SUBSEP) > 0 }
    function reset_obj(d) { keyorder[d] = ""; delete val_open[d]; delete val_unreachable[d] }

    function open_container(c,   ok, parentc) {
      ok = ""; parentc = ""
      if (depth >= 1) {
        parentc = container[depth]
        if (parentc == "obj") ok = curkey[depth]; else ok = ownerkey[depth]
      }
      if (depth == 0) {
        if (root_seen) err("more than one root value")
        root_seen = 1
        if (c != "{") err("the document root must be a JSON object")
      }
      if (parentc == "obj" && (ok == "repos" || ok == "issues" || ok == "labels") && c != "[")
        err("\"" ok "\" must be an array")
      if (ok == "labels" && c == "{")
        err("labels[] must hold name strings, not the tracker label objects (D5)")
      depth++
      container[depth] = (c == "{") ? "obj" : "arr"
      ownerkey[depth] = ok
      curkey[depth] = ""
      reset_obj(depth)
      if (c == "{" && parentc == "arr" && ok == "repos") nrepos++
      if (c == "{" && parentc == "arr" && ok == "issues") nissues++
    }

    function check_repo(d,   uv, ov) {
      if (!haskey(d, "repo"))   err("a repos[] record is missing \"repo\"")
      if (!haskey(d, "open"))   err("a repos[] record is missing \"open\" — the per-repo count is what the consumer reads")
      if (!haskey(d, "issues")) err("a repos[] record is missing \"issues\"")
      uv = (d in val_unreachable) ? val_unreachable[d] : ""
      ov = (d in val_open) ? val_open[d] : ""
      if (uv == "bool=true") {
        if (ov != "null=null")
          err("an unreachable repo must record \"open\": null, never a count (D6) — zero open issues and unknown are different facts")
      } else if (ov != "" && ov !~ /^number=/) {
        err("\"open\" must be a number for a reachable repo (D6)")
      }
    }

    function check_issue(d,   f, i, n) {
      n = split("number title state repo labels", f, " ")
      for (i = 1; i <= n; i++)
        if (!haskey(d, f[i]))
          err("an issues[] record is missing \"" f[i] "\" — the contract pins number, title, state, repo, labels")
    }

    function close_container(c,   d) {
      d = depth
      if (d == 0) { err("unbalanced " c); return }
      if ((c == "}" && container[d] != "obj") || (c == "]" && container[d] != "arr")) {
        err("mismatched " c); depth--; return
      }
      if (c == "}") {
        if (d == 1) {
          if (!haskey(1, "schemaVersion")) err("missing top-level key: schemaVersion")
          if (!haskey(1, "generatedAt"))   err("missing top-level key: generatedAt")
          if (!haskey(1, "repos"))         err("missing top-level key: repos")
        }
        if (ownerkey[d] == "repos" && container[d-1] == "arr") check_repo(d)
        if (ownerkey[d] == "issues" && container[d-1] == "arr") check_issue(d)
      }
      depth--
    }

    function value(t, v,   d, k) {
      d = depth
      if (d == 0) {
        if (!root_seen) { root_seen = 1; err("the document root must be a JSON object") }
        else err("more than one root value")
        return
      }
      k = (container[d] == "arr") ? ownerkey[d] : curkey[d]
      if (container[d] == "arr") {
        if (k == "labels" && t != "string") err("labels[] must hold name strings (D5) — found a " t)
        if (k == "repos" || k == "issues") err("\"" k "\"[] must hold objects — found a " t)
        return
      }
      if (k == "repos" || k == "issues" || k == "labels") { err("\"" k "\" must be an array"); return }
      if (k == "state") {
        if (t != "string") err("\"state\" must be a string")
        else if (v !~ /^[A-Z][A-Z_]*$/)
          err("\"state\" must keep the tracker uppercase form (D5) — found \"" v "\"")
      }
      if (k == "open") val_open[d] = t "=" v
      if (k == "unreachable") val_unreachable[d] = t "=" v
    }

    function is_ws(ch) { return (ch == " " || ch == "\t" || ch == "\r" || ch == "\n") }

    { doc = doc $0 "\n" }

    END {
      n = length(doc); i = 1; depth = 0; errs = 0; root_seen = 0; nrepos = 0; nissues = 0
      while (i <= n) {
        c = substr(doc, i, 1)
        if (is_ws(c)) { i++; continue }
        if (c == "\"") {
          j = i + 1; s = ""; terminated = 0
          while (j <= n) {
            ch = substr(doc, j, 1)
            if (ch == "\\") { s = s substr(doc, j, 2); j += 2; continue }
            if (ch == "\"") { terminated = 1; break }
            s = s ch; j++
          }
          if (!terminated) { err("unterminated string literal"); break }
          i = j + 1
          k = i
          while (k <= n && is_ws(substr(doc, k, 1))) k++
          if (substr(doc, k, 1) == ":") {
            if (depth < 1 || container[depth] != "obj") err("a key outside an object: " s)
            else { curkey[depth] = s; keyorder[depth] = keyorder[depth] SUBSEP s SUBSEP }
            i = k + 1
            continue
          }
          value("string", s)
          continue
        }
        if (c == "{" || c == "[") { open_container(c); i++; continue }
        if (c == "}" || c == "]") { close_container(c); i++; continue }
        if (c == "," ) { i++; continue }
        if (c == ":" ) { err("unexpected :"); i++; continue }
        j = i
        while (j <= n && substr(doc, j, 1) ~ /[-+0-9.eEtruflasn]/) j++
        lit = substr(doc, i, j - i)
        if (lit == "") { err("unexpected character: " c); i++; continue }
        i = j
        if (lit == "true" || lit == "false") value("bool", lit)
        else if (lit == "null") value("null", lit)
        else if (lit ~ /^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/) value("number", lit)
        else err("unrecognised literal: " lit)
      }
      if (!root_seen) err("empty or non-JSON payload")
      if (depth != 0) err("unbalanced document — " depth " container(s) left open (truncated?)")
      if (errs > 0) exit 1
      printf("OK repos=%d issues=%d\n", nrepos, nissues)
    }
  ' "$1"
}

buffer_stdin() { # $1 = destination path
  cat >"$1" || return 1
  return 0
}

# --- subcommands ------------------------------------------------------------
cmd_latest() {
  base=$(select_latest "$DIR") || {
    printf 'SNAPSHOT_NONE dir=%s\n' "$DIR"
    exit 1
  }
  path="$DIR/$base"
  ms=$(mtime_ms "$path") || fail 4 "cannot read the mtime of $path"
  printf 'SNAPSHOT_LATEST file=%s path=%s distilledAtMs=%s distilledAt=%s\n' \
    "$base" "$path" "$ms" "$(iso_of_ms "$ms")"
}

cmd_validate() {
  tmp=$(mktemp) || fail 4 "cannot create a temporary file"
  trap 'rm -f "$tmp"' EXIT
  buffer_stdin "$tmp" || fail 4 "cannot read stdin"
  bytes=$(wc -c <"$tmp" | tr -d ' ')
  if [ "$bytes" -eq 0 ]; then
    fail 3 "SNAPSHOT_INVALID: empty payload on stdin — this script writes what the adapter handed it; it never fetches"
  fi
  out=$(validate_file "$tmp")
  rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '%s\n' "$out" >&2
    fail 3 "SNAPSHOT_INVALID: payload refused (see above)"
  fi
  printf 'SNAPSHOT_VALID bytes=%s %s\n' "$bytes" "${out#OK }"
}

cmd_write() {
  [ -n "$DATE_STR" ] || DATE_STR=$(date -u +%F)
  [[ $DATE_STR =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail 2 "--date must be YYYY-MM-DD (got: $DATE_STR)"
  mkdir -p "$DIR" || fail 4 "cannot create $DIR"
  target="$DIR/$DATE_STR-issues.json"
  tmp="$DIR/.$DATE_STR-issues.json.$$.tmp"
  trap 'rm -f "$tmp"' EXIT
  buffer_stdin "$tmp" || fail 4 "cannot buffer stdin into $DIR"
  bytes=$(wc -c <"$tmp" | tr -d ' ')
  if [ "$bytes" -eq 0 ]; then
    rm -f "$tmp"
    fail 3 "SNAPSHOT_INVALID: empty payload on stdin — nothing written, $target left as it was"
  fi
  out=$(validate_file "$tmp")
  rc=$?
  if [ "$rc" -ne 0 ]; then
    rm -f "$tmp"
    printf '%s\n' "$out" >&2
    fail 3 "SNAPSHOT_INVALID: payload refused — nothing written, $target left as it was"
  fi
  prev=none
  if [ -f "$target" ]; then prev=$(mtime_ms "$target") || prev=none; fi
  mv -f "$tmp" "$target" || fail 4 "cannot move the snapshot into place at $target"
  # `mv` carries the temp file's mtime across. Re-stamp explicitly so the stamp is
  # the moment of THIS run, on every run — that is the whole of AC 3.
  touch "$target" || fail 4 "cannot re-stamp $target"
  ms=$(mtime_ms "$target") || fail 4 "cannot read the mtime of $target"
  printf 'SNAPSHOT_WRITTEN file=%s path=%s bytes=%s %s prevDistilledAtMs=%s distilledAtMs=%s distilledAt=%s\n' \
    "$DATE_STR-issues.json" "$target" "$bytes" "${out#OK }" "$prev" "$ms" "$(iso_of_ms "$ms")"
}

# --- argument parsing -------------------------------------------------------
CMD=${1:-}
[ $# -gt 0 ] && shift
DIR="$DEFAULT_DIR"
DATE_STR=""
while [ $# -gt 0 ]; do
  case "$1" in
  --dir)
    [ $# -ge 2 ] || fail 2 "--dir needs a value"
    DIR=$2
    shift 2
    ;;
  --dir=*)
    DIR=${1#--dir=}
    shift
    ;;
  --date)
    [ $# -ge 2 ] || fail 2 "--date needs a value"
    DATE_STR=$2
    shift 2
    ;;
  --date=*)
    DATE_STR=${1#--date=}
    shift
    ;;
  -h | --help)
    CMD=help
    shift
    ;;
  *) fail 2 "unknown option: $1 (try: $(basename "$0") help)" ;;
  esac
done

case "$CMD" in
write) cmd_write ;;
latest) cmd_latest ;;
validate) cmd_validate ;;
help | -h | --help) usage ;;
'') usage >&2; exit 2 ;;
*) fail 2 "unknown command: $CMD (try: $(basename "$0") help)" ;;
esac
