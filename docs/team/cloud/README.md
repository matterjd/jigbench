# Cloud prompts, one per slice

One file here is one slice of `docs/ROADMAP.md` and one cloud session. Each file has a two-line
header, then a block between `----8<---- paste from here ----8<----` and
`----8<---- to here ----8<----`. The block is self-contained: it assumes a session that has never
seen this repo, and it carries the rules of the shop in full.

## How to use one

1. Take the next file in number order. `00` is the desk runbook for the 0.2.0 release and is the
   only one that is not pasted into a session.
2. Open a **new** session at claude.ai/code on `matterjd/jigbench`, model **Opus**.
3. Copy everything between the two markers and paste it as the first message. Nothing else is
   needed.
4. Wait. The session opens the PRs the header's **Expected PRs** line predicts.
5. Tell the lead the PR numbers. The lead verifies, and the lead refreshes `HANDOFF.md`.

One session per slice. Two sessions on one slice will fight over the same branch.

## The three tiers

- **green.** The session merges its own PR once both CI legs are green at the PR head. Nothing is
  owed to you until it reports.
- **amber.** The session opens the PR, gets both legs green, then stops. The lead reviews and
  merges. Expect a PR link and no merge.
- **ruling.** The session's first step is to print questions on the issue and build nothing. It
  waits for your answer there. Answer in the issue, then paste the same block into a fresh session.

## What every block already says

Do not add these by hand. Each block already carries them:

- no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real `claude` binary
- every server test runs with `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9`
- the repo's fake `claude` on PATH is how the Build-runner tests run
- test-first, with the red line quoted in the commit body
- one branch per slice, `git commit -s`, a PR in the worker-report shape
- both CI legs (Windows and Ubuntu) green at the PR head before any merge
- every merge recorded on issue #1 with its sha and CI run id
- never edit `examples/` source, `QUALITY.md` or `docs/quality/`
- never `npm link`, `claude mcp add`, tag, publish, or change visibility

## The order

`docs/ROADMAP.md` is the sequence. In short: `00` (the desk publishes 0.2.0), then `01` through `04`
for v0.2.1, then `05` through `09` for the stacks, then `10` through `13` for the loop, then `14`
through `17`, which are questions for you and not work.
