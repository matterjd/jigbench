#!/bin/bash
# copilot-review.sh — mechanics for the pr-review-cycle skill.
# Subcommands (all take <repo> as owner/name, e.g. owner/example-repo — keep this
# example GENERIC: the kit vendors this file into repos whose own content guards
# scan non-prose files for specific repo names, and a comment is not an exemption):
#   request <repo> <pr>            Request a Copilot code review; prints head sha + request time (UTC).
#   poll    <repo> <pr> <since>    Wait for a Copilot review submitted at/after <since> (ISO-8601 UTC).
#                                  Exits 0 when one lands (prints REVIEW_READY state=<S>), 1 on timeout.
#                                  Meant to be run in the BACKGROUND by the skill.
#   comments <repo> <pr> [since]   Latest Copilot review state + its inline comments (since = only reviews
#                                  at/after this ISO time count as "latest").
#   pending <repo> <pr>            Is Copilot still a queued requested reviewer? (tells slow vs consumed-no-review)
#   checks  <repo> <pr>            CI rollup + mergeable/mergeStateStatus/isDraft.
# Requires: gh (authenticated). All JSON filtering runs inside `gh api --jq` (no standalone jq).
# The Copilot reviewer is requested as "Copilot"; its posted review author login matches /copilot/i.
set -u
cmd="${1:-}"; repo="${2:-}"; pr="${3:-}"
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Latest Copilot review state at/after $1 (empty if none). $1 defaults to epoch so "any".
copilot_latest_state() {
  SINCE="${1:-1970-01-01T00:00:00Z}" gh api "repos/$repo/pulls/$pr/reviews" --paginate \
    --jq '[.[] | select(.user.login|test("copilot";"i")) | select(.submitted_at >= env.SINCE)]
          | sort_by(.submitted_at) | last | .state // empty' 2>/dev/null
}

case "$cmd" in
  request)
    [ -n "$repo" ] && [ -n "$pr" ] || { echo "usage: request <repo> <pr>" >&2; exit 2; }
    sha=$(gh api "repos/$repo/pulls/$pr" --jq '.head.sha' 2>/dev/null)
    ts=$(now_iso)
    if gh api --method POST "repos/$repo/pulls/$pr/requested_reviewers" -f 'reviewers[]=Copilot' >/dev/null 2>&1; then
      echo "REQUESTED repo=$repo pr=$pr head=$sha since=$ts"
    else
      echo "REQUEST_FAILED repo=$repo pr=$pr — could not request Copilot (permissions / not enabled). Ask the human to request it in the PR UI. since=$ts" >&2
      echo "REQUEST_FAILED since=$ts"; exit 1
    fi
    ;;
  poll)
    since="${4:-}"
    [ -n "$repo" ] && [ -n "$pr" ] && [ -n "$since" ] || { echo "usage: poll <repo> <pr> <since-iso>" >&2; exit 2; }
    for i in $(seq 1 40); do   # ~30 min ceiling at 45s
      state=$(copilot_latest_state "$since")
      if [ -n "$state" ]; then echo "REVIEW_READY state=$state after=$i checks"; exit 0; fi
      sleep 45
    done
    echo "POLL_TIMEOUT after 40 checks (~30min)"; exit 1
    ;;
  comments)
    since="${4:-1970-01-01T00:00:00Z}"
    [ -n "$repo" ] && [ -n "$pr" ] || { echo "usage: comments <repo> <pr> [since]" >&2; exit 2; }
    echo "=== latest Copilot review (since $since) ==="
    SINCE="$since" gh api "repos/$repo/pulls/$pr/reviews" --paginate \
      --jq '[.[] | select(.user.login|test("copilot";"i")) | select(.submitted_at >= env.SINCE)]
            | sort_by(.submitted_at) | last
            | if . == null then "none yet" else "state="+(.state//"?")+"  submitted="+(.submitted_at//"?")+"  commit="+((.commit_id//"?")[0:7]) end' 2>/dev/null
    echo "=== inline comments at/after $since (path:line — body) ==="
    SINCE="$since" gh api "repos/$repo/pulls/$pr/comments" --paginate \
      --jq '.[] | select((.user.login|test("copilot";"i")) and (.created_at >= env.SINCE))
            | "["+.path+":"+((.line//.original_line)|tostring)+"] "+(.body|gsub("\n";" "))' 2>/dev/null
    ;;
  pending)
    # Is Copilot still a QUEUED requested reviewer? Used on POLL_TIMEOUT to tell "slow review"
    # from "the request was consumed without producing a review" (already-reviewed/draft PR).
    [ -n "$repo" ] && [ -n "$pr" ] || { echo "usage: pending <repo> <pr>" >&2; exit 2; }
    n=$(gh api "repos/$repo/pulls/$pr/requested_reviewers" \
      --jq '[.users[]?.login | select(test("copilot";"i"))] | length' 2>/dev/null)
    if [ "${n:-0}" -gt 0 ]; then
      echo "COPILOT_PENDING — review still queued; re-poll."
    else
      echo "COPILOT_NOT_PENDING — no queued Copilot review. If none posted since your request, it was consumed without a review (already-reviewed/draft PR): mark the PR ready (gh pr ready) or use the UI 'Re-request review'."
    fi
    ;;
  checks)
    [ -n "$repo" ] && [ -n "$pr" ] || { echo "usage: checks <repo> <pr>" >&2; exit 2; }
    gh pr view "$pr" --repo "$repo" \
      --json isDraft,mergeable,mergeStateStatus,statusCheckRollup \
      --jq '"draft="+(.isDraft|tostring)+"  mergeable="+(.mergeable//"?")+"  merge="+(.mergeStateStatus//"?")+"  checks="+([.statusCheckRollup[]?|.conclusion]|join(","))'
    ;;
  *)
    echo "usage: copilot-review.sh {request|poll|comments|pending|checks} <repo> <pr> [since]" >&2; exit 2;;
esac
