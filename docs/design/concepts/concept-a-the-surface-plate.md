# Concept A · The Surface Plate — the CAD chassis

One self-contained mockup: [concept-a-the-surface-plate.html](concept-a-the-surface-plate.html).
A **sim**: no server, no proxy, no model, no MCP. The app on the plate is *Ledger · SIM*, a
pretend third-party Angular invoicing app drawn in its own token file, so the loupe has
something honest to name. Every fake is labeled SIM; the SIM strip is the only clock.

**Designed for 1440×900.** Open it from disk at that size. Body scroll is off — it is a
cockpit, one screen; the plate and the panes scroll inside their own frames.

## The bet

**The app is the subject and the chrome is instrument.** Every benchtop Matter named —
Photoshop, Illustrator, CAD — puts the work large in the middle and hangs tools off the edges,
and none of them ever lets the chrome look like the work. So: a tool rail on the left (Hand ·
Loupe · Mark · Fixture · Toolpath · Sketch), the **plate** filling the centre with the clamped
app inside a hairline frame, rulers and guides that read in the *app's* pixels and snap to its
4px gauge grid, a properties column on the right that says what the loupe sees, and the
work-order tray as a bottom drawer. The one demand on the screen is the ember RELEASE, and it
is held. Nothing else is saturated — the loupe, guides, connection and lit gauges are storm
*hairlines*; the shop is wyrd; gold is one ring on the rung an oath was held on.

The second half of the bet: **the plate tells the truth about the subject.** The loupe names the
component as the survey named it (`InvoiceRowComponent ‹ DataTableComponent ‹ InvoiceListComponent`),
its selector, its file, its inputs and outputs, and the gauges it borrows — and the tag on the
plate says *456×40 @ 184,220 · off the 4px grid by 2.0px (w)*, because the app's table header
is 33.8px tall and Jig should say so rather than round it away.

## What it champions

- **F8 · the loupe names the component, the survey names the file.** Hover with the Loupe and
  the pointed element outlines in a 1px storm hairline, four guides run to the rulers, the
  rulers read the snapped app coordinate, and the right column shows crumbs, selector, file,
  kind, inputs, outputs and gauge chips. Click and it is pinned (dashed) with *let go*.
- **F6 · one mark, one work order, two faces.** A click places a numbered scribe mark and opens
  the tray with the order: the **human face** (what · why · where · acceptance · fixture) drafted
  by the model — *drafting… ~1s · local · nothing leaves the machine · SIM* while it thinks — and
  the **shop face**, empty until release, then filled in the Angular idiom: files to touch,
  patterns the survey found, tests to write, the fixture served on `GET /api/invoices`, and
  *done when*. The file name `0001-status-days-column.md` is the order's provenance line.
- **Law I.2 · RELEASE is held.** Press and hold ~800ms (`--t-oath`); a ring fills linearly under
  the finger; the button lifts to z3 and earns its one shadow while held. Let go early and the
  tray says *released before the weight — 305ms of 800; nothing written* and the state does not
  move. Hold through and the order is **released**, the rung takes a gold outline, the file is
  written (SIM), and the ladder walks on its own: **in the shop** (Claude Code picked it up
  over MCP — a wyrd chip, the one pulsing pip on the page, and only while the shop is live)
  → **trial fit** (an ok chip and *show the trial fit*).
- **The ladder is on every order** — marked → drafted → released → in the shop → trial fit —
  five pips and five words, current in ink, done in dim, the oath rung ringed in gold.
- **F11 · the trial fit is a mirror.** BEFORE beside AFTER, both frames at 50% so both fit the
  plate, the after frame un-hiding only *its own* order's change (the Days column, the
  due-this-week pill, Mark paid, the due hint — one per drafted change). The zoom row still
  works inside the fit; *printed* returns to one frame at 100%.
- **F12 · Gauges are two-way lit.** The right column's Gauges tab lists the survey's tokens by
  colour · type · space · radius · shadow · motion · z, each with its variable, value and
  instance count. Hover a component and its gauges light in the tab; click a gauge and every
  use on the plate takes a dashed storm outline with a count. *printed* unlights.
- **F10 · a fixture fills the form the way Angular listens.** Pick one on the right and the
  form fills with labeled data (a SIM tag on every filled field), the rows are served from the
  fixture, and the frame tab says which fixture and its reproducibility key. *invoice-empty*
  shows the app's own empty state.
- **Toolpath record / replay.** Record captures plate clicks as component steps; replay walks a
  ghost pointer through the recorded steps with each target outlined — the only time anything
  moves on the plate, and it is a live process with a stated length.
- **F9 · Sketch is a mode of the plate.** The rail's Sketch swaps the frame for a sheet drawn
  with the app's gauges: a *Payment reminders* screen as gauge-labeled boxes on a 16px
  (`space.4`) grid, a palette (box · text · button · hotspot), click-to-add snapped to the
  grid, and a hotspot that links back to a screen that exists.
- **Law II.2 · the Halls on Ctrl/⌘+K.** One move to invoke, one to name: tools, the tray,
  Logbook, Gauges, every work order, every trial fit, every fixture, every gauge, every
  surveyed component. Word-AND matching, arrow keys, Enter, Esc. z5: the one deep shadow.
- **Law II.7 · the Logbook.** Every mark, draft, release, shop report, fixture, replay, sketch
  edit and printed lands as a row with who (human · model · shop · bench), what, provenance and
  an age. Filterable by who, with *printed* to show all.
- **Law II.1 · the scrap bin.** *scrap this mark* composts an order — counted on the tray handle
  with *put back*. Nothing deletes.
- **F14 · the tongue, paired at first encounter.** Rail tooltips (*Loupe — point at anything and
  see what it is · L*), the plate's mode line, the Halls' pairings, the panes' titles.

## Register

The `:root` block is `design-book/tokens/starter.css` **byte-for-byte** (a `Buffer.includes`
check finds it exactly once, 4,090 bytes, CRLF and header comment intact). Everything after
the END marker is `var()` over that block; a grep for raw colour literals after the marker finds
none in Jig's chrome. The only literals are the **`.ledger` block — the subject's own token file
as the survey read it** (`--lg-*`, deliberately not Jig's, labeled so in the file) and the
GAUGES data table that displays those same values. Obsidian & Ember, dark first (F13).

Motion by mass class: hover acks and chip lights on `--t-feather`; the tray caret on
`--t-slab`; the tray drawer and the replay ghost on `--t-stone` with `--ease-settle` (stone,
a drawer of record); RELEASE on `--t-oath`, linear. `--ease-spring` is never used. The drawer,
the ghost and the shop pulse sit inside `prefers-reduced-motion: no-preference`; the token
zeroing handles the rest; `--t-oath` stays.

## Honest costs / frictions

- **Three columns and a drawer at 1440×900 is dense.** With the tray open the plate shows about
  424px of the app's 600 and scrolls; the human face scrolls internally for a long draft (the
  RELEASE is pinned at its foot so the demand never scrolls away). Whether this is a cockpit or
  a crowd at hour ten is Matter's call, not mine.
- **The trial fit at 50% shows the subject's type at 6px on screen.** That is the app zoomed
  out — the mirror needs both frames on one plate — and the zoom row brings either side to
  100% in one click. Jig's own labels inside a scaled frame counter-scale (`--inv`) and stay at
  11px. Item 3 is met by the chrome; the subject at half scale is disclosed, not hidden.
- **The grid honesty line will be noisy on a real app.** Ledger's table header is 33.8px, so
  every row reads *off the 4px grid by 2.0px*. That is the truth, and it is also what every
  real Angular app will look like. A build wants a tolerance and a way to say "the survey's
  grid is 4px but this app rounds".
- **The subject carries one shadow at rest** — its own `--lg-shadow-card` on the detail card,
  a gauge the survey found and the Gauges tab lists. Jig's chrome carries none. A verifier
  counting `box-shadow` on the page will count 1; that 1 is the app's, and stripping it would
  make Jig lie about the subject.
- **Marks are points, not regions.** Click places a mark on the component under it; there is
  no drag-a-rectangle mark for "this gap" or "these three".
- **The toolpath replays on the before frame only** in the sim; F11's "replays on both" is
  claimed in the pane's provenance line and not built.
- **The Hand has no pinch**; Ctrl+wheel steps the four scales. Drag pans.
- **Two tongue pairings changed.** The commission pairs *Bench* with "workspace" and *Release*
  with "approve it", and both plain words sit in the banned column. I paired Bench with *one
  clamped repo* and Release with *hold to sign the order off*. And fixtures show a
  reproducibility **key**, never the banned word for it. The subject's file path
  `src/styles/_tokens.scss` contains a banned word; it is the subject's path, not Jig's tongue.
- **The SIM timings are fiction**: 1.1s to draft, 1.4s for the shop to pick up, 4.2s to build.
  A real Qwen draft on the 4060 and a real Claude Code build will not feel like this.
- **The light subject is the brightest thing on the screen.** Deliberate — it is the subject —
  but a dark target app would change the whole balance of the plate, and Matter's real apps
  may be dark.
- **Ages re-read every 30 seconds** (text, not motion) and the SIM clock every 15; both are
  timers, disclosed here because the floor asks what moves at rest, and these change text
  without moving anything.

## Floor self-check (`docs/DESIGN-TEAM.md` §6 — measured in the page, not aspirational)

**Instrument:** headless Chrome 152.0.7977.76 over raw CDP from Node 24 (no libraries),
`Emulation.setDeviceMetricsOverride` 1440×900, focus emulation on. Two legs: normal, and
`prefers-reduced-motion: reduce` emulated. Twenty-six probes on the normal leg (rest → hover →
marked → drafted → 300ms hold → 1000ms hold → shop → fit → printed → second mark → scrap → put
back → fixture → replay → gauge lit → sketch → Halls → logbook) and four on the reduce leg;
every probe reads computed styles, `getBoundingClientRect`, `document.getAnimations()`, and the
page's own state. Zero page exceptions and zero console messages from the page across both
legs (the one log entry is the local static server's `favicon.ico` 404). The script and its
JSON live in the session scratchpad, not the repo — this concept delivers two files.

| # | Item | Verdict | How it was measured in the page |
|---|---|---|---|
| 1 | ink/dim ≥ 4.5:1 on the bg ladder | pass | computed tokens → WCAG ratio: ink 15.70 / 14.81 / 13.58 / 12.06 on bg0–bg3; dim 7.66 / 7.23 / 6.63 / 5.88. Subject's own pairs all ≥ 4.71 (lg-warn on lg-bg the tightest). |
| 2 | faint never load-bearing | pass | 11 faint text nodes at rest, enumerated: six rail key letters (echoes of the tooltip's shortcut), the `4px` grid note, the ruler corner `px`, two separators, the survey provenance line. Later states add ages and the order's file name in the face head — provenance. Ladder rungs were faint in an early build and were moved to dim because the path ahead is load-bearing. |
| 3 | nothing under 11px without the pairing | pass | transform-aware on-screen size (authored px × ancestor scale): smallest Jig chrome text **11.00px in every probe**, 0 under 11 — including tab labels, ruler readouts, chips, ladder words, and the counter-scaled labels inside 50% frames. Subject's own type: 12px at 100%; 6.00 at the 50% trial fit (disclosed above). |
| 4 | reduced motion mandatory | pass | differential: elements with non-zero transition/animation duration = 9–27 on the normal leg, **0 in every reduce-leg probe**; `getAnimations()` = 1 (shop pulse) in the shop state normal, **0** under reduce; `--t-oath` stays 800ms and the hold still gates (310ms → cancelled in words; 1000ms → released → in the shop) under reduce. |
| 5 | touch targets ≥ 44px on phone surfaces | n/a (desktop) | 15 Jig controls visible at rest; smallest 20×32 (the scale row). Marks 24×24 at every zoom (counter-scaled). Not a phone surface; recorded, not claimed. |
| 6 | colour never alone | pass | every chip = dot + words; ladder = pip + word; marks numbered; loupe = outline + text tag; RELEASE = ring + *release · hold*; shop = wyrd + *in the shop* / *building*; connection = storm + *connected*; lit gauge = dashed box + `name · N×`. |
| 7 | colours from the token file | pass | grep after the END marker: 0 raw literals in Jig chrome; the `.ledger` block is the subject's own token file and the GAUGES table displays it. |
| 8 | new surface starts from `tokens/starter.css` | pass | `Buffer.includes(starter.css)` true, exactly once, 4,090 bytes, byte-for-byte (the awk diff that first said otherwise was a CRLF artifact of the extraction). |
| 9 | Obsidian & Ember base | pass | same block; no departure token added. |
| 10 | irreversible = held with deepening | pass | 300ms hold: state stays `drafted`, tray says *released before the weight — 305ms of 800; nothing written*; 1000ms hold: `released` → `shop` at +1.4s → `fit` at +5.6s. Ring fill is `stroke-dashoffset` over `--t-oath`, linear. |
| 11 | no confirm-dialog as weight | pass | `confirm(` / `alert(` calls in the file: 0. |
| 12 | no bouncy easing on consequential objects | pass | `--ease-spring` uses after the token block: 0; RELEASE linear; tray `--ease-settle`. |
| 13 | one saturated mass | pass | ember-coloured nodes by computed colour: **0** at rest, hover, released, shop, fit; **5 nodes of one control** (`#release`, its ring, two circles, the *hold* span) whenever exactly one drafted order is picked; 0 again after release. The loupe tag is a hairline label (it was a filled storm bar in an early build). |
| 14 | no silent soft-locks | pass | in words: *released before the weight…*; RELEASE disabled with *drafting… ~1s* beside it; *Nothing under the loupe — move over the plate*; *nothing on the shelves for "…"*; *No invoices yet — the empty state*; *No work order picked*; *no visible change: the skeleton order had no words*; *Hand — the app takes your clicks*. |
| 15 | hard-delete never the default | pass | no delete anywhere; *scrap this mark* → scrap bin counted on the tray handle → *put back*. Measured: marks 2 → 1 → 2. |
| 16 | two-move rule | pass | Ctrl+K → type `gauge primary` → Enter: Halls open (12 shelves), 2 matches, Enter closes the Halls, selects the Gauges tab, lights 1 row and 4 uses on the plate. |
| 17 | no hidden staleness | pass | ages on every logbook row and order (`now` / `9s` / `12s`, re-read every 30s); *read 11:41* on the survey; *released 7s ago*; the SIM strip is the only clock and says so. |
| 18 | red badges never the only strain signal | pass | no badges; `--alert` appears once — the record button while recording, with the word *stop*. |
| 19 | nothing buried without a handle | pass | tray handle with count and summary; three tabs with counts; *let go* on a pinned loupe; scrap bin *put back*; the Halls list every order, gauge, component, fixture. |
| 20 | ack ≤ 16ms · local < 100ms · > 300ms shows charge with cost | pass | every ack is a class toggle in the same frame; the drafter shows *drafting… ~1s · local · nothing leaves the machine*; the shop shows *building · ~4s*; replay shows *~2.1s*. |
| 21 | nothing blocks a surface it doesn't own | pass | only the Halls veils the page, and it owns it: Esc, the veil, or a pick closes it. Panes and the tray never block the plate. |
| 22 | no blocking entrance · spinner without cost · lying skeleton · alarm-styling | pass | no entrance animation, no spinner, no skeleton; the one pulse is a live process with words beside it. |
| 23 | at most one thing moving at rest | pass | `getAnimations()` = **0** in every resting probe; 1 while the shop is live (the pip); 2 for 400ms while the drawer opens (an ack, not rest). |
| 24 | one affordance back to printed value | pass | *printed* on the plate (scale, frames, fixture), Gauges, Logbook filter, Fixture pane, Sketch pane — each appears only when its surface is off-default. Measured: fit 2 frames → 1; lit 1 → 0; sketch 8 → 7; fixture tag cleared. |
| 25 | no auras, no neon, no lens flare | pass | outlines 1px, dashed lit boxes, no blur, no glow; the loupe tag is a hairline. |
| 26 | shadows earned, not default (files, does not block) | pass | `box-shadow ≠ none` count: **1 at rest — the subject's `--lg-shadow-card`** on its own detail card (Jig chrome 0); **2** while RELEASE is held (z3, `--shadow-held`) or the Halls are open (z5, `--shadow-overlay`); the gold oath ring is an `outline`, not a shadow. |

Overflow: `scrollWidth` 1440 = `innerWidth` in every probe of both legs (a 4px overflow from the
Toolpath tab label was found and fixed by the run).

## Commission rows this concept answers

F1 (the shop chip *Claude Code · connected*; the order picked up over MCP) · F2 (Angular + .NET
survey, `ng` selectors, `openapi/v1.json` data shapes) · F3 (`localhost:4200 through the Jig
proxy`; *npx jigbench* in the logbook's first row) · F5 (`.jig/survey/`, `gauges`, `fixtures/`,
`work-orders/NNNN-slug.md`, `toolpaths/`, `sketches/`, `logbook.jsonl`) · F6 (two faces; the
ladder is the frontmatter state) · F7 (*drafted by model · Qwen2.5-Coder-7B via Ollama · local*;
the skeleton order when no words were given) · F8 (loupe → surveyed selector → file) · F9
(Sketch mode) · F10 (fixtures from data shapes; form-fill by input events; `/api/*` served) ·
F11 (the trial fit, two frames) · F12 (Gauges categorized, two-way lit, instance counts) · F13
(starter tokens, dark first) · F14 (the tongue with pairings) · F18 (*nothing leaves the machine*
on the drafter and the logbook) · F20 (the cut list is the loop: survey → gauges → plate → loupe
→ mark → draft → release → file → shop → trial fit → fixture) · F21 (*the shop edits the app;
Jig edits nothing*, said on the shop face).

## What to steal even if rejected

- **The grid honesty line** — *off the 4px grid by 2.0px (w)* on hover: the survey speaking
  about the subject at the moment you point at it.
- **Counter-scaled chrome (`--inv`)** — Jig's labels inside a zoomed frame stay printed size
  while the app zooms; item 3 holds at 50% for free.
- **Pinned face actions** — the one demand never scrolls away, however long the draft.
- **Rulers whose origin is the app's origin**, not the frame's hairline.
- **The ladder as five words on every order**, with the oath rung ringed by an outline.
- **Word-AND matching in the Halls** over label + pairing + kind — the first substring filter
  found nothing for "gauge primary".
- **A reproducibility key** as the fixture's tongue.
- **Scrap bin with a count and *put back* on the tray handle.**
- **A trial fit that enters at 50% and leaves the zoom row live.**

Not ruled — Matter rules at 1440×900.

## Verdict — 2026-09-05

**CHASSIS** (Matter). The bench is built on this arrangement; B's spine and shop lane and C's mirror + scrubber are stolen into it. Build brief: `jigbench/docs/team/v0.1/CHASSIS.md`.
