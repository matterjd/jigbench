# LOOP-TEST-RUN — Part 2, rewritten for the loop (S12)

> `docs/team/v0.1/TEST-RUN.md` stays as the v0.1 record (S15 rewrites it for 0.2.0 in full). This
> file is S12's own retest script for the quiet bench: Point → prompt card → Polish → Ready →
> Build → Built → before, then the Advanced tour. Every label quoted below is copied verbatim
> from the running build (`npx jigbench --repo . --target http://localhost:4200` against
> `examples/ledger-angular`, `ng serve` on 4200), not the concept mockup — where the mockup and
> the build differ (there is no live S11 server on `main` yet), the step says so.

## Before you start

```bash
cd examples/ledger-angular
npm install            # first time only
node ../../packages/cli/dist/bin.js survey --repo .
npx ng serve --port 4200 &
node ../../packages/cli/dist/bin.js --repo . --no-open --target http://localhost:4200 --port 4600 --plate-port 4601 &
```

Open `http://localhost:4600`. Test at **1440×900** first, then **1280×720** — geometry differs,
overflow must not, at either.

## 1. The rail — Point · Sketch · Hand

- Exactly three tool buttons, `aria-label`s: `"Point — click a component to open the prompt
  card"`, `"Sketch — a screen that does not exist yet, drawn with the app's gauges; the sheet is
  a prompt target"`, `"Hand — the app takes your clicks; drag scrolls the plate"`. No Loupe, Mark,
  Fixture, or Toolpath button anywhere on the rail.
- **Point is active at rest** (`aria-pressed="true"`) — the built spec's own default, not Hand.
- `P` / `S` / `H` switch tools; `Esc` returns to Hand from anywhere.
- The Advanced switch sits at the rail's foot, labelled `"Advanced"`, off at first visit. It
  persists for the session (`sessionStorage['jig-advanced']`) — reloading the tab keeps it as you
  left it; a fresh tab starts quiet again.

## 2. The plate — no rulers, no guides, until Advanced says so

- With Advanced off: no ruler bands, no corner `px` label, the app fills the plate edge to edge.
  Confirmed live: `document.querySelector('.jig-plate-rulers')` is `null`.
- Point at a component (the loupe script's hover) and click it: a **prompt card** opens beside the
  selection.
  - Card title = the component's name (e.g. `PageHeaderComponent`); the file path line under it.
  - Anchoring, measured live at 1440×900 on a selection at plate-local `(24,24,300,40)`: card
    lands at `left: 336px` (`= 24 + 300 + 12`), `top: 24px`, `data-where="beside"` — matching
    `placeCardPosition`'s own contract exactly. Re-measured at 1280×720 on the same selection:
    identical `left`/`top`, card fully inside the viewport, no page scrollbar
    (`scrollWidth/Height` = the viewport at both sizes).
  - A selection with no room on any side (rare on this fixture; reproduced in
    `placeCardPosition.test.ts` instead) sits over the plate's corner.

## 3. The card — what should change here?

- Typing in the requirement field lights the **Ready** button ember
  (`.jig-prompt-card__oath--ember`) as soon as there are words — even though `/api/prompts`
  doesn't exist on `main` yet (S11 isn't merged here): the card treats a non-empty local draft as
  `draft` state regardless of whether anything persisted server-side. Confirmed live: after typing
  `"show days overdue beside the due date"`, the Ready button carries the ember class and is not
  `disabled`.
- **Polish** only appears when `wiring.drafter === 'wired'` — on this fixture (`drafter: stub`)
  it's absent. Not independently re-verified with a wired drafter this pass (no local model on
  this desk during the run) — covered by `PromptCard.test.tsx`'s own Polish-visibility tests
  instead.
- **Ready** is the one held gesture (~800ms, `--t-oath`, read live). Full hold → onComplete;
  release early → `"let go early — still a draft · <elapsed> ms of <total>"`. **Not independently
  re-driven live this pass** — the Browser pane's `computer` tool (CDP-driven mouse clicks) did
  not register `onPointerDown` on this button in this session (confirmed: `element.click()` via
  `javascript_tool` DOES fire other handlers correctly, e.g. the Advanced checkbox; a bare CDP
  click does not reach this specific pointer-events listener). The mechanic is exhaustively
  covered by `useReadyHold.test.ts` (6 tests) and `PromptCard.test.tsx`'s hold tests (using
  testing-library's `fireEvent.pointerDown`, which dispatches real events React's pointer-event
  plugin does process) — see the worker report's CONCERNS for the exact instrument gap.
- **Build** appears only once a prompt is `ready`, replacing Ready as the card's one ember act
  (never both). Clicking it posts `/api/prompts/:id/build` — on `main` (no S11) this 404s and the
  card stays as-is; against a real S11 server it would move to `building` and start streaming.

## 4. The right column — Prompts · Inspect · Design system

- **Prompts** (default tab): with no S11 route, the pane reads exactly `"the bench is ahead of its
  server — prompts arrive with S11"` — never a blank pane, never a spinner. Confirmed live.
- **Inspect**: shows the last Point pick's component/file/tag/text, its gauges (chips, clickable),
  and its routes by exact component-name match. Endpoints/docs read an honest dash (`"— not yet
  correlated to a component by the survey"` / `"— none matched"`) — the survey schema has no
  per-component link for either yet.
- **Design system**: the existing Gauges panel, unchanged — 24 gauges (`10 colour · 6 type · 5
  space · 3 radius · 1 shadow · type ramp`, per this fixture's survey), two-way lit with the
  plate.

## 5. The status line

- `Claude · not installed` on this desk (no `claude` on PATH during the run) — the honest branch,
  not a build error.
- Click opens the logbook drawer (present; the logbook itself has no event source wired in this
  slice — see CONCERNS).

## 6. Advanced, switched on

Toggling the rail's Advanced switch (`element.click()` — the pane's CDP click did not register on
this checkbox either; see §3's note) reveals, in one drawer under the plate:

- The **SIM strip** equivalent — `SimStrip`, reading real wiring: `survey: wired · proxy: wired ·
  drafter: stub · shop: none · fixtures: none · toolpath: none · sketch: none` (this fixture's
  actual state, not a canned string).
- **The spine** — every live prompt on its four-rung ladder (draft · ready · building · built);
  `"no prompts yet"` when there are none (true on a fresh clamp, since nothing here persists
  without S11).
- **rulers & guides** and **the mirror — before | after** switches, both present and controlled.
  Turning rulers & guides on (via `element.click()`) shows the top/left ruler canvases and offsets
  the plate viewport by the ruler band; turning it off returns the app to filling the plate edge
  to edge — confirmed both ways live.
- **Fixtures** — the existing panel, its create-form field now reads `"key (optional)"`, never
  `"seed"` (confirmed live in the DOM text).
- **Toolpath** — record / replay, unchanged; confirmed it never renders the word "recording" as
  visible text (only "record"/"stop" button labels).
- **MCP — the secondary door** — `"none connected"` on this run (no MCP client attached), plus the
  `"Build runs Claude Code itself…"` explanatory line.

Switching Advanced off collapses the whole drawer back to nothing (`.jig-chassis__advanced-slot`
renders empty) — confirmed by class presence/absence, not just visual judgement.

## 7. Sketch — real snapping

- Switch to Sketch; with no sketch open yet, the honest `"no sketches yet."` empty state, a name
  field, and `"new"`.
- Creating one opens the sheet (`aria-label="sketch sheet"`), sized to the window at creation time,
  plus a `"build this screen →"` button in the tab bar (calls back into the same prompt-card flow
  with `target.kind === 'sketch'`).
- **Snapping, live and exact:** placed a 160×96 box at `(32,128)` (element A) and a second at
  `(400,400)` (element B), then dragged B toward A's right/top edge. Mid-drag: B lands at
  **exactly `(192px, 128px)`** — both multiples of 4 — with **exactly 2** alignment lines on
  screen (one vertical at A's right edge, one horizontal at A's top edge). On release: both lines
  clear. This reproduces `SketchSheet.test.tsx`'s own jsdom scenario byte-for-byte in a real
  browser, and matches the floor pass's own worked example on the concept
  (`snapped to x 32 and y 128`) in spirit (different coordinates here, same mechanism, same
  "closest edge within 6px, else the raw 4px grid" contract).

## 8. Floor spot-checks, measured live (not aspirational)

| Item | Measured | Result |
|---|---|---|
| At most one thing moving at rest | `document.getAnimations().length` at the default view | **0** |
| One saturated (ember) mass | Count of `button`/`[role=button]` elements whose color/background/border includes the ember RGB, with a draft that has words | **1** (`.jig-prompt-card__oath--ember`) — never 2, since Build only appears once Ready is gone |
| Nothing under 11px in Jig's own chrome | Page-wide min effective `font-size` scan, ignoring the cross-origin plate iframe (unreachable from the parent document) | **11px** exactly, after this pass's own fix (was 10.5px on the rail's "Advanced" word — see CONCERNS) |
| No rulers/guides by default | `.jig-plate-rulers` presence at rest | **absent**, after this pass's own fix (was always present — see CONCERNS) |
| No horizontal/vertical page overflow | `scrollWidth`/`scrollHeight` vs `innerWidth`/`innerHeight` | Equal at both 1440×900 and 1280×720 |

Two pre-existing sub-11px instances were found and are **not** regressions from this slice: the
Chip/SimStrip glyph dots (`●`/`•`, 8–10px) and the Toolpath replay-speed buttons (`0.5×/1×/2×`,
10.5px) — both live in v0.1 components (`Chip.tsx`, `SimStrip.tsx`, `ToolpathBar.tsx`) reused
verbatim per this slice's own CHASSIS.md v0.2 file map. Recorded here, not fixed — out of the
named scope for this pass.

## Stopping

```bash
# find the PIDs on 4600 (bench), 4601 (plate proxy — same process as 4600), and 4200 (ng serve)
netstat -ano | grep -E ":4600 |:4200 "
taskkill //PID <pid> //F      # for each
rm -rf examples/ledger-angular/.jig
```
