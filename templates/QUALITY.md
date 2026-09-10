<!-- Template (DELIVERY-TEAM.md §8.1). Instantiate ONCE per repo as root QUALITY.md.
     QA-owned, updated every session. Overwrite values, never the structure.
     Every number sits beside the command that produced it — a count without its
     command goes stale invisibly (count-beside-command doctrine). -->

# QUALITY — <repo>

**Feature in flight:** <feature or "none">
**Last updated:** <YYYY-MM-DD HH:MM, from `date` — never inferred> by <session/role>

## Test suite by layer

| Layer | Count | Pass rate | Command run |
|---|---|---|---|
| Unit | <n> | <n>/<n> | `<command>` |
| Integration | <n> | <n>/<n> | `<command>` |
| E2E | <n> | <n>/<n> | `<command>` |
| Smoke | <n> | <n>/<n> | `<command>` |

## Coverage

<pct>% (<delta vs last session>) — `<command>`

## Open defects

Critical / Blocker: **0 by construction** — they interrupt the build (charter §7).
Debt (non-critical, auto-filed): <n> open — `gh issue list --label debt --state open`

## Bug debt this feature

Filed: <n> · Fixed: <n> · Carried over: <n>

## Last verification run

<date> · fixed point `<ref>` · findings by severity <n>/<n>/<n> · record: <link>

## Deterministic gates

<gate>: <green/red> — `<command>`
