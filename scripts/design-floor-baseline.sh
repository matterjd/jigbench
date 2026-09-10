#!/usr/bin/env bash
# design-floor-baseline — a recorded prior state for the Design axis (mn#28).
#
# THE PROBLEM. The Design axis checks the floor AGAINST A DIFF, but the floor's
# highest-risk items describe a SURFACE, not a hunk. With no baseline a judge cannot
# separate what a slice INTRODUCED from what it INHERITED, so the first UI slice
# absorbs the whole shell's accumulated design debt at Blocker severity. That is what
# forced the report-only exception on the axis's first firing (DESIGN-TEAM.md 5.2),
# and that exception expires when cc#128 reports and does not renew.
#
# WHAT THIS RECORDS. The SET of design-floor SITES currently in the repo's stylesheets
# AND in its TypeScript sources, one line per site. A finding then means "this slice
# made it worse", not "this repo has debt".
#
# ---------------------------------------------------------------------------
# WHY TYPESCRIPT IS SCANNED AT ALL (cc#237)
# ---------------------------------------------------------------------------
# The first version scanned stylesheets only. command-center's largest design surface —
# the Deep Field — is drawn on a CANVAS from TypeScript, so every colour, font, dash
# pattern and glow on it was invisible. cc#128/A5b touched ZERO `.scss` files, added
# three hand-rolled `rgba()` constants and a sub-11px font, and this script reported
# `OK - no new design-floor sites`. It could not have gone red on that diff whatever the
# slice drew, which is this workspace's own rule turned on the gate: AN ASSERTION THAT
# CANNOT FAIL IS A COMMENT WITH AN `expect()` AROUND IT.
#
# The fix is scope, not judgement: cc#237's option 1. Canvas sites are collected as
# THEIR OWN item classes, prefixed `C`, never folded into the stylesheet items. A `7|`
# line means a stylesheet hex; a `C7|` line means a colour hand-rolled in TS. The two
# are different evidence and a reviewer must not have to guess which one they hold.
#
# The floor is a CLOSED 29-item enumeration (DESIGN-TEAM.md 6). No canvas class invents
# a 30th item. Each names the floor item it serves, and the one that serves none says so:
#
#   C3   canvas type          font-shorthand strings; `.font =` refs   -> floor item 3
#   C7   hand-rolled colour   a colour literal anywhere in the TS   -> floor item 7
#   C25  canvas aura          nonzero/variable `shadowBlur`, `createRadialGradient`
#                             -> floor item 25
#   C0   canvas paint sites   `fillStyle` `strokeStyle` `setLineDash`
#        NO FLOOR ITEM. Recorded because each is a design decision a slice can introduce
#        and a reviewer should see. It makes no floor claim and cannot block. If a floor
#        item is ever ruled for dash patterns, this class renumbers in one place.
#
# WHAT IS SCANNED IS PRINTED IN THE RECORD HEADER, always. A gate that is blind to a
# surface is worse than an absent one precisely because nobody can tell, so the record
# states its own coverage rather than implying it. `.d.ts`, `.spec.*` and `.test.*` are
# excluded — a type declaration has no values and a test renders nothing to a person —
# and that exclusion is printed too, not left to be discovered.
#
# ---------------------------------------------------------------------------
# WHY SITES AND NOT COUNTS (the unit decision, mn#28 question 1)
# ---------------------------------------------------------------------------
# cc#213 settled this class already, in its own words: a single net total "fails open
# by construction", because any growth hides behind a shrink elsewhere. The identical
# failure applies here. Delete one resting shadow, add one new one, and a count of 9
# stays 9 while the new violation is invisible.
#
# It was also demonstrated live while building this. A `z-index:` count returns 9 in
# command-center, but ONE of those 9 sits inside a COMMENT (shell/field-canvas.scss
# quotes a spec line). A count of 9 hides that. A site record shows the file and the
# declaration, and a reviewer catches it in one read.
#
# The issue framed the tradeoff as "counts are cheap but go stale silently; allowlists
# are precise but churn per feature". The churn is the POINT: churn is visible in a
# diff, silence is not. cc#213 made the same call for the same reason.
#
# SITE IDENTITY IS file + normalized-declaration, NOT file:line. Line numbers change
# whenever anything above them changes, so they would produce constant false reds and
# identify nothing stable. That is the same reasoning cc#213 used to normalise content
# hashes out of its filenames. Whitespace is collapsed so reformatting is not a
# finding. The one narrow way this fails open is a byte-identical declaration added
# twice in the same file, which is what the per-site OCCURRENCES column makes visible.
#
# ---------------------------------------------------------------------------
# HOW IT IS RE-RECORDED (mn#28 question 2)
# ---------------------------------------------------------------------------
# --record PRINTS the new block. It never writes. A human pastes it into the committed
# record and THE DIFF IS THE REVIEW, which is the same "visible, reviewable act"
# cc#213 established, deliberately not a second convention. A tool that rewrites its
# own baseline trains people to re-record without reading, and that is exactly how a
# baseline becomes a permanent amnesty.
#
# ---------------------------------------------------------------------------
# WHAT IS NOT IN HERE, AND WHY (mn#28 question 4)
# ---------------------------------------------------------------------------
# Only floor items whose SITES a deterministic command can enumerate from source are
# recorded. Every other item is a HUMAN CHECK and says so rather than pretending:
#
#   COVERED (sites enumerable from stylesheets):
#     item  2  --faint usages                     (load-bearing? human, per site)
#     item  4  animation/transition declarations
#     item  7  hand-rolled HEX at a call site (plus rgb()/hsl(), which is already broader
#              than the floor item's own wording). NOT named CSS keywords: floor item 7 reads
#              "not hand-rolled hex at the call site" (DESIGN-TEAM.md:320), and a named colour
#              is outside it. This comment previously said "colour literals", which a reviewer
#              read as the definition and scored the script against — the paraphrase, not the
#              floor, was the defect. Quote the floor item, do not summarise it.
#              MATCHED POSITIONALLY, not by token shape (mn#31). `#dedbee` is a valid hex
#              colour AND a valid CSS ID selector name, so shape alone cannot tell them
#              apart; `#dedbee { padding: 4px }` recorded as a colour site and renaming
#              such a selector read as introducing floor-item-7 debt. The position that
#              settles it is the BRACE: a selector is always outside it, a call site is
#              always inside. Nothing narrower — restricting to text after the property's
#              colon was tried and dropped, because `@include card-shadow(#7C879C)` has
#              no colon and a false negative here is worse than the false positive.
#     item 25  glow/aura candidates (drop-shadow filters; zero-offset shadows)
#     item 26  box-shadow declarations
#
#   COVERED (sites enumerable from TypeScript — canvas surfaces, cc#237):
#     C3   font-shorthand STRINGS wherever defined, plus `.font =` assignments whose value
#          is a reference. Both halves are needed: the string is what puts the SIZE in the
#          record (so shrinking a font goes red), the assignment is what shows a canvas
#          type site exists. Serves item 3; whether the size is under 11px and what pairs
#          with it stays a human read, exactly as item 2 does.
#     C7   colour literals in TS source. This catches the CONSTANT (`const HOLE_INK =
#          '#8b92a8'`) and not just the paint call, which is where the hand-rolling
#          actually happens — `ctx.fillStyle = HOLE_INK` names a token, the `const` is
#          what invented a colour.
#     C25  a canvas AURA by either mechanism: `shadowBlur` set nonzero-or-variable, and
#          `createRadialGradient`. `shadowBlur = 0` is a RESET, not an aura — the same
#          discrimination the stylesheet side makes between a zero-blur focus ring and a
#          real glow. Both mechanisms are needed: command-center has ZERO of the first
#          and TWO of the second, so a shadowBlur-only detector reported no glows on a
#          canvas whose own comments name two coronas.
#     C0   `fillStyle` / `strokeStyle` / `setLineDash`. No floor item; see the header.
#
#   NOT COVERED - human checks, by number:
#     items 1, 5      partially static at best; contrast needs resolved ground pairs and
#                     target rules need rendered geometry
#     item  3         for STYLESHEETS. Canvas type is enumerable (class C3 above) because a
#                     canvas font is one string; a CSS type ramp is not, and a rendered
#                     size needs geometry this script does not have.
#     item  6         semantic (does colour carry the meaning alone?)
#     items 8, 9      provenance claims about history, not present state
#     items 10-19, 21, 24   interaction semantics; no static form
#     item 20         runtime latency numbers
#     item 22         partially static; "lies about layout" is judgment
#     item 23         "point at what is animating right now" is a RUNTIME observation
#                     of the whole app. It cannot be baselined from source, and an
#                     item that cannot be baselined must be honest about being a human
#                     check rather than be quietly reported as clean.
#     items 27-29     FLOOR D art reproducibility - vault-side, not a code repo
#
# Usage:
#   bash scripts/design-floor-baseline.sh              # compare tree vs record
#   bash scripts/design-floor-baseline.sh --record     # PRINT a record (writes nothing)
#   bash scripts/design-floor-baseline.sh --self-test  # prove it can go RED
#
# Exit: 0 = no new sites | 1 = new or vanished sites | 2 = cannot determine
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" || exit 2

RECORD="${DESIGN_FLOOR_RECORD:-scripts/design-floor-baseline.txt}"
SRC="${DESIGN_FLOOR_SRC:-apps/desktop/src}"
# Canvas sources default to the same tree as the stylesheets. A repo that keeps them
# apart overrides this; a repo that does not gets canvas coverage without configuring
# anything, which is the point — cc#237 happened because the default saw less than the
# app draws.
CANVAS_SRC="${DESIGN_FLOOR_CANVAS_SRC:-$SRC}"
MODE="${1:-}"

sheets () { find "$SRC" \( -name '*.scss' -o -name '*.css' \) -type f 2>/dev/null | sort; }

# `.tsx` is scanned as well as `.ts`, though cc#237 named only `.ts`. A repo whose canvas
# lives in a `.tsx` reproduces cc#237 exactly, and under-scanning is the failure this
# whole change exists to remove. Excluded: `.d.ts` (declarations hold no values),
# `.spec.*` and `.test.*` (a test renders nothing to a person). Printed in the header.
sources () {
  find "$CANVAS_SRC" \( -name '*.ts' -o -name '*.tsx' \) -type f \
    ! -name '*.d.ts' ! -name '*.spec.ts' ! -name '*.spec.tsx' \
    ! -name '*.test.ts' ! -name '*.test.tsx' 2>/dev/null | sort
}
SCAN_SHEETS="*.scss *.css under $SRC"
SCAN_SOURCES="*.ts *.tsx under $CANVAS_SRC (excluding *.d.ts, *.spec.*, *.test.*)"

# A quoted string literal in TS - single, double, or template. Every canvas detector is
# built to be SELF-BOUNDING with this rather than running `.*` to the end of a chunk, so
# a source file written without semicolons cannot make one pattern swallow the file.
TSSTR="'[^']*'|\"[^\"]*\"|\`[^\`]*\`"
# An identifier or member expression, optionally called: `HOLE_INK`, `this.ink`, `grad(x)`.
TSREF="[A-Za-z_\$][A-Za-z0-9_\$.]*(\([^)]*\))?"

# Emit ITEM|FILE|NORMALIZED-DECLARATION|OCCURRENCES for every enumerable site.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

collect_sheets () {
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    # Paths are recorded RELATIVE TO SRC, never as `find` happened to print them.
    # Site identity must not depend on how SRC was spelled: a record made with
    # DESIGN_FLOOR_SRC=apps/desktop/src, compared against the same tree reached by an
    # absolute path, otherwise reports every single site as new. Caught by the red
    # control, which injected ONE aura into a scratch copy and was told 135 sites had
    # appeared. SRC itself is recorded in the header, so nothing is lost.
    rel="${f#./}"
    rel="${rel#$ROOT/}"
    rel="${rel#${SRC#./}/}"
    # NORMALISE THE WHOLE FILE FIRST, then split on `;`, so a declaration wrapped
    # across lines survives as ONE site. Discovered by the self-test's real run:
    # 2 of command-center's 9 box-shadows are multi-line, and a line-oriented grep
    # truncated both to a bare `box-shadow:` — two different shadows collapsing to
    # one identity, which is a site record that cannot tell them apart.
    # STRIP COMMENTS FIRST. A `/* ... */` block that merely MENTIONS a property was
    # otherwise captured as a declaration: command-center's app.scss has a comment
    # discussing `transition:` and the whole paragraph became a "site", so editing
    # unrelated prose would flip the gate red. This is the third comment-contamination
    # bug found in this session alone — `z-index:` inside a comment, `--faint` inside a
    # comment, and this one. Prose that describes a rule is not that rule.
    # `tr -d '\r'` FIRST. Joining lines leaves any CR embedded mid-declaration, so a
    # CRLF checkout gives every wrapped declaration a different identity than an LF one
    # and the whole record reads as changed. This machine runs core.autocrlf=true
    # (matter-notes #23) and command-center's app.scss is already MIXED, so this is not
    # hypothetical — it produced a phantom new+vanished pair for one untouched shadow.
    # SPLIT ON `}` AS WELL AS `;`, then DROP EVERYTHING THROUGH THE LAST `{` (mn#31).
    # Two jobs, one pass. Splitting on `}` alone fixes a chunk like
    # `a{ color: #fff } #abc{ padding: 0` — a rule whose final `;` was omitted, which is
    # ordinary CSS — that previously recorded as ONE run-on site. Dropping through the
    # last `{` is what makes item 7 POSITIONAL: a selector always precedes its brace, so
    # a hex-shaped ID selector is gone before any detector sees it, while every real
    # declaration is inside the braces and survives untouched.
    # `//` LINE COMMENTS TOO. SCSS has them and this scans `.scss`; nothing stripped them,
    # so `// old: #dedbee` after a file's last rule recorded as a colour site. It survived
    # this long because the brace strip eats any comment that PRECEDES a rule — only a
    # trailing one bites, which is why it took a deliberate probe to see. Same whitespace
    # guard as the TS path, which is what keeps `url(https://cdn/x.png)` and a
    # protocol-relative `url(//cdn/x.png)` intact.
    decls=$(tr -d '\r' < "$f" 2>/dev/null \
            | sed 's|^[[:space:]]*//.*||; s|[[:space:]]//.*||' \
            | tr '\n' ' ' \
            | sed 's|/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/| |g' \
            | tr ';}' '\n\n' | sed 's/.*{//' | tr -s ' \t' ' ' \
            | sed 's/^ //; s/ $//')
    printf '%s\n' "$decls" | grep -oE 'box-shadow[[:space:]]*:.*' | sed "s|^|26\|$rel\||"
    # item 25 — a GLOW is zero-offset WITH BLUR: `0 0 <nonzero>`. The blur test is
    # what separates it from a FOCUS RING, which is zero-offset with zero blur
    # (`0 0 0 2px`) and is an accessibility affordance, not an aura. Without it this
    # branch flagged all four of command-center's focus rings and one real glow, and
    # a baseline that is 80% false positives trains people to stop reading it.
    printf '%s\n' "$decls" | grep -oE 'filter[[:space:]]*:[^{]*drop-shadow[^{]*' | sed "s|^|25\|$rel\||"
    printf '%s\n' "$decls" | grep -oE 'box-shadow[[:space:]]*:[[:space:]]*0 0 [1-9][^{]*' | sed "s|^|25\|$rel\||"
    printf '%s\n' "$decls" | grep -oE 'var\(--faint[^)]*\)' | sed "s|^|2\|$rel\||"
    printf '%s\n' "$decls" | grep -oE '(animation|transition)[[:space:]]*:.*' | sed "s|^|4\|$rel\||"
    # item 7 (mn#31). The brace strip above is the ENTIRE positional rule; nothing further
    # is needed and one further thing was actively harmful. The first version of this fix
    # also kept only text after the property's colon, on the reading that "at the call
    # site" means "in a value". A mutation pass could not kill that line — every fixture
    # passed with it deleted — and probing why found it costs a real detection:
    # `@include card-shadow(#7C879C)` has no colon, so a genuinely hand-rolled colour
    # passed to a mixin was SILENTLY DROPPED. A false negative in this gate is the exact
    # failure cc#237 is about. The rule went; a selector always precedes its brace, so the
    # brace strip alone settles mn#31 and costs nothing.
    printf '%s\n' "$decls" \
      | grep -oE '#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)' | sed "s|^|7\|$rel\||"
  done < <(sheets)
}

collect_ts () {
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    rel="${f#./}"
    rel="${rel#$ROOT/}"
    rel="${rel#${CANVAS_SRC#./}/}"
    # `//` COMMENTS ARE STRIPPED ONLY WHERE A COMMENT CAN START: at the head of a line,
    # or after whitespace. The obvious `s|//.*||` truncates `'https://x/a//b'` mid-string
    # and every string literal after it in the file re-pairs against the wrong quote —
    # one URL silently desyncs the whole file. Requiring whitespace before `//` keeps a
    # URL path intact. The residue is a string containing a spaced ` // `, which is rarer
    # than a URL and fails toward recording too much rather than too little.
    # Block comments then go the same way they do in a stylesheet.
    decls=$(tr -d '\r' < "$f" 2>/dev/null \
            | sed 's|^[[:space:]]*//.*||; s|[[:space:]]//.*||' \
            | tr '\n' ' ' \
            | sed 's|/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/| |g' \
            | tr ';' '\n' | tr -s ' \t' ' ' \
            | sed 's/^ //; s/ $//')
    # C7 — a hand-rolled COLOUR LITERAL. Extract every string literal FIRST, then keep the
    # ones that are a colour. That ordering is the TS analogue of the positional CSS rule:
    # a bare `#abc` in TS is a private field or an anchor, and only a string can be an ink.
    # The hex branch is anchored to the WHOLE string so `'#abcdef is the code'` is prose,
    # not a colour; the rgb/hsl branch is not, because a template literal legitimately
    # builds one (`\`rgba(255,255,255,\${a})\``) and that IS a hand-rolled colour.
    printf '%s\n' "$decls" | grep -oE "$TSSTR" \
      | grep -E "^'#[0-9A-Fa-f]{3,8}'\$|^\"#[0-9A-Fa-f]{3,8}\"\$|^\`#[0-9A-Fa-f]{3,8}\`\$|rgba?\(|hsla?\(" \
      | sed "s|^|C7\|$rel\||"
    # C3 — canvas type, in TWO parts, because matching only the assignment FAILS OPEN.
    # command-center writes `g.font = NO_MAP_PLATE_FONT`, and that constant is
    # `'600 8.5px "Space Mono", monospace'` — an 8.5px font, the exact item-3 site cc#237
    # named as missed. An assignment-only detector records `font = NO_MAP_PLATE_FONT` and
    # then NEVER MOVES when 8.5px becomes 6px, so the size regression a reviewer is
    # looking for is invisible in the record. So:
    #   (a) every font-shorthand STRING, wherever it is defined — this is what puts the
    #       size in the record, and what makes changing the size go red;
    #   (b) every `.font =` assignment whose value is a REFERENCE — this is what shows a
    #       reviewer that a canvas type site exists at all.
    # A string-valued assignment needs no branch of its own: (a) already has it, and a
    # second branch would record one font twice. `\.font` is bounded by its own next
    # character, so `.fontFamily` and `.fontSize` cannot match (b).
    printf '%s\n' "$decls" | grep -oE "$TSSTR" \
      | grep -E "[0-9](\.[0-9]+)?px[[:space:]]+[A-Za-z\"']" | sed "s|^|C3\|$rel\||"
    printf '%s\n' "$decls" | grep -oE "\.font[[:space:]]*=[[:space:]]*($TSREF)" \
      | sed 's/^\.//' | sed "s|^|C3\|$rel\||"
    # C25 — a canvas GLOW, by BOTH mechanisms. `shadowBlur = 0` matches neither branch and
    # is therefore not a site: it is the canvas reset, the same way a zero-blur
    # `box-shadow` is a focus ring and not an aura. A variable blur IS recorded — an
    # unknown that might be an aura is what a reviewer needs to see, though note its
    # VALUE is not baselined, only the site.
    #
    # `createRadialGradient` is here because the shadowBlur-only version was green by
    # construction on the very repo it was written for: command-center contains ZERO
    # `shadowBlur` and TWO radial gradients, whose own comments call them "the corona"
    # and "the cold bloom". A detector aimed at the mechanism a codebase does not use is
    # cc#237 again, one level down. Only RADIAL — a linear gradient is a ramp, not an aura.
    # The call is recorded WITHOUT its arguments: they are live coordinates that churn
    # every frame, and item 25 bans the aura's existence, not its geometry. Two in one
    # file is one line with OCCURRENCES 2, so a third still goes red.
    printf '%s\n' "$decls" \
      | grep -oE "shadowBlur[[:space:]]*=[[:space:]]*([0-9.]*[1-9][0-9.]*|$TSREF)" \
      | sed "s|^|C25\|$rel\||"
    printf '%s\n' "$decls" | grep -oE 'createRadialGradient' \
      | sed "s|.*|C25\|$rel\|createRadialGradient()|"
    # C0 — canvas paint and stroke-pattern sites. No floor item; see the header.
    printf '%s\n' "$decls" \
      | grep -oE "(fillStyle|strokeStyle)[[:space:]]*=[[:space:]]*($TSSTR|$TSREF)" \
      | sed "s|^|C0\|$rel\||"
    printf '%s\n' "$decls" | grep -oE 'setLineDash\([^)]*\)' | sed "s|^|C0\|$rel\||"
  done < <(sources)
}

collect () {
  { collect_sheets; collect_ts; } \
    | sed 's/[[:space:]]*$//' | grep -v '|$' \
    | sort | uniq -c | awk '{n=$1; $1=""; sub(/^ /,""); print $0 "|" n}' | sort
}

print_record () {
  echo "# Design-floor SITE record - consumed by scripts/design-floor-baseline.sh (mn#28)."
  echo "#"
  echo "# One line per site: ITEM|FILE|NORMALIZED-DECLARATION|OCCURRENCES."
  echo "# Sites, not counts: a net count fails open (delete one shadow, add another, 9 stays 9)."
  echo "# Identity excludes line numbers on purpose - they churn without meaning."
  echo "#"
  echo "# A bare number is a STYLESHEET item. A 'C' prefix is a CANVAS site from TypeScript,"
  echo "# named for the floor item it serves (cc#237). The floor is a closed 29-item"
  echo "# enumeration and no class here invents a 30th:"
  echo "#   C3  .font assignments      -> item 3      C7  colour literals in TS -> item 7"
  echo "#   C25 nonzero shadowBlur     -> item 25     C0  fillStyle/strokeStyle/setLineDash"
  echo "#                                                 -> NO floor item. Recorded to be"
  echo "#                                                 visible; it cannot block."
  echo "#"
  echo "# Re-record with --record, which PRINTS. Paste it in yourself; the diff is the review."
  echo "#"
  echo "# NOT COVERED, human checks by number: 1 5 6 8 9 10 11 12 13 14 15 16 17 18 19 20"
  echo "# 21 22 23 24 27 28 29, plus item 3 for STYLESHEETS (its canvas half is class C3)."
  echo "# Item 23 is a runtime observation of the whole app and cannot be baselined from source."
  echo "#"
  echo "# INHERITED DEBT IS BASELINED, NOT ABSOLVED. Every line below is pre-existing debt"
  echo "# this repo already carried. Whether it is burned down or frozen is the owner's"
  echo "# ruling; recording it is what makes that question answerable with numbers."
  echo "#"
  echo "# MEASURED_ON: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "# SRC: $SRC"
  echo "#"
  echo "# WHAT WAS SCANNED. Stated, never implied - a gate blind to a surface reads exactly"
  echo "# like a gate that passed it, which is how cc#237 stood undetected."
  echo "#   stylesheets: $SCAN_SHEETS"
  echo "#   sources:     $SCAN_SOURCES"
  echo "#   found:       $(sheets | grep -c .) stylesheet file(s), $(sources | grep -c .) source file(s)"
  echo "#"
  collect
}

case "$MODE" in
  --record) print_record; exit 0 ;;
  --self-test)
    echo "SELF-TEST - can this recorder go RED?"
    tmp=$(mktemp -d); mkdir -p "$tmp/sheets"
    printf 'a{ box-shadow: 0 2px 4px rgba(0,0,0,.4); }\n' > "$tmp/sheets/a.scss"
    base=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -v '^#')
    nb=$(printf '%s\n' "$base" | grep -c .)
    echo "  [1] one-site fixture records $nb line(s) (want 2: the shadow and its rgba colour)"
    [ "$nb" -eq 2 ] || { echo "  FAIL"; rm -rf "$tmp"; exit 1; }
    # A zero-offset shadow is a GLOW, so this one fixture is deliberately worth THREE
    # sites: item 26 (the shadow), item 25 (the glow), item 7 (the hex literal). If
    # this number ever drops to 2, the item-25 glow detector has stopped firing —
    # which is the failure that would let an aura land unrecorded.
    printf 'b{ box-shadow: 0 0 12px #7C879C; }\n' > "$tmp/sheets/b.scss"
    after=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -v '^#')
    new=$(comm -13 <(printf '%s\n' "$base" | sort) <(printf '%s\n' "$after" | sort) | grep -c .)
    echo "  [2] adding a NEW glow site is detected: $new new (want 3: shadow + glow + colour)"
    [ "$new" -eq 3 ] || { echo "  FAIL - a new site did not register"; rm -rf "$tmp"; exit 1; }
    rm "$tmp/sheets/a.scss"
    gone=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -v '^#')
    van=$(comm -23 <(printf '%s\n' "$base" | sort) <(printf '%s\n' "$gone" | sort) | grep -c .)
    echo "  [3] a VANISHED recorded site is detected: $van vanished (want 2)"
    [ "$van" -eq 2 ] || { echo "  FAIL - a vanished site did not register"; rm -rf "$tmp"; exit 1; }
    # A MULTI-LINE declaration must survive as ONE site, not truncate to a bare
    # property name. 2 of command-center's 9 box-shadows are wrapped like this, and a
    # line-oriented grep collapsed both to the same identity.
    printf 'c{\n  box-shadow:\n    0 10px 28px -8px var(--accent-soft),\n    inset 0 -4px 10px rgba(0,0,0,.33);\n}\n' > "$tmp/sheets/c.scss"
    ml=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -c '^26|.*c\.scss|box-shadow: 0 10px 28px')
    echo "  [4] a MULTI-LINE declaration records whole: $ml (want 1, not a bare 'box-shadow:')"
    [ "$ml" -eq 1 ] || { echo "  FAIL - multi-line declaration truncated"; rm -rf "$tmp"; exit 1; }
    # A FOCUS RING is zero-offset with ZERO blur and must NOT be filed as an aura.
    # This is the discrimination that keeps the item-25 list readable; without it,
    # four of command-center's five item-25 hits were focus rings.
    printf 'd{ box-shadow: 0 0 0 2px var(--accent); }\ne{ box-shadow: 0 0 8px 1px var(--cold); }\n' > "$tmp/sheets/d.scss"
    out=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record)
    ring=$(printf '%s\n' "$out" | grep -c '^25|.*d\.scss|box-shadow: 0 0 0 2px')
    glow=$(printf '%s\n' "$out" | grep -c '^25|.*d\.scss|box-shadow: 0 0 8px')
    echo "  [5] focus ring NOT filed as an aura: $ring (want 0) | real glow IS: $glow (want 1)"
    [ "$ring" -eq 0 ] && [ "$glow" -eq 1 ] || { echo "  FAIL - glow/focus-ring discrimination"; rm -rf "$tmp"; exit 1; }
    # A COMMENT that merely MENTIONS a property is not a site. command-center's app.scss
    # discusses `transition:` in prose, and before this was stripped the whole paragraph
    # became a site — so editing unrelated prose flipped the gate red.
    rm -f "$tmp/sheets"/*.scss
    printf '/* we use a transition: here rather than a keyframe; box-shadow: is banned */\nf{ color: red; }\n' > "$tmp/sheets/f.scss"
    cmt=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -v '^#' | grep -c .)
    echo "  [6] a comment MENTIONING properties yields no sites: $cmt (want 0)"
    [ "$cmt" -eq 0 ] || { echo "  FAIL - comment text captured as a declaration"; rm -rf "$tmp"; exit 1; }
    # A hex-shaped CSS ID SELECTOR is not a colour (mn#31). `#dedbee` is simultaneously a
    # valid hex colour and a valid ID name, so this can only be settled by POSITION. Both
    # halves are pinned: the selector records nothing AND the real values still record.
    # `h{ color: #fff }` deliberately omits its final `;` — ordinary CSS, and the case
    # that made splitting on `}` necessary rather than optional.
    # `i:hover #dedbee` earns its place: it is the ONLY form here that needs the brace
    # strip. In every other form the selector precedes the declaration's first colon, so
    # the colon rule alone hides it — the fixture without this line stayed green with the
    # brace strip deleted, which made half the positional fix untested.
    rm -f "$tmp/sheets"/*.scss
    printf '#abc { color: var(--x); }\n#dedbee { padding: 4px; }\ni:hover #dedbee { padding: 4px; }\ng{ color: #0a0c0f; }\nh{ color: #fff }\n' > "$tmp/sheets/g.scss"
    out=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -v '^#')
    n7=$(printf '%s\n' "$out" | grep -c '^7|')
    bad=$(( $(printf '%s\n' "$out" | grep -c '^7|g.scss|#abc|') \
          + $(printf '%s\n' "$out" | grep -c '^7|g.scss|#dedbee|') ))
    echo "  [7] item-7 is POSITIONAL: $n7 colour site(s) (want 2) | ID-selector sites: $bad (want 0)"
    [ "$n7" -eq 2 ] && [ "$bad" -eq 0 ] || { echo "  FAIL - hex matched by shape, not position"; rm -rf "$tmp"; exit 1; }
    # THE OTHER DIRECTION, and it is the one that matters more. Making item 7 positional
    # must not buy precision with a blind spot: a hex handed to a MIXIN is hand-rolled at
    # a call site by any reading, and an earlier version of the fix dropped it. Pinned
    # beside a trailing SCSS `//` comment, which is not a call site and must not record.
    rm -f "$tmp/sheets"/*.scss
    printf '.card { @include card-shadow(#7C879C); }\n.b { color: #0a0c0f; }\n// old: #dedbee\n' > "$tmp/sheets/i.scss"
    out=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -v '^#')
    mix=$(printf '%s\n' "$out" | grep -c '^7|i.scss|#7C879C|')
    cm=$(printf '%s\n' "$out" | grep -c '#dedbee')
    echo "  [8] a mixin-arg hex still records: $mix (want 1) | an SCSS // comment does not: $cm (want 0)"
    [ "$mix" -eq 1 ] && [ "$cm" -eq 0 ] || { echo "  FAIL - precision was bought with a blind spot, or a line comment leaked"; rm -rf "$tmp"; exit 1; }
    # THE `}` SPLIT, pinned on its own. Without it a rule whose final `;` is omitted runs
    # into the NEXT rule and both become one site with a nonsense identity - the record
    # then cannot tell two shadows apart, which is the same failure the multi-line case
    # [4] exists to prevent, arriving from the other side.
    rm -f "$tmp/sheets"/*.scss
    printf 'j{ box-shadow: 0 2px 4px red } k{ box-shadow: 0 3px 9px blue }\n' > "$tmp/sheets/j.scss"
    out=$(DESIGN_FLOOR_SRC="$tmp/sheets" bash "$0" --record | grep -v '^#')
    runon=$(printf '%s\n' "$out" | grep -c '^26|')
    clean=$(printf '%s\n' "$out" | grep -c '^26|j.scss|box-shadow: 0 2px 4px red|')
    echo "  [9] rules with no trailing ';' stay APART: $runon shadow sites (want 2), first is clean: $clean (want 1)"
    [ "$runon" -eq 2 ] && [ "$clean" -eq 1 ] || { echo "  FAIL - two rules collapsed into one run-on site"; printf '%s\n' "$out"; rm -rf "$tmp"; exit 1; }

    # ---- canvas surfaces, from TypeScript (cc#237) ----------------------------------
    # One fixture, four assertions. Every negative in it is a real false-positive source:
    # a URL (whose `//` must not truncate the string and desync every literal after it),
    # prose that merely contains a hex word, a commented-out ink both ways, and
    # `.fontFamily`, which starts with `.font`.
    # The URL SHARES A STATEMENT with a real ink on purpose. With it on its own line, a
    # naive `s|//.*||` truncation only ate other negatives and this case stayed green
    # while the guard it exists to pin was deleted.
    mkdir -p "$tmp/canvas"
    cat > "$tmp/canvas/field.ts" <<'TS'
const HOLE_INK = '#8b92a8';
const THEME = { docs: 'https://example.com/x', rim: 'rgba(255, 255, 255, 0.2)' };
const PROSE = '#abcdef is the code';
const PLATE_FONT = '600 8.5px "Space Mono", monospace';
const MOVE = 'translateY(4px)';
const MONO_STACK = 'Space Mono, monospace';
// const DEAD = '#ff0000';
/* const ALSO_DEAD = '#00ff00'; */
export function draw(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = HOLE_INK; // was '#ff00ff'
  ctx.strokeStyle = '#0a0c0f';
  ctx.font = '600 10px Inter';
  ctx.font = PLATE_FONT;
  el.style.fontFamily = MONO_STACK;
  ctx.setLineDash([4, 6]);
  ctx.shadowBlur = 0;
  ctx.shadowBlur = 18;
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
  ctx.fillStyle = gr;
}
TS
    cv=$(DESIGN_FLOOR_SRC="$tmp/canvas" bash "$0" --record | grep -v '^#')
    c7=$(printf '%s\n' "$cv" | grep -c '^C7|')
    echo "  [10] canvas COLOUR literals record: $c7 (want 3 - two consts and one inline)"
    [ "$c7" -eq 3 ] || { echo "  FAIL - a URL, prose, or a commented-out ink leaked in, or a real ink was missed"; printf '%s\n' "$cv"; rm -rf "$tmp"; exit 1; }
    # Both halves of C3, and the FONT SIZE must be in the record. An assignment-only
    # detector recorded `font = PLATE_FONT` and never moved when 8.5px changed — the
    # regression a reviewer is hunting was invisible. `translateY(4px)` is the negative
    # that keeps the shorthand pattern from meaning "any string with px in it", and
    # `.fontFamily = MONO_STACK` is the negative that keeps `.font` bounded - with a
    # STRING value it could not leak through the reference branch at all, so the fixture
    # was pinning nothing there.
    c3=$(printf '%s\n' "$cv" | grep -c '^C3|')
    size=$(printf '%s\n' "$cv" | grep -c '8.5px')
    ff=$(printf '%s\n' "$cv" | grep -c 'fontFamily')
    mv=$(printf '%s\n' "$cv" | grep -c 'translateY')
    echo "  [11] canvas TYPE records: $c3 (want 3) | the 8.5px SIZE is in the record: $size (want 1)"
    echo "       .fontFamily is not a canvas font: $ff (want 0) | translateY is not type: $mv (want 0)"
    [ "$c3" -eq 3 ] && [ "$size" -eq 1 ] && [ "$ff" -eq 0 ] && [ "$mv" -eq 0 ] || { echo "  FAIL - canvas font detection"; printf '%s\n' "$cv"; rm -rf "$tmp"; exit 1; }
    # The canvas twin of case [5], plus the mechanism that actually ships. `shadowBlur = 0`
    # is the RESET every draw call makes; filing it as an aura would bury the real glows.
    # `createRadialGradient` is here because command-center contains ZERO `shadowBlur` and
    # TWO radial coronas — a shadowBlur-only detector was green on the one canvas this
    # whole class of work exists for.
    c25=$(printf '%s\n' "$cv" | grep -c '^C25|')
    rad=$(printf '%s\n' "$cv" | grep -c 'createRadialGradient')
    zero=$(printf '%s\n' "$cv" | grep -c 'shadowBlur = 0')
    echo "  [12] canvas AURA records: $c25 (want 2 - a blur and a radial), radial seen: $rad (want 1)"
    echo "       a shadowBlur RESET is not an aura: $zero (want 0)"
    [ "$c25" -eq 2 ] && [ "$rad" -eq 1 ] && [ "$zero" -eq 0 ] || { echo "  FAIL - aura detection or reset discrimination"; printf '%s\n' "$cv"; rm -rf "$tmp"; exit 1; }
    c0=$(printf '%s\n' "$cv" | grep -c '^C0|')
    echo "  [13] canvas PAINT sites record: $c0 (want 4 - two fillStyle, strokeStyle, setLineDash)"
    [ "$c0" -eq 4 ] || { echo "  FAIL - paint sites"; printf '%s\n' "$cv"; rm -rf "$tmp"; exit 1; }
    # THE DECLARED SCOPE IS ITSELF PINNED. The header prints what was scanned; without a
    # control, that print is a claim nothing checks — and an over-narrow scan reporting
    # green is the whole of cc#237. `.tsx` is IN because a canvas can live in one;
    # `.spec.ts` and `.d.ts` are OUT because a test renders nothing and a declaration
    # holds no values.
    mkdir -p "$tmp/scope"
    printf "const A = '#111111';\n" > "$tmp/scope/widget.tsx"
    printf "const B = '#222222';\n" > "$tmp/scope/widget.spec.ts"
    printf "const C = '#333333';\n" > "$tmp/scope/widget.d.ts"
    sc=$(DESIGN_FLOOR_SRC="$tmp/scope" bash "$0" --record | grep -v '^#')
    stsx=$(printf '%s\n' "$sc" | grep -c 'widget.tsx')
    sout=$(( $(printf '%s\n' "$sc" | grep -c 'widget.spec.ts') \
           + $(printf '%s\n' "$sc" | grep -c 'widget.d.ts') ))
    echo "  [14] scope is as printed: .tsx scanned: $stsx (want 1) | .spec/.d.ts skipped: $sout (want 0)"
    [ "$stsx" -eq 1 ] && [ "$sout" -eq 0 ] || { echo "  FAIL - scanned set differs from the set the header prints"; rm -rf "$tmp"; exit 1; }
    # THE CANVAS HALF MUST GO RED ON ITS OWN. Cases [2] and [3] prove the stylesheet half
    # can; that proves nothing about a scan that did not exist when they were written, and
    # a green report from a detector that never fires is the entire content of cc#237.
    printf "const NEW_AURA = '#ff0000';\nctx.shadowBlur = 24;\n" > "$tmp/canvas/new.ts"
    grew=$(DESIGN_FLOOR_SRC="$tmp/canvas" bash "$0" --record | grep -v '^#')
    cnew=$(comm -13 <(printf '%s\n' "$cv" | sort) <(printf '%s\n' "$grew" | sort) | grep -c .)
    echo "  [15] a NEW canvas site is detected: $cnew new (want 2 - the ink and the glow)"
    [ "$cnew" -eq 2 ] || { echo "  FAIL - the canvas scan cannot go RED"; rm -rf "$tmp"; exit 1; }
    rm -rf "$tmp"
    echo "SELF-TEST PASSED - 15 controls: new, vanished, glow, multi-line, focus-ring, comment,"
    echo "                   positional hex, canvas ink/type/glow/paint, scope, and a canvas RED."
    exit 0 ;;
  ""|--compare) ;;
  *) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac

[ -f "$RECORD" ] || { echo "No record at $RECORD. Create it with --record (it prints; you paste)."; exit 2; }
cur=$(collect)
rec=$(grep -v '^#' "$RECORD" | grep -v '^[[:space:]]*$')
newsites=$(comm -13 <(printf '%s\n' "$rec" | sort) <(printf '%s\n' "$cur" | sort))
vanished=$(comm -23 <(printf '%s\n' "$rec" | sort) <(printf '%s\n' "$cur" | sort))
n=$(printf '%s\n' "$newsites" | grep -c .)
v=$(printf '%s\n' "$vanished" | grep -c .)
if [ "$n" -gt 0 ]; then
  echo "NEW design-floor sites this slice introduced ($n):"
  printf '%s\n' "$newsites" | sed 's/^/  + /'
fi
if [ "$v" -gt 0 ]; then
  echo "RECORDED sites that VANISHED ($v) - the record no longer describes this repo:"
  printf '%s\n' "$vanished" | sed 's/^/  - /'
fi
if [ "$n" -eq 0 ] && [ "$v" -eq 0 ]; then
  echo "OK - no new design-floor sites against $RECORD."
  echo "     Inherited debt is baselined, NOT absolved: see the record's header."
  exit 0
fi
echo
echo "Re-record only when the change is deliberate: --record prints, you paste, the diff is the review."
exit 1
