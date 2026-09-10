# Roadmap snapshot — handover contract

The `@aedl -roadmap` reconciliation writes a dated snapshot on every real run. This file is
the contract for whoever reads it. Today that is command-center's roadmap provider
(`A4a-iii-snap`, under `matterjd/command-center#101` Phase A); the ticket on this side is
`matterjd/matter-notes#15` (`MN-GATE8`).

The shape is **pinned by a working example** at `references/snapshot-example.json`, which the
writer's own validator checks on every test run. If the example and this prose ever disagree,
the example is the one under test — believe it, and fix the prose.

---

## Where the files are

```
docs/roadmap-snapshots/<YYYY-MM-DD>-issues.json
```

- One file per calendar day, **UTC**. A second run on the same day overwrites that day's file.
- The directory is **gitignored** and kept alive by a committed `.gitkeep`. Snapshots are
  local artifacts on purpose: `git checkout` stamps working-tree files with *checkout* time,
  so committing them would make every `distilledAt` silently become "when you cloned". An
  empty directory on a fresh clone is honest; a confident wrong timestamp is not.
- Consequence for the consumer: **absence is a normal state.** Render "no reconciliation yet",
  never a zero or a clean slate.

## Which file is newest — the rule

Two clauses, and they are independent. Implement both.

**SELECT** — the file to read is the **lexicographic max** of the basenames matching

```
^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-issues\.json$
```

This is a string comparison on the basename. It is **not mtime ordering**, and it is not
"the most recently modified file in the directory". Anything in the directory that does not
match the pattern is ignored entirely.

**The date components are validated — month `01`–`12`, day `01`–`31`** (D-026, ruled
2026-08-21). A shape-only match admitted impossible dates, and because selection is a
lexicographic max, a single stray `9999-99-99-issues.json` shadowed every real snapshot
**permanently and silently** — its mtime becoming `distilledAt`. Every *other* failure in this
contract degrades quietly to "no reconciliation yet"; this one is loud and wrong: a confident
timestamp and a full set of counts from a file nobody meant to publish.

It is deliberately **not** a calendar check. `2026-02-31` still selects, because rejecting it
requires knowing the month's length, and SELECT must stay a **pure function of the basename** —
no filesystem access, no clock, independently testable, identical on both sides. That property
is the point of the rule, so the line is drawn at *impossible under any month* rather than at
*impossible in this one*.

**STAMP** — `distilledAt` is the **mtime of that selected file**, read as epoch milliseconds
(command-center reads it through `FsAdapter.statMtimeMs`).

Why it is spelled out this way: on an ordinary day the lexicographic-max file *is* also the
newest by mtime, so an implementation that sorts by mtime agrees with this contract every day
until the day it does not — a backfilled snapshot, a restored file, a clock that stepped, a
copy that landed out of order. Selecting correctly and then stamping from a different file is
a second, separate defect that a selection-only test cannot see. The reference implementation
is `scripts/write-snapshot.sh latest`; mirror it rather than reinventing it, and port its two
disagreement tests along with it.

```bash
# reference implementation, and the receipt a consumer should be able to reproduce
$ .claude/skills/aedl-roadmap/scripts/write-snapshot.sh latest
SNAPSHOT_LATEST file=2026-08-15-issues.json path=… distilledAtMs=1786829645955 distilledAt=2026-08-15T21:34:05.955Z
```

## The document

See `references/snapshot-example.json` for the pinned copy. Structure:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-15T21:07:44Z",
  "repos": [
    {
      "repo": "owner/example-repo",
      "open": 2,
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
```

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | number | `1`. Bumped only for a breaking change; additive fields do not bump it. |
| `generatedAt` | string | ISO-8601 UTC, as the writer saw the clock. **Debugging aid only — never read this as `distilledAt`.** It records what the producer believed; `distilledAt` is what the reader measures from the filesystem, and the two diverge whenever a file is copied, restored, or written by a machine with a skewed clock. |
| `repos[]` | array | One record per repo the run covered — including repos with nothing open, and repos it could not reach. |
| `repos[].repo` | string | `owner/name`. |
| `repos[].open` | number \| null | Open-issue count for that repo. `null` **only** when `unreachable` is true. |
| `repos[].unreachable` | boolean | True when the tracker could not be reached for this repo. |
| `repos[].issues[]` | array | One record per open issue. Empty for a clean repo and for an unreachable one. |
| `issues[].number` | number | Issue number. |
| `issues[].title` | string | Issue title, verbatim. |
| `issues[].state` | string | The tracker's own **uppercase** form, e.g. `OPEN`. Compare against `"OPEN"`, not `"open"`. |
| `issues[].repo` | string | Repeated on the record so an issue survives being lifted out of its group. |
| `issues[].labels[]` | array of strings | **Label names only.** The tracker emits label *objects* carrying `id`, `description` and `color`; the writer normalizes them away, so a consumer filtering for `debt` compares strings. |

The per-repo `open` count is part of the contract, not a convenience: the writer refuses a
payload whose `repos[]` record has no `open`.

## Unreachable repos

A repo whose tracker could not be reached is recorded as `"open": null, "unreachable": true` —
never as zero open issues. Zero and unknown are different facts, and flattening them is how a
drifting repo comes to render as a clean slate. The writer refuses a payload that gives an
`unreachable` repo a numeric count.

**The consumer must carry the distinction through.** Do not sum `null` as `0`; exclude
unreachable repos from any coverage or clean-slate figure and show them as unreconciled.

## What a consumer must not do

- Do not order by mtime to pick the file. See above.
- Do not read `generatedAt` as `distilledAt`.
- Do not point `distilledAt` at `docs/aedl-roadmap.md` — the roadmap document's own timestamp
  moves for edits that are not reconciliations (PRD N3 forbids it).
- Do not expect the snapshots in version control, and do not treat an empty directory as
  a clean slate.
- Do not assume today's file exists. The newest file may be days old; that age *is* the signal.

## Stability

Additive fields may appear without a `schemaVersion` bump, so read defensively and ignore
what you do not recognise. Removing or retyping a field bumps `schemaVersion`. The two things
that will not move without a bump are the filename pattern and the selection rule, because
they are what a consumer builds its reader around.

> **AMENDED 2026-08-21 (D-026), and the amendment ships in the same commit as the change it
> describes.** The selection rule **did** move: it now validates the date components. By the
> letter of the clause above that wanted a `schemaVersion` bump. **It does not get one, and the
> reason is that the change only NARROWS what is admitted** — for any conforming
> producer/consumer pair the old rule and the new one return identical results, because no
> legitimate snapshot is ever dated month 13. Checked rather than assumed: command-center's
> fixtures carry no impossible-date sentinel, so nothing on the consumer side relied on the old
> permissiveness.
>
> So read the promise above as it was meant: **the rule will not move in a way that changes what
> a conforming reader sees.** A narrowing that is a no-op on every valid input is not the kind of
> movement a bump exists to announce. A widening would be, and so would any change to the
> filename pattern itself.
>
> **Why this note exists at all.** Leaving "the selection rule will not move without a bump"
> standing above a rule that moved would make this document a false record — and shipping the
> record *after* the change is how it becomes stale on landing. This repo has now filed that
> same defect twice.
