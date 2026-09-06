# Retro — v0.1 (draft)

Feature-close retrospective for the Tuesday cut. Drafted by QA from the record — jigbench#1's
comment trail, the merge commits, and the scripts themselves — not from memory. One line each,
with the evidence pointer, per `DELIVERY-TEAM.md` §5's retro ceremony. Matter/the Lead should
finalize this before the next feature opens.

## What slowed us

- **Warm-tree false greens, at least three times.** A worker's own tree had `core/dist` already
  built, or a source alias already resolved, so a real gap was invisible until the brain re-ran
  the control on a *fresh* worktree. Evidence: jigbench#1 — S1a→wave-1-council ("my own pre-merge
  gate ran in a WARM worktree where `core/dist` existed, so it could not see finding 1"), S2 merge
  ("the cli vitest config lacked aliases ... invisible in the worker's warm tree"), Wave-3 merge
  ("`TrayRegion` imports a pure constant from core and bench had no source alias — invisible in
  warm trees").
- **Real-Ollama nondeterminism made one HTTP suite 60x slower and occasionally flaky before it was
  decoupled.** Evidence: jigbench#1, wave-3 fix pass ("HTTP tests decoupled from the real Ollama
  ... red reproduced with a stand-in that never answers `/api/generate`: 60 s → 1 s"). The same
  root cause left issue #3 open today (`http.trialfit` e2e "timing-sensitive under full-suite
  load").
- **Merge-branch sequencing cost two stalls.** Wave 2 held S2's merge because a fresh-worktree
  control went RED on the merge branch (missing cli aliases) while wave 3 was queued behind it
  (jigbench#1, "S2 merge + wave 3 HELD until the usage window resets"); S8's fast-forward was
  later refused outright because `main` had moved by an unrelated docs commit after the merge
  branch was cut (jigbench#1, the correction comment after the first "S8 merged" note).
- **`SendMessage` to a running worker was unavailable mid-session**, so a live council finding
  (the plate proxy's wildcard bind) couldn't be relayed to the in-flight Senior and had to wait for
  a follow-up merge pass instead of a same-session nudge. Evidence:
  `matter-notes-jig/ideas/parking-lot.md`, row dated 2026-09-05 ("jigbench wave 2").
- **This session re-discovered the Windows PATH problem from scratch.** Every Bash call in this
  sandbox starts with a Windows-formatted `PATH` (no `/usr/bin`, no `/c/Windows/System32`,
  GitHub CLI missing) and shell state doesn't persist between calls, so `ls`, `gh`, and
  `netstat`/`taskkill` all silently failed until the export was repeated on every single command.
  Evidence: this session's own first three tool calls (recorded in this repo's git history as
  nothing — it left no trace, which is exactly the risk) plus `scripts/trialfit-smoke.sh`'s own
  header comment, written for the identical reason: *"netstat/taskkill live in
  `C:\Windows\System32` ... an agent/CI shell whose PATH was reset may not [have it] ... every
  `pid_on_port` lookup silently returns empty ... a false FAIL."*

## What the harness should change

- **Make the fresh-checkout control the standing pre-merge rule, not a lesson re-learned per
  wave.** It already is, in practice, from wave-1 onward (jigbench#1, every merge comment from
  S3 forward opens with "fresh-worktree control by the brain") — write it once into the
  delegation skill's merge checklist so a future repo doesn't have to hit the same false green
  first.
- **Default every drafter/adapter seam to dependency injection at spawn time, not as a
  post-hoc fix.** `createJigServer({drafters})` + `FakeOllamaDrafter` + `JIG_NO_MODEL` were added
  *after* the 60s-flaky-test pain (jigbench#1, wave-3 fix pass). A worker brief for any external
  service (a local model, a real agent, a real filesystem watcher) should require the fake/override
  seam from the first commit, the same way `S6`'s brief already required stdout purity from the
  first commit.
- **Put the PATH export in every worker/QA brief as a standing default line, not tribal
  knowledge.** This session's own task brief already carried it ("FIRST in every shell:
  `export PATH=...`") — that's the fix; generalize it to every brief that spawns a Bash-driving
  agent on this desk, referencing `scripts/trialfit-smoke.sh`'s PATH guard as the in-repo
  precedent for why it matters.
- **State plainly, in the harness docs, that in-session steering (`SendMessage` to a live worker)
  is not guaranteed.** A brief for any long-running delegated build should carry a standing
  "security defaults" block (loopback bind, origin checks, no stdout leakage) precisely so a
  worker never *needs* the mid-flight nudge that may not be deliverable — per the parking-lot
  row's own candidate fix (`matter-notes-jig/ideas/parking-lot.md`, 2026-09-05).
