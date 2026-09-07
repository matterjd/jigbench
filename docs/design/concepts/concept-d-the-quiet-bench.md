# Concept D · The Quiet Bench — the amendment round

One self-contained mockup: [concept-d-the-quiet-bench.html](concept-d-the-quiet-bench.html).
A **sim**: no server, no proxy, no model, no MCP. The app on the plate is *Ledger · SIM*, the
same pretend third-party Angular invoicing app concept A clamped, drawn in its own token file so
Point has something honest to name. Every fake is labeled SIM; the status line's clock is the only
clock and says so. The brief is [AMENDMENT 1](../../../jigbench/docs/design/AMENDMENT-1-the-simplification.md)
— rows **A1–A4**, the tongue as amended (§3), the default view (§4) — with every
[COMMISSION](COMMISSION.md) F-row the amendment does not name still binding.

**Designed for 1440×900 and built to hold at 1280×720.** Open it from disk at either size. Body
scroll is off — a cockpit, one screen; the plate and the panes scroll inside their own frames.
Both sizes were measured, not eyeballed (the floor section has the numbers).

## The bet

**The loop is the whole surface, and every other instrument is one toggle away.** Matter drove
v0.1 and said *"very cluttered but I love all the tooling"* and *"I mainly want to select
sections, write out a requirement from a PM, it saves that as a serviceable prompt, we kick that
prompt off."* D takes him literally. What is on screen at rest is exactly what that sentence
needs: a rail with **Point · Sketch · Hand**, the app large and clean on the **plate**, one right
column with **Prompts · Inspect · Design system**, and one status line that says what **Claude**
is doing. Nothing else. No helm, no rulers, no guides, no grid texture, no SIM strip, no zoom row,
no tray, no tabs of tools. The chrome is A's bones with everything that is not the loop removed.

The loop itself lives on one card. Point at a component, click, and a **prompt card** opens beside
the selection — never over it — with one field (*what should change here?*), an optional
acceptance list, **Polish**, **Ready** (held), and once ready **Build**. The card is the only place
ember appears, and only one of its two acts is ember at a time: Ready while the draft has words,
Build while it is ready. Build runs Claude Code itself (A1); the status line, the Prompts list and
the logbook all advance from the same stream; **Built** puts *before* one click away.

The second half of the bet is that **nothing was lost**. Rulers and guides, fixtures, the
toolpath, the two-plate mirror, MCP status, the spine and the scrap bin all survive, behind the
**Advanced** switch at the rail's foot, off by default. Switch it on once and every v0.1 part is
there in a drawer under the plate; switch it off and the bench is quiet again. Density is the enemy
this round, so whitespace is treated as a feature: if two things competed for a pixel, the loop won.

## What it champions

- **A1 · Build runs Claude Code itself.** The card's **Build** (ember once the prompt is ready)
  starts a SIM `claude -p` in the clamped repo with the prompt file. The stream is a wyrd monospace
  ribbon in Prompts (*reading invoice-detail.component.ts · editing invoice-detail.component.html ·
  running ng test · 41 passed · 3 files changed · exit 0*) with elapsed time; the status line
  reads *Claude · building · 00:02 · editing invoice-detail.component.html*; every editing/test step
  lands in the logbook as a Claude row; it ends *Claude · built · 3 files · 0m 06s*. The one
  pulsing thing on the page is the status pip, and only while this runs. MCP is the **secondary
  door**: *connected: Claude Desktop · SIM* under Advanced, never on the default view.
- **A2 · Polish on demand.** The card shows **Polish** because the SIM says a local model exists
  (Qwen2.5-Coder-7B via Ollama, named under Advanced). Nothing fires by itself. Press it and the
  card says *polishing · ~1.5 s · local · nothing leaves the machine · SIM*; 1.5 s later the words
  are tightened, three acceptance lines are added, and *your words* puts the original back (Law
  II — nothing is overwritten without a way back). Polish never renames the file.
- **A3 · the loop only.** Rail: three tools plus the Advanced switch; the wordmark glyph says the
  bench on hover. Right column: three tabs. Status line: Claude's word and the SIM clock. Measured
  at rest: 10 visible controls in Jig's chrome, one shadow on the page (the subject's own card),
  one `--faint` text node (a separator). Everything else is behind Advanced.
- **A4 · the artifact is a Prompt.** `.jig/prompts/NNNN-<slug>.md` on the card's foot from the
  first words (*0003-show-how-many-days.md · draft · saved now*), the slug from the human's words
  with stop-words dropped. States **draft → ready → building → built**, plus a collapsed
  *scrapped* count. The Prompts tab shows the requirement, the acceptance, the **context block Jig
  appends** (component crumbs · file · selector and instances · gauges · routes · endpoints ·
  matching doc chunks — all SIM), the stream, and the Built line.
- **§3 · the tongue as amended.** Prompts · Inspect · Design system · Point · Ready · Build ·
  Built · Claude are the words on the surface; *bench · clamp · survey · plate · sketch · logbook ·
  scrap bin* are unchanged; each shop word pairs with its plain word on first encounter (the rail
  tips, the card's placeholder, the palette rows). Nothing on the surface is named with a banned
  word.
- **§4 · the prompt card is anchored, and it never covers the selection.** Placement tries beside
  (right, then left), then below, then above, and only then the plate's corner — and in the corner
  case it says so in words. It re-places itself whenever it grows (Polish, acceptance, the stream)
  so it is never off-screen: at 1440×900 the built card is 649px tall and sits at y 101 inside the
  872px plate; at 1280×720 it is 668px at y 16 inside a 692px plate.
- **Ready is the one held gesture.** ~800 ms read live from `--t-oath`; a ring fills linearly; the
  button lifts to z3 and earns its shadow while held. Release early and the card says *let go early
  — still a draft · 303 ms of 800*; hold through and the pip takes a gold ring, the card says
  *ready — the file is the prompt Claude will get*, and Build becomes the ember act.
- **Built, with *before* one click away.** A small switch on the Built line swaps the plate to the
  release snapshot (the build's change hidden, not removed — the frame tab says *before 0003 · the
  snapshot*) and back; *printed* on the plate returns everything. *refine — go again* opens a new
  draft on the same target with the words pre-filled, which is the loop's second lap.
- **Inspect** shows the selection's crumbs (`InvoiceDetailComponent ‹ InvoicesPageComponent ‹
  AppComponent`), file, selector with instance count, tag, text, the gauges it uses as swatch
  chips (hover a chip and every use lights on the plate), its routes, endpoints and matching docs.
- **Design system** lists 24 gauges in six categories (colour · type · space · radius · shadow ·
  motion) with live use counts. Two-way lighting stays: hover a component and its gauges' rows
  light; click a gauge and every use on the plate takes a dashed storm outline with the name
  (color.primary → 3); *printed* unlights.
- **Sketch snaps.** The plate becomes a sheet at the app's size, drawn only with the app's
  gauges (`--lg-*`): box · text · button · input · list. Drag to draw on the 4px grid; drag an
  element and it snaps to the grid, then to other elements' edges and centres (and the sheet's
  centre) within 6px, with a storm alignment line on each held axis while it holds. Measured: a
  132×36 button drawn at 600,400 (every value on the grid), then dragged to *snapped to x 32 and
  y 128* with two lines. Delete scraps to the bin; *put back* returns it. The sheet is a prompt
  target: *build this screen →* opens the card with that title.
- **The palette, two moves.** Ctrl/⌘+K, type, Enter — tools, tabs, Advanced, the logbook, every
  prompt, every gauge, every surveyed component (word-AND matching). z5, the one deep shadow.
- **The logbook is a drawer from the status line.** Click *Claude · …* and the record opens over
  the status line: who (human · Claude · model · bench), what, provenance, age; filterable, with
  *printed* to show all. It is the only place the SIM's history lives, and it remembers the seeded
  build of 0001 (*1m 12s*) from before the file was opened.
- **Advanced, switched on:** the SIM strip; the spine (every prompt on the four-rung ladder, the
  ready rung ringed in gold); rulers & guides (the app's px, guides from the selection's edges);
  the mirror (before | after, two plates at half scale); the scrap bin count with *put back*;
  three fixtures (rows served, the form filled with SIM tags, a reproducibility key); the toolpath
  (record Hand clicks, replay a ghost); MCP status. Off, and the plate is whole again.
- **Esc returns to Hand** — closing whatever is open first (palette, logbook, card), then the
  tool; focus goes back to the plate so the tool keys work again. P · S · H pick tools.

## The default view — at both sizes

| | 1440×900 | 1280×720 |
|---|---|---|
| plate | 1044×872 at (56, 0) | 884×692 at (56, 0) |
| the app's frame | 996×800 at (80, 36) — fills the plate | 836×620 — fills the plate |
| right column | 340 | 340 |
| card, on the invoice detail | *beside* at (419, 101), 340 wide, 364→649 tall, inside the plate | *beside* at (308, 101); built card 668 tall at y 16, inside |
| Advanced on | drawer 264, plate 608; card re-placed beside, inside | drawer 264, **plate 428**; the app (min 560) scrolls inside the plate; card 364 inside |
| mirror frames | 486 + 486 | 406 + 406 |
| sketch sheet | 979×558 | 819×558 |
| overflow | 1440/900 in every state | 1280/720 in every state |

The frame is the plate's size because a real dev server through the proxy would render at the
plate's size — there is no fixed 960×600 stage and no zoom row. The card's `max-height` is the
plate's height less 24px, and it scrolls internally past that.

## Register

The `:root` block is `design-book/tokens/starter.css` **byte-for-byte** (a `String.Contains`
check on the raw bytes finds it exactly once, CRLF and header comment intact). After the END
marker every colour in Jig's chrome is a `var()` over that block: a regex for hex/rgba literals
after the marker finds **10 hex + 1 rgba, all in the GAUGES data table** — the subject's own token
values, displayed — and the `.lg-root` block, which is the subject's token file as the survey
read it. Jig's chrome invents nothing. Obsidian & Ember, dark first (F13).

Motion by mass class: 9 `transition` declarations, every one on a `--t-*` token (hover acks and
chip lights on feather; the ghost on stone with `--ease-settle`); one `animation` (the status
pip's `live-pulse`), inside `prefers-reduced-motion: no-preference`; Ready on `--t-oath`, linear;
`--ease-spring` never used. Under reduce the token zeroing leaves **0** transitioning elements in
every state and `--t-oath` stays 800ms — the hold still gates (312 ms cancelled, 950 ms ready).

Colour voices: **ember** once, the card's next act (Ready, then Build). **Storm** as hairlines
only — hover and selection outlines and their tags, the tool spine, the tab underline, lit gauge
boxes, sketch alignment lines, the MCP connected chip. **Wyrd** for Claude — the status pip, the
stream's spine and text, the building pip. **Gold** three times, all rings: the ready pip in
Prompts, the Ready button once held, the spine's oath rung. No fills. Shadows: 0 in Jig's chrome
at rest; the card (z3 held) while open; the palette and the logbook (z5) while open; the Advanced
drawer is a panel at rest and carries none. The one shadow at rest is the subject's own
`shadow.card`, a gauge the survey found and Design system lists.

## Honest costs / frictions

- **The Advanced switch sits at the rail's foot, not top-right.** §4 says *one toggle in the
  top-right*; the round's brief moved it to the rail's foot, and D has no top bar to put it in.
  It is a small switch with its word, always visible; if Matter wants it top-right the right
  column's tab row has room. Recorded as the one place D departs from §4's letter.
- **The Build button in Prompts appears only when the card is closed.** §4 gives the prompt in
  hand *its Build button*; the brief says the card is the only place ember appears. D honours both
  by showing an ember Build in the Prompts tab for a ready prompt only while the card is not open
  — there is never a second ember on the page. Measured: one control in every state.
- **The SIM's change is canned.** Whatever the words say, a component-target build adds a Days
  column and days-late row; a sketch-target build adds a Reminders route. The stream's last line
  says so in dim. Polish is a template, not a model: it prefixes the component and route, keeps
  the words, and adds three acceptance lines from the context block.
- **A selection larger than the room around it puts the card over its corner.** The whole page
  (AppComponent) and the sketch sheet are the cases; the card says *the selection is larger than
  the room around it — the card sits over its corner; Esc closes it*. Every component-sized
  selection measured landed beside or below with no overlap.
- **The mirror shows the subject at 6px.** Two plates at half scale is the only way both fit; the
  subject's 12px type reads at 6.00 on screen (item 3 is met by Jig's chrome, which counter-scales
  its labels to 11px; the subject is disclosed, not hidden). It lives under Advanced.
- **At 1280×720 with Advanced on the plate is 428px tall** and the app scrolls inside it (the
  frame keeps a 560px minimum). The card still fits (364 inside 428). The drawer could shrink to
  ~200 on short windows; this concept keeps it one height so the drawer's grammar is stable.
- **There is no zoom row and no rulers on the default view.** v0.1's 50/75/100/125 scale is gone
  from the bench entirely — the mirror is the only scaled view. Rulers and guides are under
  Advanced and read the app's px at scale 1 only.
- **The Hand does not drag-pan.** The wheel scrolls the plate; drag-to-pan is not built in the
  sim (the cursor promises it — a dishonesty to fix in a build, not a floor item).
- **The loupe's inputs/outputs and the grid-honesty line are gone.** Inspect shows crumbs, file,
  selector, tag, text, gauges, routes, endpoints and docs — not A's `@Input()`/`@Output()` list
  nor *off the 4px grid by 2.0px*. Both are worth stealing back into Inspect.
- **The toolpath replays on the after plate only**, as in A.
- **The logbook drawer covers the lower third of the plate while open** (left 56 → right 340,
  300px). It does not own the plate; it has a close, and Esc. The right column stays free.
- **Two timers change text at rest:** the SIM clock every 15 s and the ages every 30 s. Nothing
  moves; disclosed because the floor asks what moves.
- **The SIM timings are fiction:** 1.5 s to polish, ~6 s to build. A real `claude -p` will not
  feel like this; the status line's elapsed counter is real time.

## Floor self-check (`docs/DESIGN-TEAM.md` §6 — measured in the page, not aspirational)

**Instrument:** headless Chrome 152.0.7977.76 over raw CDP from Node 24.17 (no libraries), against
the file served over `127.0.0.1` (a `file://` open renders JS-less in the pane). Three legs:
**normal 1440×900**, **`prefers-reduced-motion: reduce` 1440×900**, **normal 1280×720**. Each leg
drives the loop with dispatched events — hover → click the invoice detail → type → a 300 ms hold →
a 950 ms hold → Build → 1.5 s in → built → *before* → *printed* → Advanced → card re-opened →
mirror → Sketch → *build this screen* → Esc·Esc → 700 ms quiet — and reads computed styles,
`getBoundingClientRect`, `document.getAnimations()`, `scrollWidth/Height`. A second pass in the
Browser pane drove Sketch drawing and snapping, the palette, fixtures and toolpath. **0 console
messages and 0 exceptions on all three legs.** The scripts and JSON live in the session scratchpad,
not the repo — this concept delivers two files.

| # | Item | Verdict | How it was measured in the page |
|---|---|---|---|
| 1 | ink/dim ≥ 4.5:1 on the bg ladder | pass | the inherited token block, unchanged: ink 15.70 / 14.81 / 13.58 / 12.06 on bg0–bg3; dim 7.66 / 7.23 / 6.63 / 5.88 (A's measured pairs; same values byte-for-byte). |
| 2 | faint never load-bearing | pass | faint text nodes by computed colour: **1** at rest (the frame tab's separator); 3 with the card open (its file line — an echo of Inspect and the context block — and its foot); 4 typed/ready/built (the hand block's file line); 6 with Advanced on (provenance lines under fixtures and MCP). Every one is a path, a separator or an age. |
| 3 | nothing under 11px without the pairing | pass | transform-aware on-screen size: smallest Jig chrome text **11.00px in every state on all three legs** (chips, tab labels, tags, the clock, the rail's word); the subject 12.00 at scale 1; **6.00 in the mirror** (disclosed above; Jig's labels inside the half-scale plates counter-scale to 11). |
| 4 | reduced motion mandatory | pass | differential: elements with a non-zero transition/animation duration = **5–11** on the normal leg, **0 in every state on the reduce leg**; `getAnimations()` = 1 (`live-pulse`) while building normal, **0** under reduce; `--t-feather` reads 120ms → 0ms; `--t-oath` stays 800ms and the hold still gates (312 ms → *still a draft*; 950 ms → ready). |
| 5 | touch targets ≥ 44px on phone surfaces | n/a (desktop) | 10 Jig controls visible at rest, smallest 27px (the status button's height); 15–23 with the card / Advanced, smallest 18px (the acceptance line's remove). Not a phone surface; recorded, not claimed. |
| 6 | colour never alone | pass | every state is a pip + word (Prompts rows, the spine, chips); the status line is pip + *Claude · idle / building · … / built · …*; selection = outline + tag; ready = gold ring + the word *ready*; Claude's stream = spine + the word *Claude*; snapping = line + *snapped to x 32 and y 128*; the SIM marker is a word, dashed. |
| 7 | colours from the token file | pass | regex after the END marker: 10 hex + 1 rgba, all inside the GAUGES data (the subject's tokens, displayed) and the `.lg-root` block; **Jig chrome 0**. |
| 8 | new surface starts from `tokens/starter.css` | pass | raw-bytes `Contains` true, exactly once, CRLF and header intact (the file was converted to CRLF to match). |
| 9 | Obsidian & Ember base | pass | same block; no departure token added. |
| 10 | irreversible = held with deepening | pass | Ready: 300 ms hold → *let go early — still a draft · 303 ms of 800*, state stays draft, ember stays on Ready; 950 ms → ready. The ring is `stroke-dashoffset` over `--t-oath`, linear; the button fills ember and lifts to z3 while held (`box-shadow` non-none during the hold, none after). |
| 11 | no confirm-dialog as weight | pass | `confirm(` / `alert(` calls in the file: 0. |
| 12 | no bouncy easing on consequential objects | pass | `--ease-spring` uses after the token block: 0; Ready linear; the ghost `--ease-settle`. |
| 13 | one saturated mass | pass | ember-coloured **controls** by computed colour: **0** at rest, card open with no words, building, built, Advanced, quiet; **1** (`#card-ready`, 6 nodes of one control) once a draft has words; **1** (`#card-build`, 5 nodes) once ready. Never two. Same on all three legs. |
| 14 | no silent soft-locks | pass | in words: Ready disabled with *· write the requirement first*; *let go early — still a draft*; *a draft is not saved until it has words*; *Claude is building — the words are locked while it runs*; *Nothing pointed at — Point at the plate and click*; *No prompts yet — Point at the plate…*; *No invoices yet — the empty state · SIM*; *nothing on the shelves for "…"*; *the selection is larger than the room around it…*; *nothing recorded — Hand clicks on the plate become steps while recording*. |
| 15 | hard-delete never the default | pass | no delete anywhere: *scrap* on a prompt → the collapsed *1 scrapped · the scrap bin — nothing is deleted* group and the Advanced bin count with *put back*; Delete on a sketch element → *1 scrapped · put back*. Measured: sheet 6 → 5 → 6; bin 2 → 1. |
| 16 | two-move rule | pass | Ctrl+K → type `design` → Enter: the palette closes and the Design system tab is selected. Items: 3 tools, 3 tabs, Advanced, Logbook, every prompt, 24 gauges, 17 components. |
| 17 | no hidden staleness | pass | ages on every logbook row, the card's foot (*saved now*), the hand block (*· 3m*); the SIM clock is labeled *the only clock*; the seeded build says *1m 12s* and its rows carry their ages. |
| 18 | red badges never the only strain signal | pass | no badges; `--alert` appears once — the toolpath's *stop* while recording, with the word. |
| 19 | nothing buried without a handle | pass | Advanced is a labeled switch; the logbook opens from the status line's own button; the scrapped group is a `<details>` with a count; the card has a close; every prompt is in the list and the palette. |
| 20 | ack ≤ 16ms · local < 100ms · > 300ms shows charge with cost | pass | every ack is a class toggle in the same frame; Polish says *~1.5 s · local*; Build shows elapsed on the status line and the stream head; replay says *~1.4 s*. |
| 21 | nothing blocks a surface it doesn't own | pass | only the palette veils the page (Esc, the veil, or a pick closes it); the card covers nothing it is anchored to; the logbook drawer has a close and Esc and leaves the right column live. |
| 22 | no blocking entrance · spinner without cost · lying skeleton · alarm-styling | pass | no entrance animation, no spinner, no skeleton; the one pulse is a live process with words beside it. |
| 23 | at most one thing moving at rest | pass | `getAnimations()` = **0** in every resting probe on every leg, **1** while building (the status pip only — the Prompts row's pip was pulsing too in a first build and was made still). |
| 24 | one affordance back to printed value | pass | *printed* on the plate (before · rulers · mirror · fixture · lit), Design system (lit), the sketch sheet (as saved), the logbook (filter) — each present only when its surface is off-default. Measured: before → printed → the Days column back and the button hidden; lit 3 → 0; sheet 6 → 5. |
| 25 | no auras, no neon, no lens flare | pass | outlines 1px, dashed lit boxes, no blur, no glow; the tag is a hairline label. |
| 26 | shadows earned, not default (files, does not block) | pass | `box-shadow ≠ none` count: **1 at rest — the subject's `shadow.card`** (Jig chrome 0, Advanced drawer 0); **2** with the card open (z3, `--shadow-held`) or while Ready is held; **2** in the mirror (the clone's own card) + the prompt card; z5 `--shadow-overlay` only on the palette and the logbook while open. |

Overflow: `scrollWidth/scrollHeight` = 1440/900 and 1280/720 in **every** probed state on all legs
(two overflows were found and fixed by the run: a 28px status button in a 27px row, and a hidden
switch input whose `position:absolute` escaped the Prompts pane's clipping once a built prompt was
in hand at 720 tall — the reason to measure at the second size, not infer it).

## What v0.1 users lose from the default view, and where it went

| v0.1 (concept A / the shipped bench) | In D's default view | Where it went |
|---|---|---|
| The helm: wordmark, bench name, *clamped* and *survey* chips, the shop chip, the Halls hint | gone | the wordmark glyph tops the rail (hover: the bench, one clamped repo); clamp + survey are the logbook's first row and Inspect's provenance; the shop chip became the status line's **Claude** word; MCP status is under Advanced; the palette is Ctrl/⌘+K only — its hint is the palette's own foot (a discoverability loss, named) |
| Rulers, guides, the cursor readout | gone | **Advanced → rulers & guides** (rulers in the app's px; four guides from the selection's edges); the cursor readout is not rebuilt |
| The 4px grid texture on the floor | gone | nowhere — the plate is plain `--bg0`; the sketch sheet keeps a 16px grid in the app's own line colour |
| The zoom row 50 / 75 / 100 / 125 | gone | nowhere — the frame is the plate's size; the mirror is the only scaled view. A gap, recorded |
| The SIM strip (and its clock) | gone | the strip is the first row of the Advanced drawer; the clock moved to the status line, labeled *SIM · the only clock* |
| Loupe tool + Mark tool | one tool | **Point** — hover names, click selects and opens the card; marks as numbered pins are gone (a prompt's target is shown by picking it from Prompts) |
| The Loupe tab (crumbs, selector, file, kind, inputs, outputs, gauges) | renamed | **Inspect** — crumbs, file, selector + instances, tag, text, gauges, routes, endpoints, docs; `@Input()`/`@Output()` not shown |
| The Gauges tab (26, seven categories incl. z) | renamed | **Design system** — 24 gauges, six categories; two-way lighting kept |
| The Logbook tab | moved | the **logbook drawer** from the status line — click *Claude · …* |
| The work-order tray, the two faces, the five-rung ladder | replaced | **Prompts** — groups by state (draft · ready · building · built · scrapped) and the prompt in hand: requirement, acceptance, the context block (the old shop face, appended silently), the stream, Built; the ladder is **the spine** under Advanced (four rungs) |
| RELEASE (held) | renamed | **Ready** (held ~800 ms) on the card |
| The drafter drafting on every mark | changed | **Polish**, on demand (A2); nothing fires by itself |
| The shop lane · *in the shop* · the wyrd pulse | replaced | the **building** group, the stream, and *Claude · building · …* on the status line; the pulse is the status pip |
| The trial fit (two frames at 50%) + *show the trial fit* | split | **Built** with the *before* switch on the default view; the two-plate **mirror** under Advanced |
| Fixture tool + pane | moved | **Advanced → fixtures** (three, with keys; the form fills with SIM tags) |
| Toolpath tool + pane | moved | **Advanced → toolpath** (record Hand clicks, replay a ghost) |
| The scrap bin on the tray handle | moved | the collapsed *scrapped* count in Prompts, and the bin count + *put back* under Advanced |
| The grid honesty line (*off the 4px grid by 2.0px*) | gone | nowhere — worth stealing back into Inspect |
| Sketch mode (grid-only snapping, hotspots) | kept, changed | **Sketch** — five primitives, real snapping to grid + edges + centres with alignment lines, *build this screen*; hotspots not rebuilt |
| Ctrl/⌘+K the Halls | kept | the palette, two moves; same shelves |

## Commission rows this concept answers

**A1** (Build runs Claude Code; MCP the secondary door under Advanced) · **A2** (Polish on
demand, absent-not-stubbed is stated in the MCP block) · **A3** (the loop only: rail · three tabs
· one status line · Advanced) · **A4** (`.jig/prompts/NNNN-<slug>.md`, draft → ready → building →
built, scrapped) · **§3** (the amended tongue throughout) · **§4** (the default view as written,
with the Advanced switch at the rail's foot — see costs). F-rows kept: **F1** (Claude Code builds;
Claude Desktop *connected* under Advanced) · **F2** (Angular + .NET survey, `openapi/v1.json`) ·
**F3** (`localhost:4200 through the Jig proxy`; `npx jigbench` in the logbook's first row) ·
**F5** as amended (`.jig/prompts/`, `.jig/survey/`, `.jig/sketches/`, `.jig/fixtures/`,
`.jig/logbook.jsonl`) · **F8** (Point → surveyed selector → file) · **F9** (Sketch as a mode of
the plate, files in `.jig/sketches/`) · **F10** (fixtures from data shapes, served on `/api/*`, the
form filled by input events — Advanced) · **F11** as amended (Built + *before*; the mirror
Advanced) · **F12** (Design system categorised, two-way lit, instance counts) · **F13** (starter
tokens, dark first) · **F14** (pairings at first encounter) · **F18** (*nothing leaves the
machine* on Polish and the logbook) · **F21** (Jig edits nothing; Claude does — said on the
stream's provenance).

## What to steal even if rejected

- **The card that never covers its anchor** — beside → below → above → corner-and-say-so, and a
  `ResizeObserver` that re-places it when it grows. Any concept with a floating card can carry this.
- **One ember, two acts** — Ready while draft, Build while ready, on the same card; the Prompts
  tab shows Build only when the card is closed, so the page never holds two demands.
- **The status line as Claude's one sentence** — pip + *Claude · building · 00:02 · editing …*,
  and the logbook as its drawer. The cheapest honest agent status there is.
- **Snapping with alignment lines that say their coordinates** — *snapped to x 32 and y 128* is
  the surface telling the truth about the snap; the algorithm (grid first, then the nearest edge or
  centre within 6px on each axis, one line per axis) is forty lines.
- **The context block shown to the human** — what Jig will append, in the open, before Build.
- **The slug from the human's first words, never renamed by the model.**
- **Advanced as a switch with a drawer** — the pattern for keeping every instrument without
  paying for it on every screen.
- **The `before` switch on the Built line** — the mirror's value at a fraction of its pixels.

Not ruled — Matter rules at 1440×900.

## Verdict — 2026-09-07

**CHASSIS, as is** (Matter). S12 builds the bench on this concept; the floor pass (`FLOOR-PASS-D-2026-09-07.md`) is clear at both viewports; its two tongue slips are fixed in the build.
