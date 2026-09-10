<!-- Template (DELIVERY-TEAM.md §8.2). Instantiate per feature as
     docs/quality/<feature>.md, written by QA at feature close, after the debt
     burn-down. Every number beside the command that produced it. -->

# Quality closing report — <feature>

**Feature:** <name> · <issue/PRD links>
**Opened:** <YYYY-MM-DD> · **Closed:** <YYYY-MM-DD> · **Sessions:** <n>

## Tests added by layer

| Layer | Added | Pass rate at close | Command |
|---|---|---|---|
| Unit | <n> | <n>/<n> | `<command>` |
| Integration | <n> | <n>/<n> | `<command>` |
| E2E | <n> | <n>/<n> | `<command>` |
| Smoke | <n> | <n>/<n> | `<command>` |

## Coverage

<start pct>% → <close pct>% — `<command>`

## Defects

Found: <n> · Fixed: <n> · Deferred: <n>
<one line per deferred: issue link · severity · why deferred>

## Verification runs

<one line per run: round · per-axis verdicts · record link>
Declared final round: <n> · blocker bar: <what would have blocked>

## Yours-only checks (charter §3 physics exception)

<one line per check: the click-through script handed over · Matter's verdict>

## Burn-down outcome

Clean start for next feature: <y/n> — `gh issue list --label debt --state open` = <n>
<if cut short: the scope decision, cited>

## Retro

docs/team/<feature>/RETRO.md
