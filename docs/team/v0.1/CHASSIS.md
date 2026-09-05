# CHASSIS — the bench's arrangement, as ruled 2026-09-05

> The Design round's verdict translated into build terms. Concept A is the chassis; parts of B and
> C are stolen into it. The built specs are the concept files themselves
> (`docs/design/concepts/`, open at 1440×900) — read them before touching `packages/bench`. The
> tongue is `docs/design/COMMISSION.md` §3; the floor is the design book's (`docs/design/COMMISSION.md`
> points at it). Slices S4, S5 and S8 build this; nothing else changes the arrangement.

## The regions (A · The Surface Plate)

```
┌──────┬──────────────────────────────────────────┬───────────────────────┐
│ rail │  plate (the app, large, in a hairline    │ properties            │
│      │  frame; rulers + guides that snap to the │  · loupe readout      │
│      │  app's own gauge grid)                   │  · gauges (tab)       │
│      │                                          │  · survey (tab)       │
├──────┴──────────────────────────────────────────┴───────────────────────┤
│ tray — work orders (collapsed: the current order; expanded: B's SPINE)  │
├──────────────────────────────────────────────────────────────────────────┤
│ logbook (ribbon) · SIM strip · shop lane (B, wyrd)                       │
└──────────────────────────────────────────────────────────────────────────┘
```

| Region | What lives there | Source concept | Slice |
|---|---|---|---|
| **rail** (left, ~56px) | Tools as inline-SVG icons with the plain word on hover / first encounter: Hand · Loupe · Mark · Fixture · Toolpath · Sketch. One active tool; `Esc` returns to Hand. | A | S4 |
| **plate** (centre, the largest region) | S3's `PlateFrame` (the proxied app in an iframe) inside a hairline frame; rulers in the app's CSS pixels; guides that snap to the surveyed spacing gauges and say when an element is off-grid ("off the 4px grid by 2.0px"). **Trial-fit mode** splits the plate into two — as-is left, trial fit right — with C's toolpath scrubber underneath driving both (S8). | A · C | S4 · S8 |
| **properties** (right, ~320px) | Loupe readout (component · selector · file · inputs/outputs · the gauges it uses), Gauges tab (categories, two-way lit with the plate, one `printed` affordance), Survey tab (components · routes · endpoints · clamped docs, counts). | A | S4 |
| **tray** (bottom drawer) | Collapsed: the order in hand — its ladder, its human face, RELEASE. Expanded: **B's spine** — every work order as a card by state along the ladder (marked · drafted · released · in the shop · trial fit · scrapped), age in mono, drafted-by badge; selecting a card lights its marks on the plate. | A · B | S5 |
| **shop lane** (a narrow wyrd strip beside the logbook) | The connected agent (Claude Code · connected / none), and which released orders it holds. | B | S5 · S6 |
| **logbook** (ribbon) | Every event with provenance and age; the scrap bin count. Already in S1 as a list — becomes the ribbon. | A · B | S5 |
| **command palette** (`Ctrl/⌘ K`) | Two moves: invoke, then name the thing (a component, a work order, a gauge, a tool). | A | S4 |
| **SIM strip** | Stays until every subsystem is wired; then it becomes the wiring line. | S1 | — |

## The one demand

**RELEASE is held** (~800 ms, `--t-oath`, a filling ring, ember, alone on the screen; letting go
early cancels in words: *released before the weight — nothing written*). Nothing else on the bench
is ember. The loupe, guides, connection and lit gauges are storm hairlines; the shop is wyrd;
gold is one ring on the rung an oath was held on. Read `--t-oath` live from the tokens (A does;
B hard-coded it — the floor pass flagged that as the outlier).

## Shelved (recorded, not built)

B's order-first layout and the veil that recolours the subject; C's hinge layout and the
bottom drawers as the primary arrangement. They stay in the gallery as the round's record.

## Floor items the chassis must keep passing

Read the floor from the design book (never restate its count). The ones the concepts had to
work for: no text under 11px unless uppercase + tracked + 700 + paired with a glyph; `--faint`
only for provenance and echoes; at most one thing moving at rest and only for a live process;
every motion inside `prefers-reduced-motion: no-preference`; hairlines at rest, shadows only when
something lifts; one saturated mass; the two-move rule; every filtered or resized surface has one
`printed` affordance.
