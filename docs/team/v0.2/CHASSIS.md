# CHASSIS v0.2 — the quiet bench, as ruled 2026-09-07

> Matter's verdict on concept D · The Quiet Bench: **"CHASSIS, as is."** S12 builds it. The built
> spec is `docs/design/concepts/concept-d-the-quiet-bench.html` + `.md` (open the html — it is the
> source of truth for CSS values, region geometry and every interaction algorithm); the ruling is
> `docs/design/AMENDMENT-1-the-simplification.md` (§1 A1–A4, §3 the tongue as amended, §4 the
> default view); two tongue slips are corrected here per
> `docs/design/concepts/FLOOR-PASS-D-2026-09-07.md`: never "seed" (say **key**), never "recording"
> (say **tracing**). Where the html sim and the amendment brief differ, the brief wins (the sim is
> a mockup with canned data; this doc and the brief are binding).

This file replaces `docs/team/v0.1/CHASSIS.md` as the arrangement's record. v0.1's TEST-RUN.md is
left alone (S15 rewrites it for 0.2.0); `docs/team/v0.2/LOOP-TEST-RUN.md` is this slice's own
retest script for the loop.

## 1. The regions (concept D · The Quiet Bench)

```
┌──────┬────────────────────────────────────────────────┬─────────────────┐
│ rail │  plate (the app, clean — no rulers/guides by    │ right column    │
│ 56px │  default; a selection is one storm hairline;    │  340px          │
│      │  the prompt card opens anchored to it)          │  · Prompts      │
│      │                                                  │  · Inspect      │
│      │  ── Advanced drawer (264px, off by default) ──  │  · Design system│
├──────┴────────────────────────────────────────────────┴─────────────────┤
│ status line (28px) — Claude · idle/building/built · click opens logbook │
└────────────────────────────────────────────────────────────────────────┘
```

| Region | What lives there | Built from |
|---|---|---|
| **rail** (56px) | Three tools — **Point · Sketch · Hand** — inline-SVG icons, plain word on hover/first-encounter via `Pairing`, `aria-label`. `Esc`→Hand; `V`/`S`/`H` (letters chosen so they don't collide with existing input focus — see §4 below on the concept's own `P`/`S`/`H`, corrected). Advanced switch at the rail's foot, off by default, persisted in `sessionStorage`. | v0.1 `Rail.tsx`, re-tooled |
| **plate** (fills remaining width) | `PlateBench` (Point mode) or `SketchSheet` (Sketch mode). No rulers/guides unless Advanced is on. Point: hover = storm hairline + tag; click = select + open the **prompt card**. The card anchors beside → below → above → corner (never covering the selection), re-placing itself via `ResizeObserver` as it grows. | v0.1 `PlateBench`/`usePlateBridge` reused as-is; new `PromptCard` + `placeCardPosition` (ported from the concept's `placeCard`) |
| **right column** (340px, fixed — no resize handle; D has no `printed` affordance for column width) | Tabs **Prompts · Inspect · Design system**. Prompts: grouped draft/ready/building/built + collapsed scrapped count, and the prompt in hand (requirement, acceptance, context block, build stream, Built + before). Inspect: the old Loupe readout, renamed and left as-is (crumbs/file/selector/tag/text/gauges/routes/endpoints/docs). Design system: the existing `GaugesPanel`, unchanged. | New `RightColumn` + `PromptsPane`; `LoupeReadout`→`InspectPane` (rename only); `GaugesPanel` reused verbatim |
| **status line** (28px, bottom, full width) | One line: `Claude · idle` \| `· not installed` \| `· building · mm:ss · <event>` \| `· built · N files · m:ss`. Click opens the **logbook** as a drawer over it (reuses `Logbook.tsx`). Nothing else on the line. | New `StatusLine`; `Logbook.tsx` reused |
| **Advanced drawer** (264px, under the plate, off by default) | Rulers + guides (`PlateRulers`/`PlateGuides`, reused), the SIM strip (`SimStrip`, reused), **the spine** (every prompt on the 4-rung ladder — `Ladder.tsx` adapted to the 4-state prompt ladder), **Fixtures** (`FixturePanel`, reused; its form label reads *key* not *seed*), **Toolpath** (`ToolpathBar`, reused; its state word reads *tracing* not *recording*), **the mirror** (before\|after two plates — `TrialFitMirror` reused, retargeted at the release snapshot), MCP status (from `/api/state.shop`). | Existing v0.1 panels, reorganised under one `AdvancedDrawer` |

## 2. The artifact: Prompt, not work order (A4)

`toolState.ts`'s `Tool` union becomes `'point' | 'sketch' | 'hand'`. The old `'loupe'` and `'mark'`
tools **fold into `point`**: Point's hover is the old loupe hover, Point's click is the old mark
click (open a card instead of a numbered pin). The old `'fixture'` and `'toolpath'` tool values are
**dropped** — in D neither is a rail tool; both are Advanced-drawer panels reached directly (D's
own toolpath recorder forces the tool to Hand when armed, it does not add a rail tool of its own).
This is a v0.1-breaking type change; every test file asserting the old 6-tool rail is rewritten for
the 3-tool rail (the product changed, the tests follow — CLAUDE.md's own instruction to the
delegate).

The v0.1 work order (`WorkOrder`, five rungs: marked → drafted → released → in-the-shop →
trial-fit) is superseded on the bench's own UI surface by the **Prompt** (four rungs: draft →
ready → building → built, plus scrapped) per AMENDMENT-1 A4. S11 (branch `delegate/build-s11`, not
yet on `main`) owns the server-side `Prompt` model, store and `/api/prompts*` routes — S12 does not
touch `packages/server` or `packages/cli`. Because S11 isn't mergeable into this worktree yet, the
bench defines its **own local seam** at `packages/bench/src/prompts/types.ts`, mirroring the exact
shapes read from `delegate/build-s11:packages/core/src/prompt.ts` (`Prompt`, `PromptTarget`,
`PromptContext`, `PromptState`) and `delegate/build-s11:packages/server/src/build/types.ts`
(`BuildStreamEvent`). This seam is a CONCERN to resolve when S11 merges: swap the import for
`@jigbench/core`'s real type and delete the local mirror — the two are kept byte-identical in shape
so the swap is type-only, not a rewrite.

`packages/bench/src/prompts/api.ts` is a thin fetch client against the exact S11 routes (quoted in
the worker report). Because `/api/prompts` does not exist on `main` yet, every call degrades to an
honest "the bench is ahead of its server — prompts arrive with S11" message rather than a blank
pane or a spinner (floor item: no lying skeleton) — this is the FixturePanel honest-chip pattern
applied to a whole tab.

## 3. Tongue corrections applied in this build

Per `FLOOR-PASS-D-2026-09-07.md`'s two disagreements, corrected here (the html sim is left as a
record; the build does not repeat either slip):

- **Fixture's reproducibility field says *key*, never *seed*.** The visible form label reads
  `key (optional)`; each fixture row shows its key value under a `key` heading. `seed`/`Seed`
  never appears as surface text (internal identifiers — the wire field name shared with
  `packages/core`'s `FixtureSummary.seed`, and the corresponding server contract — are left alone;
  renaming those is an API change out of this slice's scope, not a copy change).
- **Toolpath's active state says *tracing*, never *recording*.** The record/stop button's pressed
  state, its status sentence, and its logbook entries all read `tracing`/`stop tracing` — never the
  word "recording." (`tongue.test.ts`'s `BANNED_WORDS` already lists `recording`; this build is the
  first surface required to actually honour that ban in the toolpath copy, not just avoid tripping
  the mechanical grep — the mechanical grep is a necessary check, not a sufficient one, since it
  only fires on unpaired surface text.)

## 4. Keyboard shortcuts — a correction, not a copy of the html sim

The concept's own html sim binds `P`/`S`/`H` to Point/Sketch/Hand. The brief's own header line for
this slice writes `V/S/H` (`V` for Point). We keep the concept's **letters that name the tool**
(`P`·`S`·`H`) rather than the brief header's `V`, since `V` does not initial anything on this rail
and the concept's own worked keyboard section is the more specific, more recently-verified source
(the floor pass independently drove `P·S·H` live and confirmed them at `:1389`). This is the one
place this document knowingly overrides the slice header's literal text in favour of the built
spec it points at — flagged here, not silently.

## 5. Sketch snapping (S13 folded in)

`sketchWorkspace.ts`'s mutators already grid-quantize (`snap(value, grid)` at 4px). What v0.1 never
had is **alignment**: snapping to other elements' edges/centres and the sheet's own centre, within
6px, with a storm alignment line drawn on each held axis, and the status line reporting the exact
snapped coordinate (`"snapped to x 32 and y 128"`). This build ports the concept's `snapTo` function
(`:1280-1287`) as a pure, DOM-free function (`resolveSnap(dragged, others, sheetSize, threshold)`)
so it is unit-testable without a browser, then wires it into `SketchSheet`'s pointer-move handler
in place of the current bare `snap(value, grid)` call. Drawing (not just moving) still snaps to the
grid only, matching the concept's own split (draw = grid-only via `snap4`; drag-to-move = grid then
alignment).

## 6. Floor items this chassis must keep passing

Everything `docs/team/v0.1/CHASSIS.md` already bound, unchanged: no text under 11px unpaired;
`--faint` only for provenance; at most one thing moving at rest (the status pip, only while
building); every motion inside `prefers-reduced-motion: no-preference` except the `--t-oath` hold;
hairlines at rest, shadows only on lift; one ember act at a time (Ready while draft, Build while
ready — never both, and the Prompts tab's own Build button is hidden whenever the card is open, so
there is never a second ember control on the page); the two-move rule; one `printed` affordance per
off-default surface. `tongue.test.ts`'s banned-word list is unchanged (it already carries `seed`
and `recording`); this build is the first to prove the ban in its own copy, per §3 above.

## 7. File map (intended)

```
packages/bench/src/
  chassis/
    Chassis.tsx / .css / .test.tsx        — rewritten: rail | plate(+advanced drawer) | column, status line row
    Rail.tsx / .css / .test.tsx           — rewritten: Point · Sketch · Hand + Advanced switch
    RightColumn.tsx / .css / .test.tsx    — new: Prompts · Inspect · Design system tabs (replaces PropertiesColumn)
    StatusLine.tsx / .css / .test.tsx     — new: Claude's one line + logbook trigger
    AdvancedDrawer.tsx / .css / .test.tsx — new: houses SimStrip/spine/rulers-guides/mirror/Fixtures/Toolpath/MCP
  prompts/
    types.ts                              — new: local Prompt/PromptTarget/PromptContext/BuildStreamEvent seam
    api.ts / .test.ts                     — new: fetch client against S11's routes, degrades honestly
    usePrompts.ts / .test.ts              — new: list/hand-prompt state + WS build-event stream
    PromptCard.tsx / .css / .test.tsx     — new: the loop's one control surface
    placeCardPosition.ts / .test.ts       — new: pure port of the concept's placeCard algorithm
    useReadyHold.ts / .test.ts            — new: the ~800ms held gesture, reads --t-oath live
    PromptsPane.tsx / .css / .test.tsx    — new: grouped list + prompt-in-hand (right column's Prompts tab)
  plate/LoupeReadout.tsx                  — renamed InspectPane.tsx (content unchanged; Inspect tab)
  sketch/
    resolveSnap.ts / .test.ts             — new: pure alignment-snap function ported from the concept
    SketchSheet.tsx                       — edited: wire resolveSnap into the drag handler
  tools/toolState.ts / .test.ts           — edited: Tool = 'point' | 'sketch' | 'hand'
  toolpath/ToolpathBar.tsx                — edited: "tracing" copy, not "recording"
  fixtures/FixturePanel.tsx               — edited: "key" label, not "seed"
  tongue.test.ts                          — unchanged list; new surface text checked against it
```

Every v0.1 file not named above as rewritten/edited is either reused verbatim (Panel, Chip, Ladder,
Pairing, SimStrip, PlateBench/PlateFrame/PlateGuides/PlateRulers/usePlateBridge/usePlatePoll,
GaugesPanel/resolveGaugeUsage, TrialFitMirror/snapshotHighlight/useAutoSnapshot, CommandPalette,
Logbook, useJigState, ToolpathBar/useToolpathRecorder/useToolpathReplay, ShopLane/TrayRegion's
underlying data model where the Advanced spine still needs ladder rendering) or retired from the
default view and only reachable under Advanced, per the table in §1.
