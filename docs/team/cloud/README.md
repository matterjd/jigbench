# Cloud prompts, one per slice

One file here is one slice of `docs/ROADMAP.md` and one cloud session. Each file has a two-line
header, then a block between `----8<---- paste from here ----8<----` and
`----8<---- to here ----8<----`. The block is self-contained: it assumes a session that has never
seen this repo, and it carries how work lands in full.

## How to use one

1. Take the next file in number order. `00` is the desk runbook for the 0.2.0 release and is the
   only one that is not pasted into a session.
2. Open a **new** session at claude.ai/code on `matterjd/jigbench`, model **Opus**.
3. Copy everything between the two markers and paste it as the first message. Nothing else is
   needed.
4. Wait. The session opens the PRs the header's **Expected PRs** line predicts.
5. Tell the lead the PR numbers. The session's CLOSE opens a docs PR refreshing `HANDOFF.md`; the
   lead verifies that PR and merges it.

One session per slice. Two sessions on one slice will fight over the same branch.

## The three tiers

- **green.** The session merges its own PR once both CI legs are green at the PR head. Nothing is
  owed to you until it reports.
- **amber.** The session opens the PR, gets both legs green, then stops. The lead reviews and
  merges. Expect a PR link and no merge.
- **ruling.** The session's first step is to print questions on the issue and build nothing. It
  waits for your answer there. Answer in the issue, then paste the same block into a fresh session:
  it finds your answers already posted and carries on into step 2 under the same HOW WORK LANDS and
  CLOSE rules every other block carries.

## What every block already says

Do not add these by hand. Every block that goes into a session — `01` through `17`, all seventeen,
plus `03b` — already carries them. (`00` is the desk runbook and carries the release rules instead.)

- no Browser pane, no Windows desk, no .NET SDK, no Ollama, no real `claude` binary
- every server test runs with `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9`
- the repo's fake `claude` on PATH is how the Build-runner tests run
- test-first, with the red line quoted in the commit body
- one branch per slice, `git commit -s`, a PR in the worker-report shape
- both CI legs (Windows and Ubuntu) green at the PR head before any merge
- every merge recorded on issue #1 with its sha and CI run id
- never edit `examples/` source, `QUALITY.md` or `docs/quality/`
- never `npm link`, `claude mcp add`, tag, publish, or change visibility
- a CLOSE section: a docs PR refreshing `HANDOFF.md`, and a one-sentence handoff as the session's
  last line

## Desk sessions (command-center launcher)

Matter also launches sessions from command-center's launcher on the desk, where the Browser pane,
.NET, Ollama and the real `claude` binary are all present and the repo's `.claude/` armor fires.
The same files serve both lanes, and there is only ever one copy. Paste the same block. Replace
only its **first paragraph** (the REMOTE seat line) with the DESK seat line below; the READ list
and everything after it stay unchanged, word for word.

```
Open as the DELIVERY SEAT for matterjd/jigbench. You are a DESK session launched from
command-center: the Browser pane, Ollama (`JIG_NO_MODEL=1` when it is down), .NET and the real
`claude` binary are present, and the repo's `.claude/` armor is live. Run server tests with
`JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9` unless a step says otherwise; never run a real
`claude -p` against Matter's account inside a test (the fake `claude` on PATH is for tests; the
Build button in a live walkthrough is fine).
```

What the swap changes, and nothing else:

- **Only the first two lines of the list above.** A desk session does have the Browser pane, the
  Windows desk, .NET, Ollama and the real `claude` binary. Every other line in that list still
  holds, word for word, CI included.
- **The merge word stays with the lead** (the eval seat in `matter-notes`) for amber slices. A desk
  session opens the PR, gets both legs green, and stops, exactly as a cloud session does.
- **One writer per repo at a time.** Never a desk session and a cloud session on `jigbench` at
  once: they fight over the same branches and the same issue #1. One of them waits.
- **CI is still the gate.** Both legs green at the PR head before any merge. Local suites are
  optional, and they are off when Matter says the desk is his.
- **A desk session may drive the app, and should say what it saw.** It may run the
  `docs/TEST-RUN.md` steps and hold Ready itself, then record what it saw on issue #1. A cloud
  session cannot do either, and must never report a walkthrough it did not run.
- **Still never** `npm publish`, tag, `npm link`, `claude mcp add` against Matter's own config, or
  a change of repository visibility. Those are Matter's hands on the desk, the same as in the
  cloud.
- **Delegation needs a signed grant.** `SUBAGENT-AUTHORIZATION.md` must be signed by Matter before
  any delegation grant inside `jigbench` is valid. Unsigned, there is no grant, and a desk session
  does the work itself.

## The order

`docs/ROADMAP.md` is the sequence. In short: `00` (the desk publishes 0.2.0), then `01` through `04`
for v0.2.1, then `05` through `09` for the stacks, then `10` through `13` for the loop, then `14`
through `17`, which are questions for you and not work.

`03b-hardening-round-2.md` sits after `03`: issue #81, the follow-ups the lead's review of the S20
hardening round left behind (roadmap row S20b). It runs after `03` has merged, amber like `03`.
