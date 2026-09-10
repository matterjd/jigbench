#!/bin/bash
# Regression harness for the delegation guards. Run from anywhere:
#   bash .claude/hooks/tests/verify-guards.sh
# Exits 0 iff every case passes; non-zero (with a FAIL list) otherwise. Read-only to the
# real repo — all state lives in throwaway temp git repos used as $CLAUDE_PROJECT_DIR.
#
# Multi-lock era: locks live as per-delegation files in config/delegation-locks/<id>.yml
# (activate-lock.sh writes them; release-lock.sh <id> <token> deletes them). The legacy
# single-file helpers (lock/lockx/locko) now stage a single lock file named verify.yml so
# every pre-multi-lock case keeps its original signature and meaning.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
HOOKS=$(cd "$HERE/.." && pwd)
HOOKB="$HOOKS/delegation-guard-bash.sh"
HOOKW="$HOOKS/delegation-guard-write.sh"
REL="$HOOKS/release-lock.sh"
ACT="$HOOKS/activate-lock.sh"
PF="$HOOKS/preflight-check.sh"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "PASS  $1"; }
no(){ FAIL=$((FAIL+1)); echo "FAIL  $1  ($2)"; }

# NOTE (Windows/Git Bash): temp paths are converted to Windows-mixed form (cygpath -m)
# BEFORE they are baked into lock-file CONTENT. MSYS converts /tmp-style paths in argv and
# env when spawning native node, but never inside file contents — mixing the two forms
# makes zone comparisons silently fail. Production lock files always carry real Windows
# paths (activate-lock.sh writes them), so this is purely a harness concern.
winpath(){ if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
TR=$(winpath "$(mktemp -d)")/proj
mkdir -p "$TR/config/delegation-locks" "$TR/.claude/hooks" "$TR/notes"
( cd "$TR" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && echo seed > notes/seed.md && git add notes/seed.md && git commit -qm seed && git branch feature )
export CLAUDE_PROJECT_DIR="$TR"
LOCKS="$TR/config/delegation-locks"
# The guards + activate-lock call the worklog helper by ROOT-relative path — it (and the
# redaction filter it pipes through) must exist under the temp control root.
HOOKSRC=$(cd "$HERE/.." && pwd)
cp "$HOOKSRC/worklog-append.sh" "$HOOKSRC/redact-secrets.sh" "$TR/.claude/hooks/" 2>/dev/null || true

# Second, distinct repo used as a cross-repo delegation TARGET (work_repo_path).
# The control plane stays in $TR; writes are only permitted inside $TR2.
TR2=$(winpath "$(mktemp -d)")/target
mkdir -p "$TR2/sub"
( cd "$TR2" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && echo seed > sub/seed.md && git add sub/seed.md && git commit -qm seed && git branch feature \
  && git remote add origin https://github.com/rig/target.git )
# Third repo: the CONCURRENT second delegation's work zone (multi-lock section).
TR3=$(winpath "$(mktemp -d)")/target3
mkdir -p "$TR3/sub"
( cd "$TR3" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && echo seed > sub/seed.md && git add sub/seed.md && git commit -qm seed && git branch feature \
  && git remote add origin https://github.com/rig/target3.git )
# Pass 7 (mn#47): activation refuses a cross-repo zone that is missing or unregistered.
# The fixture registry mirrors config/workspace.yml `repos:` — TR2 and TR3 are the
# registered siblings of this throwaway control root.
printf 'repos:\n  - name: "target"\n    path: "%s"\n  - name: "target3"\n    path: "%s"\n' "$TR2" "$TR3" > "$TR/config/workspace.yml"

clearlocks(){ rm -f "$LOCKS"/*.yml 2>/dev/null; }
mklock(){ # <id> <active> <tier> <work_repo_path> <owner_session> <expiry> <release_hash>
  printf 'active: %s\nschema: 2\ndelegation_id: "%s"\ntier: "%s"\nrepo_path: "%s"\nwork_repo_path: "%s"\nwork_branch: ""\nexpiry: "%s"\nowner_session: "%s"\nrelease_hash: "%s"\n' \
    "$2" "$1" "$3" "$TR" "$4" "$6" "$5" "$7" > "$LOCKS/$1.yml"; }

# Legacy single-lock helpers — original signatures preserved for the pre-multi-lock cases.
lock(){  clearlocks; mklock verify "$1" "$2" ""   ""   "" "${3:-}"; }   # active tier [hash]
lockx(){ clearlocks; mklock verify "$1" "$2" "$3" ""   "" "${4:-}"; }   # active tier work [hash]
locko(){ clearlocks; mklock verify "$1" "$2" "$3" "$4" "" "";        }  # active tier work owner

jf(){ node -e 'process.stdout.write(JSON.stringify({tool_input:{file_path:process.argv[1]}}))' "$1"; }
jc(){ node -e 'process.stdout.write(JSON.stringify({tool_input:{command:process.argv[1]}}))' "$1"; }
sha(){ node -e 'process.stdout.write(require("crypto").createHash("sha256").update(String(process.argv[1])).digest("hex"))' "$1"; }
expw(){ local a="$1" t="$2" f="$3" want="$4" label="$5"; lock "$a" "$t"; jf "$f" | bash "$HOOKW" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "write want=$want"; }
expb(){ local a="$1" t="$2" c="$3" want="$4" label="$5"; lock "$a" "$t"; jc "$c" | bash "$HOOKB" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "bash want=$want"; }
expwx(){ local a="$1" t="$2" wrp="$3" f="$4" want="$5" label="$6"; lockx "$a" "$t" "$wrp"; jf "$f" | bash "$HOOKW" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "write want=$want"; }
expbx(){ local a="$1" t="$2" wrp="$3" c="$4" want="$5" label="$6"; lockx "$a" "$t" "$wrp"; jc "$c" | bash "$HOOKB" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "bash want=$want"; }
expwo(){ local a="$1" t="$2" wrp="$3" owner="$4" sid="$5" f="$6" want="$7" label="$8"; locko "$a" "$t" "$wrp" "$owner"; jf "$f" | CLAUDE_CODE_SESSION_ID="$sid" bash "$HOOKW" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "write want=$want"; }
expbo(){ local a="$1" t="$2" wrp="$3" owner="$4" sid="$5" c="$6" want="$7" label="$8"; locko "$a" "$t" "$wrp" "$owner"; jc "$c" | CLAUDE_CODE_SESSION_ID="$sid" bash "$HOOKB" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "bash want=$want"; }
# Multi-lock variants: locks are staged explicitly by the section (no reset per case).
expwm(){ local sid="$1" f="$2" want="$3" label="$4"; jf "$f" | CLAUDE_CODE_SESSION_ID="$sid" bash "$HOOKW" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "write want=$want"; }
expbm(){ local sid="$1" c="$2" want="$3" label="$4"; jc "$c" | CLAUDE_CODE_SESSION_ID="$sid" bash "$HOOKB" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "bash want=$want"; }
# Pass 7 variants: the hook JSON carries a cwd, as the real event does.
jfc(){ node -e 'process.stdout.write(JSON.stringify({cwd:process.argv[2],tool_input:{file_path:process.argv[1]}}))' "$1" "$2"; }
jcc(){ node -e 'process.stdout.write(JSON.stringify({cwd:process.argv[2],tool_input:{command:process.argv[1]}}))' "$1" "$2"; }
expwmc(){ local sid="$1" f="$2" cwd="$3" want="$4" label="$5"; jfc "$f" "$cwd" | CLAUDE_CODE_SESSION_ID="$sid" bash "$HOOKW" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "write want=$want"; }
expbmc(){ local sid="$1" c="$2" cwd="$3" want="$4" label="$5"; jcc "$c" "$cwd" | CLAUDE_CODE_SESSION_ID="$sid" bash "$HOOKB" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "bash want=$want"; }

echo "── WRITE guard ──"
expw true T1 "$TR/notes/x.md"                     0 "T1 inside-repo write allowed"
expw true T1 "$TR/../escape.md"                    2 "dot-dot escape blocked"
expw true T1 "C:/Windows/system32/z"              2 "absolute outside blocked"
expw true T1 "$TR/config/delegation-active.yml"    2 "control: legacy lock path"
expw true T1 "$LOCKS/verify.yml"                   2 "control: lock dir"
expw true T1 "$TR/.claude/hooks/x.sh"              2 "control: hooks dir"
expw true T1 "$TR/.claude/settings.json"           2 "control: settings"
expw true T1 "$TR/SUBAGENT-AUTHORIZATION.md"       2 "control: grant"
expw true T4 "$TR/notes/x.md"                      2 "T4 read-only"
expw false T1 "$TR/notes/x.md"                     0 "inactive -> allowed"
clearlocks; jf "$TR/notes/x.md" | bash "$HOOKW" >/dev/null 2>&1; [ "$?" = 0 ] && ok "no lock files -> allowed (fast path)" || no "no lock files fast path" "want 0"
lock true T1; echo 'not-json{{' | bash "$HOOKW" >/dev/null 2>&1; [ "$?" = 2 ] && ok "write fail-closed on bad JSON" || no "write fail-closed" "want 2"

echo "── BASH guard ──"
( cd "$TR" && git checkout -q main )
expb true T1 "git commit -m x"          2 "commit on main blocked"
( cd "$TR" && git checkout -q feature )
expb true T1 "git commit -m x"          0 "commit on feature allowed"
expb true T1 "git push origin main"     2 "push-to-main blocked"
expb true T3 "git push origin feature"  2 "T3 push blocked"
expb true T3 "git worktree add ../wt"   2 "T3 worktree blocked"
expb true T2 "gh pr create"             2 "T2 PR blocked"
expb true T4 "gh issue create --title x --body y" 2 "T4 issue-create blocked (read-only tier)"
expb true T3 "gh issue create --title x --body y" 0 "T3 issue-create allowed (SUBAGENT-AUTHORIZATION §3 row)"
expb true T4 "gh issue list --label debt" 0 "T4 issue list still allowed (a read is not a create)"
expbx true T1 "$TR2" "gh issue create -R rig/target --title x" 0 "issue-create -R matching work-repo tracker allowed"
expbx true T1 "$TR2" "gh issue create -R other/elsewhere --title x" 2 "issue-create cross-repo -R blocked (work-repo tracker only)"
expbx true T1 "$TR2" "gh issue create --repo=other/elsewhere --title x" 2 "issue-create --repo= cross-repo blocked"
expb true T1 'GH_REPO=other/o gh issue create --title x' 2 "issue-create under GH_REPO override blocked (unresolvable target)"
expb true T1 'gh issue create -R $TARGET_REPO --title x' 2 "issue-create -R variable target blocked (fail closed)"
expb true T1 'cd /somewhere && gh issue create --title x' 2 "bare issue-create with cd blocked (ambiguous cwd; use -R <work-repo>)"
expb true T1 "echo x > config/delegation-active.yml" 2 "control: shell write to legacy lock path"
expb true T1 "sed -i s/a/b/ .claude/hooks/delegation-guard-bash.sh" 2 "control: sed -i a hook"
expb true T1 "cat config/delegation-active.yml"      0 "reading the legacy lock path allowed"
expb true T1 "git status"               0 "git status allowed"
expb false T1 "git push origin main"    0 "inactive -> brain unaffected"

echo "── git GLOBAL-OPTION bypass (issue #3 follow-up: -C / -c / --git-dir must not evade HARD RULES) ──"
( cd "$TR" && git checkout -q main )
expb true T1 "git -C $TR commit -m x"                   2 "git -C commit on main blocked"
expb true T1 "git -c user.name=x commit -m x"           2 "git -c commit on main blocked"
( cd "$TR" && git checkout -q feature )
expb true T1 "git -C $TR push origin main"              2 "git -C push-to-main blocked (HARD RULE)"
expb true T1 "git --git-dir=$TR/.git push origin main"  2 "git --git-dir push-to-main blocked (HARD RULE)"
expb true T3 "git -C $TR push origin feature"           2 "git -C T3 push blocked"
expb true T3 "git -C $TR worktree add ../wt"            2 "git -C T3 worktree blocked"
expb true T4 "git -C $TR commit -m x"                   2 "git -C T4 commit blocked"
expb true T1 "git -C $TR status"                        0 "git -C status still allowed (no over-block)"

echo "── TARGET-BASED control plane (mention is not a write; only real write TARGETS block) ──"
expb true T1 'grep -n "control-plane\|CTRL\|tee\|redirect" .claude/hooks/delegation-guard-bash.sh | head' 0 "incident: tee/redirect inside quoted grep pattern allowed"
expb true T1 'git show HEAD:.claude/hooks/tests/verify-guards.sh | grep -A 5 "dash.*arrow\|->"'           0 "incident: quoted -> prose arrow allowed"
expb true T1 'bash .claude/hooks/worklog-append.sh verify lock-set "tier T3" 2>&1 | tail -1'              0 "bookkeeping via hooks script allowed (no write target)"
expb true T1 "$(printf '%s\n' 'EXP=$(cat /tmp/e.txt)' 'bash .claude/hooks/worklog-append.sh d lock-set "x" 2>&1 | tail -1' 'rm -f /tmp/e.txt')" 0 "incident: compound bookkeeping (subst + rm /tmp) allowed"
expb true T1 'gh issue create --body "see .claude/hooks/ and printf >> config/delegation-active.yml"'     0 "worker: control mention + quoted >> in issue body allowed"
expbo true T1 "$TR2" W1 P9 'gh issue create --body "guards at .claude/hooks/ broke printf >> config/delegation-active.yml"' 0 "peer: control mention + quoted >> in issue body allowed"
expb true T1 "cat config/delegation-locks/verify.yml 2>/dev/null"   0 "stderr-to-null near lock mention allowed"
expb true T1 "sed -i 's/tee//' notes/seed.md"                       0 "sed -i on a normal file allowed (write word in script text irrelevant)"
expb true T1 "echo x > config/delegation-locks/evil.yml"            2 "redirect target in lock dir blocked"
expb true T1 "somecmd 2> .claude/settings.local.json"               2 "stderr redirect TARGETING control blocked"
expb true T1 "cat x | tee .claude/settings.json"                    2 "tee onto settings blocked"
expb true T1 "cp payload.sh .claude/hooks/guard.sh"                 2 "cp into hooks dir blocked"
expb true T1 "mv payload .claude/hooks"                             2 "mv onto hooks dir blocked"
expb true T1 "rm config/delegation-locks/verify.yml"                2 "rm of a lock file blocked"
expb true T1 "dd if=/dev/zero of=.claude/settings.json"             2 "dd of= settings blocked"
expb true T1 "truncate -s 0 .claude/settings.json"                  2 "truncate settings blocked"
expb true T1 "bash -c 'echo x > .claude/settings.json'"             2 "bash -c literal write to control blocked (recursed)"
expb true T1 'echo "unbalanced > .claude/hooks/x.sh'                2 "ambiguous + control mention + write token -> fallback blocks"
expb true T1 'echo "unbalanced > /tmp/x'                            0 "ambiguous, no control mention -> allowed"

echo "── NONCE-GATED release (by delegation id; lock file is DELETED on release) ──"
H=$(sha "s3cret")
clearlocks; mklock verify true T3 "" "" "" "$H"
bash "$REL" verify >/dev/null 2>&1;         [ -f "$LOCKS/verify.yml" ] && ok "no-token release refused (lock intact)" || no "no-token release" "lock gone"
bash "$REL" verify "wrong" >/dev/null 2>&1; [ -f "$LOCKS/verify.yml" ] && ok "wrong-token release refused" || no "wrong-token release" "lock gone"
bash "$REL" "s3cret" >/dev/null 2>&1;       [ -f "$LOCKS/verify.yml" ] && ok "id-less (legacy single-arg) release refused" || no "id-less release" "lock gone"
bash "$REL" verify "s3cret" >/dev/null 2>&1; [ ! -f "$LOCKS/verify.yml" ] && ok "correct id+token release deletes the lock" || no "correct release" "lock still present"
bash "$REL" verify "s3cret" >/dev/null 2>&1; [ "$?" = 0 ] && ok "re-release of a gone lock is idempotent (exit 0)" || no "idempotent release" "nonzero"

echo "── CROSS-REPO (work_repo_path = a registered sibling; control plane stays in \$TR) ──"
# WRITE guard: writes allowed inside the TARGET repo, nowhere else.
expwx true T1 "$TR2" "$TR2/sub/x.md"                     0 "xrepo: write inside target allowed"
expwx true T1 "$TR2" "$TR2/deep/nested/x.md"             0 "xrepo: nested write inside target allowed"
expwx true T1 "$TR2" "$TR/notes/y.md"                    2 "xrepo: write into CONTROL repo blocked (outside target)"
expwx true T1 "$TR2" "$TR/config/delegation-active.yml"  2 "xrepo: legacy lock path still protected"
expwx true T1 "$TR2" "$LOCKS/verify.yml"                 2 "xrepo: lock dir still protected"
expwx true T1 "$TR2" "$TR/.claude/hooks/x.sh"            2 "xrepo: control hooks still protected"
expwx true T1 "$TR2" "$TR/SUBAGENT-AUTHORIZATION.md"     2 "xrepo: control grant still protected"
expwx true T1 "$TR2" "C:/Windows/system32/z"            2 "xrepo: unrelated absolute path blocked"
expwx true T1 "$TR2" "$TR2/../escape.md"                 2 "xrepo: dot-dot escape from target blocked"
expwx true T4 "$TR2" "$TR2/sub/x.md"                     2 "xrepo: T4 read-only in target"
# BASH guard: branch/commit checks bind to the TARGET repo, not the control repo.
# (control repo $TR is on 'feature' here; the target's branch is what must govern.)
( cd "$TR2" && git checkout -q main )
expbx true T1 "$TR2" "git commit -m x"                   2 "xrepo: commit on target's main blocked"
( cd "$TR2" && git checkout -q feature )
expbx true T1 "$TR2" "git commit -m x"                   0 "xrepo: commit on target's feature allowed"
expbx true T3 "$TR2" "git push origin feature"           2 "xrepo: T3 push still blocked"
expbx true T1 "$TR2" "rm -rf $TR2"                       2 "xrepo: deleting the target repo blocked"
expbx true T1 "$TR2" "rm -rf $TR"                        2 "xrepo: deleting the control repo blocked"
# same-repo back-compat: blank work_repo_path behaves exactly like $CLAUDE_PROJECT_DIR
expwx true T1 "" "$TR/notes/x.md"                        0 "back-compat: blank work_repo_path -> control repo writable"
expwx true T1 "" "$TR2/sub/x.md"                         2 "back-compat: blank work_repo_path -> sibling blocked"

echo "── DESTRUCTION rule is TARGET-based, not mention-based (maint pass 3 / roadmap P2.5) ──"
# The false positives. Each shape below cost a real session: 2026-07-06 budget-automation,
# 2026-07-21 wisp ("rm -rf dist && npx expo export"), 2026-08-01 command-center (a fixture
# dir the worker had itself created). All three were refused because the command string
# merely MENTIONED the repo root, though the delete TARGET was a subpath.
expbx true T1 "$TR2" "cd $TR2 && rm -rf dist && npx expo export --platform web" 0 "destr: build dir after cd into the work repo allowed"
expbx true T1 "$TR2" "rm -rf $TR2/cc73-fixture-nested-root" 0 "destr: absolute SUBPATH of the work repo allowed"
expbx true T1 "$TR2" "rm -rf node_modules"               0 "destr: plain relative build dir allowed"
expbx true T1 "$TR2" "mv $TR2/sub $TR2/sub2"             0 "destr: mv WITHIN the work repo allowed"
expbx true T1 "$TR2" "grep -rn 'rm -rf' $TR2/sub"        0 "destr: mentioning rm -rf inside a grep is not a delete"
# The true positives. Better targeting must not cost ONE of these.
expbx true T1 "$TR2" "rm -rf $TR2/"                      2 "destr: repo root with a trailing slash still blocked"
expbx true T1 "$TR2" "rm -rf $TR2/sub/.."                2 "destr: dot-dot climb back to the root blocked"
expbx true T1 "$TR2" "cd $TR2 && rm -rf ."               2 "destr: bare . fails closed (cwd is unknowable here)"
expbx true T1 "$TR2" "rm -rf ../elsewhere"               2 "destr: any relative climb fails closed"
expbx true T1 "$TR2" "rm -rf $(basename "$TR2")"         2 "destr: bare name matching a repo basename fails closed"
expbx true T1 "$TR2" "rm -rf \$WORKREPO"                 2 "destr: \$VAR target fails closed (stricter than control-plane writes)"
expbx true T1 "$TR2" "rm -rf $TR2/*"                     2 "destr: glob target fails closed"
expbx true T1 "$TR2" "mv $TR2 $TR2-old"                  2 "destr: renaming the work repo blocked"
expbx true T1 "$TR2" "rm -rf $(dirname "$TR2")"          2 "destr: deleting an ANCESTOR of the work repo blocked"
expbx true T1 "$TR2" "rm -rf /"                          2 "destr: filesystem root blocked"
expbx true T1 "$TR2" "rm -rf 'unterminated $TR2"         2 "destr: unparseable command falls back to the mention rule"

echo "── PEER vs WORKER (owner_session; concurrent art peer must not be over-blocked) ──"
# WRITE guard. owner=W1; worker calls with SID=W1, peer calls with SID=P9.
# Worker: identical to the confined cross-repo behavior.
expwo true T1 "$TR2" W1 W1 "$TR2/sub/x.md"     0 "worker: write inside WORK allowed"
expwo true T1 "$TR2" W1 W1 "$TR/notes/y.md"    2 "worker: write outside WORK (elsewhere) blocked"
expwo true T1 "$TR2" W1 W1 "$LOCKS/verify.yml" 2 "worker: control lock blocked"
# Peer: free everywhere EXCEPT the worker's WORK zone and the control plane.
expwo true T1 "$TR2" W1 P9 "$TR/notes/y.md"    0 "peer: write elsewhere (own repo/vault/worktree) ALLOWED"
expwo true T1 "$TR2" W1 P9 "$TR2/sub/x.md"     2 "peer: write inside WORK (collision) blocked"
expwo true T1 "$TR2" W1 P9 "$LOCKS/verify.yml" 2 "peer: control lock still blocked"
# Fail-safe: peer-freedom requires a POSITIVE different session. Empty SID => treat as worker-confined.
expwo true T1 "$TR2" W1 "" "$TR/notes/y.md"    2 "no-SID caller stays worker-confined (fail-safe, no regression)"
# BASH guard.
expbo true T1 "$TR2" W1 W1 "git push origin main" 2 "worker: push-to-main HARD RULE holds"
expbo true T1 "$TR2" W1 P9 "git push origin main" 0 "peer: own push not policed by the delegation"
expbo true T1 "$TR2" W1 P9 "echo x > config/delegation-locks/verify.yml" 2 "peer: genuine control-plane write still blocked"
expbo true T1 "$TR2" W1 P9 "rm -rf $TR2"          2 "peer: deleting the WORK repo still blocked"
# Tightening: a stderr redirect next to a control-path MENTION is not a control write.
expb  true T1 "cat config/delegation-active.yml 2>/dev/null" 0 "reading the legacy lock path with stderr redirect allowed (no over-match)"

echo "── MULTI-LOCK concurrency (two live locks, distinct work zones) ──"
clearlocks
mklock verifyA true T1 "$TR2" W1 "" ""
mklock verifyB true T1 "$TR3" W2 "" ""
( cd "$TR2" && git checkout -q feature ); ( cd "$TR3" && git checkout -q feature )
expwm W1 "$TR2/sub/x.md"     0 "multi: owner A writes own zone"
expwm W1 "$TR3/sub/x.md"     2 "multi: owner A blocked from B's zone"
expwm W1 "$TR/notes/x.md"    2 "multi: owner A blocked elsewhere (confined)"
expwm W2 "$TR3/sub/x.md"     0 "multi: owner B writes own zone"
expwm W2 "$TR2/sub/x.md"     2 "multi: owner B blocked from A's zone"
expwm P9 "$TR/notes/x.md"    0 "multi: peer free elsewhere"
expwm P9 "$TR2/sub/x.md"     2 "multi: peer blocked from zone A"
expwm P9 "$TR3/sub/x.md"     2 "multi: peer blocked from zone B"
expwm P9 "$LOCKS/verifyA.yml" 2 "multi: lock files are control for everyone"
expbm W1 "git push origin main" 2 "multi: owner A push-to-main HARD RULE"
expbm P9 "rm -rf $TR3"          2 "multi: peer cannot delete zone B repo (destruction rule loops all zones)"
expbm P9 "git push origin main" 0 "multi: peer's own push not policed"
# Per-lock expiry: A expires -> W1 owns nothing (pure peer), but B's zone stays fenced.
mklock verifyA true T1 "$TR2" W1 "2000-01-01T00:00:00Z" ""
expwm W1 "$TR/notes/x.md"    0 "multi: expired lock releases its owner (now a pure peer elsewhere)"
expwm W1 "$TR3/sub/x.md"     2 "multi: ...but stays peer-fenced from B's live zone"
clearlocks

echo "── MULTI-LOCK block ATTRIBUTION (pass 6 / F1) ──"
# The 2026-08-27 defect: with two live locks owned by ONE session, every block reached
# before the per-lock loop was filed against OWNED_DIDS[0] — and locks.js sorts names, so
# lane A always won. The ledger then asserted one lane was never blocked and the other
# three times; both false. The fix is NOT a better guess: where no zone is named, the
# block is filed _unscoped and names its candidates, because a record that guesses is
# worse than one that admits it does not know.
resetblocks(){ rm -rf "$TR/delegations" "$TR/config/delegation-blocked.log" 2>/dev/null; }
expattr(){ # <want-file> <label> — exactly one blocked.log must exist, and it must be <want-file>
  local want="$1" label="$2" list n
  list=$(ls "$TR"/delegations/*/blocked.log "$TR/config/delegation-blocked.log" 2>/dev/null | tr '\n' ' ')
  n=$(printf '%s' "$list" | wc -w)
  if [ "$n" = "1" ] && [ -e "$want" ]; then ok "$label"; else no "$label" "filed to:${list:- nothing}"; fi
}
clearlocks; resetblocks
mklock verifyA true T3 "$TR2" W1 "" ""
mklock verifyB true T3 "$TR3" W1 "" ""
expbm W1 "echo x > $TR/.claude/hooks/evil.sh" 2 "attr: control-plane write still blocks under two owned locks"
expattr "$TR/config/delegation-blocked.log" "attr: an UNATTRIBUTABLE block is filed _unscoped, not under lock A"
resetblocks
expbm W1 "rm -rf $TR3" 2 "attr: destroying zone B blocks"
expattr "$TR/delegations/verifyB/blocked.log" "attr: a block NAMING zone B is filed against B, not lock A"
# The WRITE guard attributes through lib/classify-write.js, and the 2026-08-27 worker
# blocks came through it. CONTROL and OUTSIDE identify no zone at all, so naming one lock
# there is a guess of exactly the kind that corrupted the ledger.
resetblocks
expwm W1 "$TR/notes/x.md" 2 "attr: owner of two locks writing outside both zones blocks"
expattr "$TR/config/delegation-blocked.log" "attr: an OUTSIDE write under two owned locks is filed _unscoped"
resetblocks
expwm W1 "$TR/.claude/settings.json" 2 "attr: control-plane write via the WRITE guard blocks"
expattr "$TR/config/delegation-blocked.log" "attr: a CONTROL write under two owned locks is filed _unscoped"
clearlocks; resetblocks
mklock verifyA true T3 "$TR2" W1 "" ""
expbm W1 "echo x > $TR/.claude/hooks/evil.sh" 2 "attr: single-lock control write blocks"
expattr "$TR/delegations/verifyA/blocked.log" "attr: with ONE owned lock the block still names it (no regression)"

echo "── MULTI-LOCK TIER SCOPING (pass 6 / F2) ──"
# Tier was session-wide while zones are per-repo: lane A's T3 grant refused lane B's push
# after B's own lock had released. Scoping is FAIL-CLOSED — a command must NAME the zone
# to be judged by that zone's tier; anything ambiguous still meets the strictest owned tier.
clearlocks; resetblocks
mklock verifyA true T3 "$TR2" W1 "" ""
mklock verifyB true T1 "$TR3" W1 "" ""
( cd "$TR2" && git checkout -q feature ); ( cd "$TR3" && git checkout -q feature )
expbm W1 "git -C $TR3 push origin feature" 0 "tier: a push NAMING T1 zone B is not refused by T3 lock A"
expbm W1 "git -C $TR2 push origin feature" 2 "tier: a push naming T3 zone A is still refused"
expbm W1 "git push origin feature"         2 "tier: an UNZONED push still meets the strictest owned tier (fail-closed)"
clearlocks; resetblocks

echo "── ISSUE-CREATE TARGET SCOPING (pass 8 / mn#50) ──"
# 2026-09-01: a worldloom worker's LEGITIMATE `gh issue create -R matterjd/worldloom` was refused
# naming the OTHER lane's repo — the confinement lived INSIDE the per-lock loop, so at N=2 every
# lane failed the other lane's check. Third member of the mn#47/mn#48 family: pass 6 (F2) fixed
# this shape for the tier gate, pass 7 (mn#48) for the commit rule. The -R target must match ONE
# of the owned work repos' origins; unattributable targets (no lane, $VAR, GH_REPO, cd) fail closed.
clearlocks; resetblocks
mklock verifyA true T3 "$TR2" W1 "" ""
mklock verifyB true T3 "$TR3" W1 "" ""
expbm W1 "gh issue create -R rig/target3 --title x" 0 "mn50: -R naming lane B's tracker allowed under two owned locks"
expbm W1 "gh issue create -R rig/target --title x"  0 "mn50: -R naming lane A's tracker allowed under two owned locks"
expbm W1 "gh issue create -R other/elsewhere --title x" 2 "mn50: -R naming a repo NO lane owns still blocked"
expbm W1 'cd /somewhere && gh issue create --title x' 2 "mn50: bare create with cd still ambiguous, still blocked"
expbm W1 'GH_REPO=rig/target3 gh issue create --title x' 2 "mn50: GH_REPO override still unresolvable, still blocked"
clearlocks; resetblocks

echo "── COMMIT-RULE ZONE SCOPING (pass 7 / mn#48) ──"
# 2026-08-28: the commit HARD RULE looped over EVERY owned zone's branch, so lane A still
# on main blocked lane B's commit inside B's correctly-branched zone — then self-cleared
# when A branched, which made the failure look transient. Pass 6 fixed this shape for the
# tier gate (F2) and logging (F1); the commit rule was the remaining mirror. Attribution
# order: git -C path, else a SINGLE leading cd, else the hook cwd; unattributable commits
# fail closed against every owned zone, exactly as before.
clearlocks; resetblocks
mklock verifyA true T1 "$TR2" W1 "" ""
mklock verifyB true T1 "$TR3" W1 "" ""
( cd "$TR2" && git checkout -q main ); ( cd "$TR3" && git checkout -q feature )
expbm W1 "git -C $TR3 commit -m x" 0 "mn48: -C commit in BRANCHED zone B allowed while zone A sits on main"
expbm W1 "git -C $TR2 commit -m x" 2 "mn48: -C commit in zone A (on main) still blocked (control)"
expbmc W1 "git commit -m x" "$TR3/sub" 0 "mn48: cwd-attributed commit in branched zone B allowed"
expbmc W1 "git commit -m x" "$TR2" 2 "mn48: cwd-attributed commit in zone A (on main) still blocked"
expbm W1 "cd $TR3 && git commit -m x" 0 "mn48: single leading cd into branched zone B allowed"
expbm W1 "cd $TR2 && cd $TR3 && git commit -m x" 2 "mn48: multi-cd commit unattributable -> fail closed (a zone on main blocks)"
( cd "$TR2" && git checkout -q feature )
expbm W1 "git commit -m x" 0 "mn48: unattributable commit with ALL zones branched allowed (sweep finds no main)"
clearlocks; resetblocks

echo "── RELATIVE-WRITE BASE (pass 7: resolve against the CALLER'S CWD, not owned[0].zone) ──"
# mn#47's measured table: with three lanes live, a RELATIVE write from worldloom's cwd
# classified OWNWORK into the axis-grim lane — owned[0] after locks.js's name sort. The
# write's real destination is resolve(cwd, path); classifying against anything else judges
# a different file than the one being written.
clearlocks; resetblocks
mklock verifyA true T4 "$TR2" W1 "" ""
mklock verifyB true T1 "$TR3" W1 "" ""
expwmc W1 "x.md" "$TR3/sub" 0 "relbase: relative write with cwd in T1 zone B allowed (was misfiled into T4 zone A)"
expwmc W1 "x.md" "$TR2" 2 "relbase: relative write with cwd in T4 zone A still blocked (control)"
clearlocks; resetblocks
mklock verifyA true T1 "$TR2" W1 "" ""
mklock verifyB true T1 "$TR3" W1 "" ""
expwmc W1 "x.md" "$TR" 2 "relbase: owned relative write with cwd OUTSIDE every zone blocked (was a false allow)"
expwmc W1 "sub/x.md" "$TR2" 0 "relbase: N=1-shape control — relative write from inside own zone still allowed"
clearlocks; resetblocks

echo "── SESSION SCRATCHPAD under a live lock (pass 8b — Matter's ruling 2026-09-08) ──"
# mn#50's second finding: the harness advertises a per-session scratchpad to every agent, and the
# write guard denied it under any live lock (it is outside every zone). RULED: a NARROW carve-out —
# an owned session may write ITS OWN scratchpad, <temp>/claude/<slug>/<its session id>/scratchpad/,
# never another session's, never a sibling path, never without a session id, never at T4.
LAD=$(winpath "$(mktemp -d)")
expws(){ local sid="$1" f="$2" want="$3" label="$4"; jf "$f" | LOCALAPPDATA="$LAD" CLAUDE_CODE_SESSION_ID="$sid" bash "$HOOKW" >/dev/null 2>&1; [ "$?" = "$want" ] && ok "$label" || no "$label" "write want=$want"; }
clearlocks; resetblocks
mklock verifyA true T3 "$TR2" W1 "" ""
expws W1 "$LAD/Temp/claude/proj/W1/scratchpad/notes.md" 0 "scratch: an owned session writes its OWN scratchpad under a live lock"
expws W1 "$LAD/Temp/claude/proj/OTHER/scratchpad/notes.md" 2 "scratch: another session's scratchpad still blocked"
expws W1 "$LAD/Temp/claude/proj/W1/notes.md" 2 "scratch: a sibling path outside scratchpad/ still blocked"
expws "" "$LAD/Temp/claude/proj/W1/scratchpad/notes.md" 2 "scratch: no session id -> no carve-out (fail closed)"
mklock verifyA true T4 "$TR2" W1 "" ""
expws W1 "$LAD/Temp/claude/proj/W1/scratchpad/notes.md" 2 "scratch: T4 stays read-only, even for its own scratchpad"
# NOTE: rm the dir itself. $LAD has no path suffix, so `dirname "$LAD"` is the TEMP ROOT — the
# first draft of this line deleted %TEMP% mid-suite (the activation fixtures and this harness's
# own task files), which the tool then reported as "another process's startup cleanup".
clearlocks; resetblocks; rm -rf "$LAD"

echo "── ACTIVATION invariants (activate-lock.sh) ──"
FUT="2099-01-01T00:00:00Z"
HA=$(sha tokenA); HB=$(sha tokenB); HC=$(sha tokenC); HR=$(sha tokenR)
clearlocks; rm -rf "$TR/delegations"
CLAUDE_CODE_SESSION_ID=B1 bash "$ACT" actA T3 "$TR2" br "$FUT" "$HA" >/dev/null 2>&1
[ -f "$LOCKS/actA.yml" ] && ok "activate: basic activation writes the lock file" || no "activate: basic" "no file"
TR2UP=$(printf '%s' "$TR2" | tr '[:lower:]' '[:upper:]')
CLAUDE_CODE_SESSION_ID=B2 bash "$ACT" actB T3 "$TR2UP" br "$FUT" "$HB" >/dev/null 2>&1
[ ! -f "$LOCKS/actB.yml" ] && ok "activate: same work repo (case variant) refused" || no "activate: case-variant collision" "file written"
CLAUDE_CODE_SESSION_ID=B2 bash "$ACT" actB T3 "$TR2/" br "$FUT" "$HB" >/dev/null 2>&1
[ ! -f "$LOCKS/actB.yml" ] && ok "activate: same work repo (trailing slash) refused" || no "activate: slash-variant collision" "file written"
CLAUDE_CODE_SESSION_ID=B2 bash "$ACT" actC T3 "$TR3" br "$FUT" "$HB" >/dev/null 2>&1
{ [ -f "$LOCKS/actC.yml" ] && [ -f "$LOCKS/actA.yml" ]; } && ok "activate: second lock on a DIFFERENT work repo succeeds (concurrency)" || no "activate: concurrent second lock" "missing file"
# mn#46 (pass 5): per-repo locks — the SAME session may hold a second lock on a DISJOINT zone.
CLAUDE_CODE_SESSION_ID=B1 bash "$ACT" actD T4 "" br "$FUT" "$HC" >/dev/null 2>&1
[ -f "$LOCKS/actD.yml" ] && ok "activate: same session, DISJOINT zone allowed (per-repo locks, mn#46)" || no "activate: per-repo second lock" "refused"
bash "$REL" actD "tokenC" >/dev/null 2>&1
# mn#46 containment: activation from INSIDE a live lock's zone is refused (worker cannot mint a second zone).
CLAUDE_CODE_SESSION_ID=B7 bash -c "cd '$TR2' && bash '$ACT' actW T3 '$TR3' br '$FUT' '$HC'" >/dev/null 2>&1
[ ! -f "$LOCKS/actW.yml" ] && ok "activate: caller inside a live zone refused (worker containment, mn#46)" || no "activate: in-zone mint" "file written"
CLAUDE_CODE_SESSION_ID=B3 bash "$ACT" actE T3 "" br "2000-01-01T00:00:00Z" "$HC" >/dev/null 2>&1
[ ! -f "$LOCKS/actE.yml" ] && ok "activate: past expiry refused" || no "activate: past expiry" "file written"
CLAUDE_CODE_SESSION_ID=B3 bash "$ACT" actE T3 "" br "not-a-date" "$HC" >/dev/null 2>&1
[ ! -f "$LOCKS/actE.yml" ] && ok "activate: garbage expiry refused" || no "activate: garbage expiry" "file written"
CLAUDE_CODE_SESSION_ID=B3 bash "$ACT" actE T3 "" br "$FUT" "nothex" >/dev/null 2>&1
[ ! -f "$LOCKS/actE.yml" ] && ok "activate: non-sha256 release_hash refused" || no "activate: bad hash" "file written"
CLAUDE_CODE_SESSION_ID=B3 bash "$ACT" actE T9 "" br "$FUT" "$HC" >/dev/null 2>&1
[ ! -f "$LOCKS/actE.yml" ] && ok "activate: invalid tier refused" || no "activate: bad tier" "file written"
# Pass 7 (mn#47): a zone resolving to a MISSING directory inverted the write guard — every
# legitimate write refused, a relative write allowed into a zone no grant named — while
# activation printed OK. The zone must EXIST and (cross-repo) be REGISTERED before OK.
CLAUDE_CODE_SESSION_ID=B3 bash "$ACT" actN T3 "C:/mn47-nonexistent-zone/x" br "$FUT" "$HC" >/dev/null 2>&1
[ ! -f "$LOCKS/actN.yml" ] && ok "activate: zone resolving to a MISSING directory refused (mn#47)" || no "activate: missing zone" "file written"
UNREG=$(winpath "$(mktemp -d)")/unregistered
mkdir -p "$UNREG"
CLAUDE_CODE_SESSION_ID=B3 bash "$ACT" actU T3 "$UNREG" br "$FUT" "$HC" >/dev/null 2>&1
[ ! -f "$LOCKS/actU.yml" ] && ok "activate: existing but UNREGISTERED zone refused (workspace.yml repos: is the set)" || no "activate: unregistered zone" "file written"
rm -rf "$(dirname "$UNREG")"
# prune: a stale (expired) lock on the SAME work repo must not block a fresh activation.
mklock stale true T3 "" "" "2000-01-01T00:00:00Z" ""
CLAUDE_CODE_SESSION_ID=B3 bash "$ACT" actE T3 "" br "$FUT" "$HC" >/dev/null 2>&1
{ [ -f "$LOCKS/actE.yml" ] && [ ! -f "$LOCKS/stale.yml" ]; } && ok "activate: expired lock pruned; same-zone re-activation succeeds" || no "activate: prune" "stale kept or actE missing"
# respawn: owner may rotate the release hash under the SAME delegation id (worker died).
CLAUDE_CODE_SESSION_ID=B1 bash "$ACT" --respawn actA "$HR" >/dev/null 2>&1
grep -q "$HR" "$LOCKS/actA.yml" && ok "respawn: owner rotates release hash in place" || no "respawn: hash rotate" "hash unchanged"
grep -q 'respawn:' "$TR/delegations/actA/worklog.md" 2>/dev/null && ok "respawn: worklog event appended" || no "respawn: worklog event" "missing"
CLAUDE_CODE_SESSION_ID=B9 bash "$ACT" --respawn actA "$HB" >/dev/null 2>&1
grep -q "$HR" "$LOCKS/actA.yml" && ok "respawn: non-owner refused (hash unchanged)" || no "respawn: non-owner" "hash changed"
clearlocks

echo "── PREFLIGHT freshness (C11: refuse a work-tree behind origin/main on enforcement files) ──"
PR=$(winpath "$(mktemp -d)")/pfrepo
ORIG=$(winpath "$(mktemp -d)")/origin.git
mkdir -p "$PR/.claude/hooks" "$PR/config"
cp "$HOOKS"/*.sh "$PR/.claude/hooks/" 2>/dev/null
mkdir -p "$PR/.claude/hooks/lib" && cp "$HOOKS/lib/"*.js "$PR/.claude/hooks/lib/" 2>/dev/null
cp "$HOOKS/../settings.json" "$PR/.claude/settings.json"
( cd "$PR" && git init -q && git branch -M main && git config user.email t@t.co && git config user.name t \
  && git add -A && git commit -qm base )
git init -q --bare -b main "$ORIG" 2>/dev/null || { git init -q --bare "$ORIG"; git -C "$ORIG" symbolic-ref HEAD refs/heads/main; }
( cd "$PR" && git remote add origin "$ORIG" && git push -qu origin main >/dev/null 2>&1 )
CLAUDE_PROJECT_DIR="$PR" bash "$PF" >/dev/null 2>&1
[ "$?" = 0 ] && ok "preflight: tree equal to origin/main OK" || no "preflight: equal" "nonzero"
C2=$(winpath "$(mktemp -d)")/c2
git clone -q "$ORIG" "$C2" 2>/dev/null
( cd "$C2" && git config user.email t@t.co && git config user.name t \
  && echo "# guard change" >> .claude/hooks/delegation-guard-bash.sh && git add -A && git commit -qm bump && git push -q origin main )
( cd "$PR" && git fetch -q origin )
CLAUDE_PROJECT_DIR="$PR" bash "$PF" >/dev/null 2>&1
[ "$?" != 0 ] && ok "preflight: BEHIND origin/main on enforcement files FAILS" || no "preflight: behind" "passed"
( cd "$PR" && git merge -q origin/main >/dev/null 2>&1 && echo "# local guard work" >> .claude/hooks/delegation-guard-bash.sh && git add -A && git commit -qm ahead )
CLAUDE_PROJECT_DIR="$PR" bash "$PF" >/dev/null 2>&1
[ "$?" = 0 ] && ok "preflight: AHEAD of origin/main OK (directional)" || no "preflight: ahead" "failed"
( cd "$PR" && git remote remove origin )
CLAUDE_PROJECT_DIR="$PR" bash "$PF" >/dev/null 2>&1
[ "$?" = 0 ] && ok "preflight: no origin -> warn but OK" || no "preflight: no origin" "failed"

echo "── ESM HOST REPO (mn#51): the guards' libs are CommonJS and must load anyway ──"
# Every case above runs the libs from THIS repo, which has no package.json — so node
# loads them as CommonJS and the whole suite is blind to the one thing that decides it:
# node picks CJS vs ESM from the package.json NEAREST THE FILE, walking up from the
# installed hook. Provision the kit into a repo whose root declares `"type": "module"`
# (jigbench, 2026-09-09) and every lib dies on `require is not defined`; both guards then
# take their fail-closed path and BLOCK EVERY CALL — 49 of these 177 cases went red as
# "allowed" cases that were refused. Fail-closed, so never unsafe; unusable, and the
# message ("unparseable tool input") names the wrong cause.
#
# A replica cannot fail on what it omits: the fixture roots here have no package.json, so
# no case above could have caught it. This one installs the libs UNDER an ESM root, which
# is the arrangement a provisioned ESM repo actually has.
# The assertion is the classifier's OUTPUT, never its exit code: these libs are scripts
# that read stdin, and a bare `node lib.js` with no input exits non-zero for reasons that
# have nothing to do with the module system. An earlier draft of this section asserted the
# exit code and "passed" two files for the wrong reason.
ESM=$(winpath "$(mktemp -d)")/esm-host
mkdir -p "$ESM/.claude/hooks/lib"
printf '{ "name": "esm-host", "private": true, "type": "module" }\n' > "$ESM/package.json"
cp "$HOOKS"/lib/*.js "$ESM/.claude/hooks/lib/" 2>/dev/null
[ -f "$HOOKS/lib/package.json" ] && cp "$HOOKS/lib/package.json" "$ESM/.claude/hooks/lib/"
ESMJSON='{"tool_input":{"file_path":"C:/nowhere/x.md"}}'
esmout(){ printf '%s' "$ESMJSON" | node "$ESM/.claude/hooks/lib/classify-write.js" 2>&1; }

OUT=$(esmout)
case "$OUT" in
  *"is not defined"*|*"Cannot use import"*|*"require is not defined"*)
    no "ESM host: classifier runs under a type:module root" "module-system error: $(printf '%s' "$OUT" | tr '\n' ' ' | cut -c1-60)" ;;
  "") no "ESM host: classifier runs under a type:module root" "no verdict emitted" ;;
  *)  ok "ESM host: classifier runs under a type:module root (verdict: ${OUT%%$'\t'*})" ;;
esac
[ -f "$ESM/.claude/hooks/lib/package.json" ] \
  && ok "ESM host: the CommonJS pin ships with the libs" \
  || no "ESM host: the CommonJS pin ships with the libs" "lib/package.json missing from the kit"

# CONTROL — delete the pin and the SAME call must die on the module system. Without this,
# the case above is equally satisfied by a host that was never ESM in the first place.
rm -f "$ESM/.claude/hooks/lib/package.json"
OUT=$(esmout)
case "$OUT" in
  *"is not defined"*|*"Cannot use import"*)
    ok "ESM host CONTROL: unpinned classifier dies on the module system (the pin is load-bearing)" ;;
  *)  no "ESM host CONTROL: unpinned classifier must die" "it emitted '$(printf '%s' "$OUT" | tr '\n' ' ' | cut -c1-40)' — the pin is not what makes the case above pass" ;;
esac

rm -rf "$(dirname "$TR")" "$(dirname "$TR2")" "$(dirname "$TR3")" "$(dirname "$PR")" "$(dirname "$ORIG")" "$(dirname "$C2")" "$(dirname "$ESM")"
echo "────────────────────────────"
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
