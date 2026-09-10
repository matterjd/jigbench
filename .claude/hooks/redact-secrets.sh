#!/bin/bash
# Canonical secret-redaction filter (stdin -> stdout). SINGLE SOURCE OF TRUTH for the secret
# shapes the delegation work log must never expose. Used by:
#   * worklog-append.sh — redacts detail before writing worklog.md (on write).
#   * worklog-render.sh  — redacts blocked.log lines before printing (the raw ledger is
#                          unredacted on disk, but the rendered artifact is what humans copy).
# Best-effort by design: pattern-matching, not a guarantee. Redacts PEM keys, URL-embedded
# credentials, Bearer tokens (any non-whitespace token), key=value secrets, AWS/GitHub keys,
# and long hex/base64 blobs (including the release hash).
sed -E \
  -e 's/-----BEGIN[^-]*PRIVATE KEY-----.*/[REDACTED-KEY]/g' \
  -e 's#://[^:@/[:space:]]+:[^@/[:space:]]+@#://[REDACTED]@#g' \
  -e 's/([Bb]earer)[[:space:]]+[^[:space:]]+/\1 [REDACTED]/g' \
  -e 's/(([Aa]uthorization|[Tt]oken|[Ss]ecret|[Pp]assword|[Aa]pi[_-]?key|release[_-]?hash|release[_-]?token)[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1[REDACTED]/g' \
  -e 's/AKIA[0-9A-Z]{16}/[REDACTED-AWS]/g' \
  -e 's/gh[pousr]_[A-Za-z0-9]{20,}/[REDACTED-GH]/g' \
  -e 's/[A-Fa-f0-9]{40,}/[REDACTED-HEX]/g' \
  -e 's#[A-Za-z0-9+/]{60,}={0,2}#[REDACTED-B64]#g'
