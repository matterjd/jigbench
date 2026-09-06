#!/usr/bin/env bash
# scripts/check-dco.sh
#
# DCO check (F17 / CONTRIBUTING.md "Sign off your commits"): every commit in a pull request
# must carry a `Signed-off-by: Name <email>` trailer (`git commit -s`). No CLA, and no
# external GitHub App — a small script over `git log`, run by .github/workflows/ci.yml's
# `dco` job (pull_request events only) and runnable locally the same way, against any two
# refs.
#
# Usage: scripts/check-dco.sh <base-ref> <head-ref>
#   bash scripts/check-dco.sh origin/main HEAD
#   bash scripts/check-dco.sh <base-sha> <head-sha>   (what ci.yml actually passes)

set -euo pipefail

BASE="${1:?usage: check-dco.sh <base-ref> <head-ref>}"
HEAD_REF="${2:?usage: check-dco.sh <base-ref> <head-ref>}"

COMMITS="$(git rev-list "$BASE..$HEAD_REF")"
if [ -z "$COMMITS" ]; then
  echo "OK: no commits between $BASE and $HEAD_REF"
  exit 0
fi

FAIL=0
while IFS= read -r sha; do
  subject="$(git log -1 --format=%s "$sha")"
  if git log -1 --format=%B "$sha" | grep -qE '^Signed-off-by: .+ <.+@.+>$'; then
    echo "OK    $sha $subject"
  else
    echo "FAIL  $sha $subject -- missing a 'Signed-off-by:' trailer (git commit -s)"
    FAIL=1
  fi
done <<<"$COMMITS"

if [ "$FAIL" -ne 0 ]; then
  echo "FAIL: one or more commits between $BASE and $HEAD_REF are missing a DCO sign-off." >&2
  echo "Fix: 'git commit --amend -s' for the last commit, or an interactive rebase adding -s to each, then force-push the PR branch." >&2
  exit 1
fi
echo "PASS: every commit between $BASE and $HEAD_REF carries a DCO sign-off"
