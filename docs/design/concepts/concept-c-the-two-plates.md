# Concept C · The Two Plates — the mirror-first chassis

One self-contained mockup: [concept-c-the-two-plates.html](concept-c-the-two-plates.html).
A **sim**: nothing writes, every fake is labeled SIM, the SIM strip is the only clock. Designed
for **1440×900** — open it at that size from disk. The app on the plates is *Ledger · SIM*, a
made-up Angular + .NET invoicing app (list · detail · form) rendered from its own surveyed
gauges, so it reads as the subject being worked on and never as Jig's chrome.

## The bet

**The approval moment is the product, so the bench is built around the before/after.** Every
change Jig ever shows is judged the same way — the app as it is, the app with the change,
side by side (Law II.4, the fate mirror; commission F11). C makes that comparison the whole
desk: the **left plate** is the app as-is, the **right plate** is the trial fit, and the
**work order in hand stands between them as the hinge** — human face above, shop face below,
its state ladder drawn vertically (*marked → drafted → released → in the shop → trial fit*).
One **toolpath scrubber** under both plates replays the same recorded click sequence on both
at once, so the comparison holds at every stop, not just the landing screen.

The second half of the bet is that everything else is a drawer. Gauges, Fixture, Sketch and
the Logbook rise from the bottom edge on demand and lower on `Esc`; the Loupe is the default
tool on both plates; the shop's connection is one quiet storm chip at the top; `Ctrl/⌘ K`
finds anything on the bench in two moves; one `printed` returns the scrubber, the drawers and
the plates to their printed state without destroying a mark.

## What it champions

- **The honest void (Law I.6).** Before a trial fit exists the right plate is a quiet dashed
  frame that says, in words, why it is empty — *no work order released* · *the shop has not
  returned #1* (not released yet / in the shop, two different sentences) · *the sketch is not
  built* — and what fills it. Never a spinner; the in-shop sentence states the cost
  (*the agent's tokens and 1–3 min · Ns so far*).
- **RELEASE is held (Law I.2, floor item 10).** Press-and-hold ~800 ms on `--t-oath`, a ring
  that fills linearly under the pointer, a hint that says *holding · let go to cancel*. Let go
  early and it says *released before the weight — nothing written*. Keyboard: hold Space or
  Enter. It is the one ember on the screen while a work order is drafted; after release it is
  gone, and the next ember is *accept the fit* when the trial fit is back. Never two.
- **The hinge as ladder.** Five rungs with the age each was reached; human-side rungs in ink,
  shop-side rungs in wyrd; the current rung bold. The shop face is empty until released and
  says what will fill it; on release it fills in the app's own idiom — files to touch, the
  patterns the survey found, the tests to write, the `.jig/work-orders/NNNN-<slug>.md` path
  with its frontmatter state. RELEASE is sticky at the hinge's foot, so the demand is at hand
  while the human face scrolls above it.
- **The change is outlined in storm, on the change.** The trial fit's changed elements carry a
  1 px storm hairline and one `#N · trial fit` tag pinned on the change's lower edge (never
  over the app's own controls above it). When the scrubber lands on a screen where the change
  is not visible, the plate foot says so: *the change is not on this screen — it lives at
  /invoices*.
- **One scrubber, two plates.** Five recorded stops (`0001-open-and-edit`); scrub, step, or
  replay and both plates move to the same route. The **hand** tool clicks through the app and
  records every click as a new stop (dashed, `+N unsaved`). The scrubber declares the dead end
  for a sketch in words.
- **Fixture = key.** Four fixtures from the Invoice DTO → JSON Schema → data; *same key, same
  data*; applied to both plates at once; `empty` renders the app's own empty state on both,
  and a detail route the fixture cannot answer says *INV-1042 is not in this fixture*.
- **Gauges, two-way lit (F12).** The Ledger's own 28 gauges in seven groups; click a colour
  and every element using it lights on both plates with a *dashed* storm hairline (distinct
  from the solid change outline); component instance counts are live from the left plate.
- **Sketch (F9).** The left plate becomes a sheet drawn with the Ledger's own gauges (dashed
  boxes, its font, its primary); the loupe on a block drafts *Build the Ageing report from
  sketch 0001*; after release and return the right plate shows it **built** from the same
  fixture — five buckets as bars and the open invoices by bucket.
- **The Logbook and the scrap bin (Law II).** Every move is an entry with actor (you · the shop
  · jig · sim), words, provenance and age; a scrapped work order goes to a counted, regenerable
  scrap bin. Nothing on the bench is deleted; `printed` keeps marks, orders, fixture and the
  recorded stops and says so in its own log entry.

## The layout at 1440×900

`grid-template-columns: 576px 240px 576px` with 12 px gutters and a 12 px page pad; plate
bodies 574×618; SIM strip 30 · bench bar 44 · scrubber 66 · handles 56. A raised drawer is
330 px tall over the lower band (z3, `--shadow-held`); the palette is a 560 px card at z5
over the veil. `scrollWidth` = 1440 in every state measured; the body never scrolls.

## Register

The `:root` block is `design-book/tokens/starter.css` **verbatim** — header comment, every
token, the reduced-motion override; a byte-for-byte include once line endings are normalised
(the starter is CRLF on disk, the mockup is LF; 4,052 chars, asserted by the check script).
The file's Jig chrome uses nothing else — zero colour literals after the token blocks (grep). The **second** `:root` block is the surveyed app's
own gauge file (`--lg-*`, the indigo Angular Material default, made up for the sim) and is
what the plates render from and what the Gauges drawer lists. Obsidian & Ember for the bench;
the plates carry whatever the clamped app carries — here a light theme, deliberately, so the
subject is unmistakable.

Ember appears once at a time (RELEASE, then *accept the fit*). Storm: the shop chip's
hairline, the change outline, the lit gauge dash, focus rings. Wyrd: the shop face's spine,
the shop-side rungs, the shop's logbook voice, the armed *shop returns* sim button. Warn: the
drafting chip and the sim's voice in the log. Gold: unused. Alert: unused. Hairlines at rest
everywhere; the two shadows are earned — a raised drawer (z3) and the open palette (z5).
Feather for hovers and acks, stone for the drawers of record, oath for RELEASE; `--ease-spring`
is never used.

## Honest costs / frictions

- **Two plates cost width, and 1440 is where it shows.** Each plate is 576 px. The Ledger's
  four-column list fits; the trial fit's **five-column list clips its Status column** and
  scrolls horizontally inside the plate. A real Angular Material desktop app with ≥1024 px
  breakpoints would render its tablet layout or overflow the same way — Jig does not choose
  the target's breakpoints. Scaling the frame to fit (~0.6×) would put 13 px app text at
  ~8 px on screen, under the floor, so C does not scale. The honest alternatives are one plate
  at a time with a flip (a different concept) or a wider desk (1920 gives 816 px plates).
- **The hinge is narrow.** 240 px leaves 218 px of text. A drafted work order's human face is
  932 px tall in a 599 px column: the acceptance list and the fixture line scroll under the
  sticky RELEASE. Readable, but the human reads by scrolling.
- **Two bright plates on an obsidian desk.** The Ledger is light; two of it is a lot of
  luminance for hour ten. Jig cannot pick the target's theme, and dimming the subject would
  misreport its contrast, so C leaves the plates as the app renders them.
- **A raised drawer covers the hinge's foot.** While Gauges or Fixture is up, RELEASE is under
  the drawer; `Esc` lowers it. The alternative — drawers only under the plates — would leave
  them 240 px narrower.
- **The loupe's ink is `--bg0`.** Crisp on a light target; on a dark target it would vanish.
  The product needs a target-aware loupe ink chosen from the surveyed bg gauge.
- **The sim drafts from seven canned recipes** (one per component, one for the sketch). A
  click outside them says so in words; in the product the drafter writes the order.
- **The SIM strip stands in for MCP.** *shop returns #N* is a button where the product would
  receive `jig_report_done`. The reload button proves nothing persisted.
- **The sketch has no drawing tools and no toolpath** (F9 is a stretch); the scrubber says so.
- **Marks live on a screen.** A mark badge anchors to an element on the route it was placed on;
  scrub to another stop and the badge leaves the plate while the order stays in the hinge as
  `#N`. Said in the hinge's *where* line, not on the plate.
- **The tongue, one tension.** *release (approve it)* pairs the shop word with the commission's
  own plain phrase, and "approve" is also in §3's banned column. F14 requires the pairing;
  the pairing is the compromise it names. Recorded for Matter, not resolved here.
- **`--faint` on the printed-state readout** (*at printed state / the bench is off its printed
  state*) is an echo — the scrubber and the handles show the same state — and carries nothing
  a reader needs. Filed, as concept N filed its wordmark.
- **Desk targets, not glass.** Smallest interactive sides are 16 px (the range slider's track)
  and 22 px (chips, tool toggles, order tabs). Item 5 is a phone-surface item and does not
  apply at 1440×900; on glass this chassis would need a rebuild of the scrubber and the tabs.

## Floor self-check (`docs/DESIGN-TEAM.md` §6 — measured, not aspirational)

Instrument: headless Chrome (`chrome.exe --headless=new`) over raw CDP from Node 24
(`Emulation.setDeviceMetricsOverride` 1440×900; `Emulation.setEmulatedMedia`
`prefers-reduced-motion` `no-preference` / `reduce`), driving the full loop on both legs:
rest → mark → drafted → 300 ms hold → early release → 950 ms hold → released → in the shop →
shop returns → trial fit → scrub → fixture → drawer → palette → printed → logbook. Script:
the scratchpad's `measure-c.mjs`; results `measure-c.json`; zero `Runtime.exceptionThrown`
on either leg; zero console errors in the pane. The Sketch path was driven separately in the
page (sketch → mark → hold → return → built report: 5 bars, 8 rows, storm outline, 1 tag).

| # | Item | Verdict | How it was measured in the page |
|---|---|---|---|
| 1 | ink / dim ≥ 4.5:1 on the bg ladder | pass | computed from the token hex: ink 15.70 · 14.81 · 13.58 · 12.06 and dim 7.66 · 7.23 · 6.63 · 5.88 on bg0–bg3. The Ledger's own pairs, for the record: text 14.79, text-2 6.05 / 5.56, primary 6.87, on-primary on primary 6.87, ok 4.56, danger 4.92, warn and accent re-tuned to clear 4.5 (first pass read 4.24 and 4.35 — fixed). |
| 2 | `--faint` never load-bearing | pass (one echo filed) | every `--faint` text node enumerated by computed colour: rung ages, logbook ages, provenance lines (`prov` — file paths, the bench bar's *C:/repos/ledger-sim · surveyed 11 min ago*, the drafter's signature), the empty tab row's *none yet*, and the printed-state readout — an echo of visible state (see costs). The first pass had the *Claude Desktop · not connected · jigbench mcp install…* remedy on `--faint`; a remedy is load-bearing, so it moved to `--dim`. |
| 3 | nothing under 11 px | pass | smallest computed `font-size` among visible text nodes = 11 px in every state on both legs; `under11` = 0. 11 px text is mono provenance or 700/uppercase/tracked chips paired with position or a dot. |
| 4 | reduced motion mandatory | pass | differential: elements with a non-zero `transition-duration` at rest · drafted · fit · drawer-up = **14 / 15 / 17 / 19 on the normal leg, 0 / 0 / 0 / 0 under reduce**; `--t-feather`/`--t-stone` read 0 ms, `--t-oath` stays 800 ms; the drawer's transition reads `0.4s` vs `0s`; `getAnimations()` = 0 on both legs in every state. The drawer's travel is additionally inside `prefers-reduced-motion: no-preference`. The SIM strip reads *motion · reduced (travel off, the hold stays)*. |
| 5 | touch targets ≥ 44 px on phone surfaces | n/a (desk) | 1440×900 is not a phone surface. Recorded anyway: RELEASE 218×44; smallest interactive side 16 px (range slider), 22 px (chips, tabs, toggles). |
| 6 | colour never alone | pass | every status pairs colour with words and position: ladder rung = dot + label + age; chips carry text; the shop chip = dot + words; the change = outline + `#N · trial fit` tag; lit gauge = dash + the drawer's *lit on the plates: primary*; RELEASE = ember + *hold · 0.8 s* + the ring. |
| 7 | colours from the token file | pass | `grep` for `#hex` / `rgba(` after the two token blocks: 0 hits in CSS and markup (the Gauges drawer's value labels are data strings, and the swatches paint from `var(--lg-*)`). |
| 8 | new surface starts from `starter.css` | pass | the `:root` block is the starter file's content verbatim: `html.includes(starter)` is **false on raw bytes and true with CRLF→LF normalised** — the starter is CRLF on disk, the mockup LF; no other byte differs (4,052 chars). Nothing derived is a new token. |
| 9 | Obsidian & Ember is the base | pass | bench chrome on bg0–bg3 with ember as the one demand; the plates render the clamped app's own gauges — a subject, not a departure. |
| 10 | irreversible action is held, with deepening | pass | a 300 ms hold left the ring's `stroke-dashoffset` at 62.5 (of 100) and released nothing (*released before the weight — nothing written*; the order still in hand); a 950 ms hold released, filled the shop face and moved the rung. |
| 11 | no confirm-dialog as a substitute for weight | pass | none anywhere; the hold is the cost. |
| 12 | no bouncy easing on consequential objects | pass | the ring fills `linear`; drawers `--ease-settle`; acks `--ease-standard`; `--ease-spring` appears only in the token block. |
| 13 | one saturated mass per screen | pass | ember count by computed colour: **0** at rest, **1** (`#release`) once drafted, **0** released / in the shop, **1** (`#accept`) at trial fit, **0** after accept — both legs. |
| 14 | no silent soft-locks | pass | in words: the three void sentences; *say what should change first* on the disabled RELEASE; *released before the weight*; *sim · nothing in the shop*; *new sketch — not in this sim*; *no toolpath for a sketch*; *INV-1042 is not in this fixture*; *the hand found nothing to click here*; *Ledger · SIM has only the invoice screens*; *nothing on the bench matches "…"*; *the change is not on this screen — it lives at …*. |
| 15 | hard-delete never the default | pass | no delete anywhere; *→ scrap bin* composts a work order into a counted, regenerable bin; `printed` keeps recorded stops. |
| 16 | two-move rule | pass | `Ctrl/⌘ K` then type: 23 commands (drawers, fixtures, sketch, every stop, replay, tools, work orders, printed); ↑↓ ↵ Esc. |
| 17 | no hidden staleness | pass | *surveyed 11 min ago · SIM*; per-rung ages; logbook ages; *returned by Claude Code · SIM*; unsaved recorded stops flagged `+N unsaved`. |
| 18 | red badges never the only strain signal | pass | no badges; strain is counts (*scrap bin N*, *N entries*) and the in-shop cost line; `--alert` unused. |
| 19 | nothing buried without a handle | pass | four labeled handles with counts, the palette, order tabs, `lower · Esc` on every drawer; the shop face says what fills it and when. |
| 20 | ack ≤ 16 ms · local < 100 ms · > 300 ms shows its charge | pass | every acknowledgement is a synchronous class toggle or re-render in the handler's frame (no awaits before paint); the two processes over 300 ms state their cost in words — *drafting · Ollama · about 2 s · nothing leaves this machine*; *in the shop · cost: the agent's tokens and 1–3 min · Ns so far*. |
| 21 | nothing blocks the whole surface that doesn't own it | pass | only the palette veils the page, and it owns it while open (Esc / veil click closes); drawers cover the lower band only; the hold captures only its own pointer. |
| 22 | no blocking entrance · no spinner without cost · no lying skeleton · no alarm styling | pass | state renders first, motion catches up (transform/background transitions only); no spinner, no skeleton; `--alert` unused. |
| 23 | at most one thing moving at rest | pass | `getAnimations()` = 0 in every state on both legs; the only ticking text is the SIM clock; replay is a live process and is the one mover while it runs. |
| 24 | one affordance returns to printed value | pass | `printed`: stop 1, drawers lowered, loupe on both plates, nothing lit, left plate back to the app — measured `stop 0 · drawerUp false · ordersKept 1 · fixture kept`. |
| 25 | no auras, no neon, no lens flare | pass | every outline is a 1 px hairline (bg0 loupe, storm change, dashed storm lit); no glow, blur or gradient anywhere. |
| 26 | shadows earned, not default | pass (files) | `box-shadow` count by computed style: **0** at rest, drafted and fit; **1** while a drawer is raised (z3, `--shadow-held`); **1** while the palette is open (z5, `--shadow-overlay`). The z-ladder is named in the file's header comment. |

Overflow: `scrollWidth` 1440 = `innerWidth` and `scrollHeight` 900 in every state. Console: 0
errors. The first pass found and fixed: a hidden palette that was not hidden (`display:flex`
beat the UA `[hidden]` rule — now `[hidden]{display:none !important}`), a 1647 px overflow from
the handle pairings, a bench-bar wrap over the SIM strip, a clipped fixture chip, RELEASE below
the hinge's fold, and the two Ledger contrast pairs.

## Commission rows this concept answers

| Row | How C answers it |
|---|---|
| F1 | the shop chip: *Claude Code · connected · SIM* (storm hairline); *Claude Desktop · not connected · jigbench mcp install --claude-desktop* in words |
| F2 | the shop face speaks Angular 20 + .NET 10 (MatTable `displayedColumns`, DatePipe, DTO fields, a controller) |
| F3 | a browser UI on localhost; nothing installed; the shop over MCP on stdio |
| F4 | the **Jig** wordmark; `jigbench` only in the command |
| F5 | every artifact is a `.jig/…` path: `survey/`, `work-orders/NNNN-<slug>.md`, `toolpaths/`, `fixtures/`, `sketches/`; *nothing written* in the sim |
| F6 | the work order's two faces and its frontmatter state, drawn as the hinge |
| F7 | *drafting · Ollama · qwen2.5-coder:7b · SIM · about 2 s · nothing leaves this machine* — pulled, priced |
| F8 | the loupe resolves a click to `app-invoice-list › td.num · invoice-list.component.html` |
| F9 | Sketch: the left plate as a sheet in the app's gauges; the right plate shows it built |
| F10 | fixtures from the DTO → schema → key; applied to both plates without touching the app; the app's own empty state |
| F11 | **the chassis row** — two plates, one toolpath replayed on both |
| F12 | Gauges categorized, two-way lit, live component counts |
| F13 | starter tokens verbatim, dark first |
| F14 | the shop words with the plain word paired at first encounter (bench, plate, loupe, mark, work order, release, the shop, trial fit, toolpath, fixture, gauges, sketch, scrap bin, logbook) |
| F18 | the SIM strip and the drafting line say nothing leaves the machine |
| F20 | the Tuesday loop end to end: plate → loupe → mark → work order → release → shop → trial fit → fixture → toolpath → sketch |
| F21 | Jig edits nothing; the shop does; every SIM says *nothing written* |

Not a mockup's to answer: F15–F17, F19, F22 (build and hygiene decisions).

## What to steal even if rejected

- **The hinge as a vertical state ladder with per-rung ages** — a work order's life in 100 px.
- **Sticky RELEASE at the hinge's foot** — the one demand never leaves the viewport.
- **Three void sentences** — *no order released* / *not released yet* / *in the shop* are
  different states and deserve different words.
- **The trial-fit tag pinned on the change's lower edge**, and the plate-foot line for a change
  that lives on another screen.
- **One scrubber driving N plates from one route** — any concept with two frames can carry it.
- **Dashed storm for "lit", solid storm for "changed"** — the same channel, two readable weights.
- **Fixture as a key, and `empty` as a fixture** — the app's own empty state is a test.
- **The SIM strip's *shop returns #N*** as the honest stand-in for `jig_report_done`, and
  *reload* as proof of non-persistence.
- **A component → recipe table** for a sim drafter — seven rows made the whole loop drivable.

Not ruled — Matter rules at 1440×900.

## Verdict — 2026-09-05

**STEAL** (Matter): the two-plate mirror with the toolpath scrubber becomes chassis A's trial-fit mode. **Shelved:** the hinge layout and the drawers as the primary arrangement.
