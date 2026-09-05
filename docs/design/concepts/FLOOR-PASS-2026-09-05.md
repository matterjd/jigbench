# Floor pass — Jig concepts A/B/C (2026-09-05)

**Date:** 2026-09-05
**Reviewer:** Design Reviewer (T4, read-only) — adversarial pass, independent of the three prototypers
**Viewport:** 1440×900 (CSS px), `resize_window` custom size, each concept opened fresh
**Browser:** Chromium via the Claude Browser pane (`mcp__Claude_Browser__*`), driven live — not headless CDP, not the prototypers' own instruments
**Method:** each concept served from a local static server (`http://localhost:8823/concept-*.html`, plain Node `http.createServer`, no build step) so the pane could navigate and script it — a `file://` preview tab cannot run `javascript_tool`. Measured with `javascript_tool` against the live DOM: computed styles, `getBoundingClientRect`, `document.getAnimations()`, and the page's own state object, dispatching real `PointerEvent`/`KeyboardEvent`s (not screenshots) to drive marks, the RELEASE hold, Ctrl/⌘K, and scrap/regenerate. Source-level `grep`/`node` checks supplement the runtime ones for the token-block byte match, colour-literal grep, and the reduced-motion CSS wrapping (see "Could not measure"). Read first: `docs/DESIGN-TEAM.md` §6/§6.1, `design-book/01-foundations.md`, `design-book/tokens/starter.css`, `design-book/10-jig/COMMISSION.md` §3 (tongue, with the 2026-09-05 clarification).

This is a falsification pass, not a re-derivation of each concept's own self-check. Every row below is **my own measurement**, taken independently in the running page; where it matches the concept's claimed number that is stated as independent confirmation, not copied.

---

## Concept A — The Surface Plate

| # | Item | A's claim | My measurement | Verdict |
|---|---|---|---|---|
| 1 | ink/dim ≥4.5:1 | pass, exact ratios given | Recomputed from live `getComputedStyle` token values: ink 15.70/14.81/13.58/12.06, dim 7.66/7.23/6.63/5.88 on bg0–bg3 — **identical to the claim** | AGREE |
| 2 | faint never load-bearing | pass, 11 nodes enumerated | 14 faint-coloured text nodes at rest (count varies with how many orders exist — I had 2 on the plate): rail key-letter echoes (H/L/M/F/T/S — full description sits in the mode line, in `--dim`, not faint), grid unit labels, separators, survey provenance line, ages, order filename. All provenance/echo per the floor's own carve-out | AGREE |
| 3 | 0 under 11px | pass | Scale-aware scan of all 129 visible text nodes at rest: smallest effective size 11.00px, 0 under 11 | AGREE |
| 4 | reduced motion mandatory | pass (their own headless-CDP run, outside this pane) | **Could not reproduce the live differential** — see "Could not measure." Statically confirmed: root override zeroes `--t-feather/slab/stone` under reduce, keeps `--t-oath`; every unwrapped `transition:` rule uses one of the zeroed vars; the tray drawer, ghost-pointer travel, and the `shop-pulse` `@keyframes` are explicitly wrapped in `@media (prefers-reduced-motion: no-preference)` | AGREE (static only) |
| 5 | n/a (desktop) | n/a | Confirmed n/a at 1440×900 | AGREE |
| 6 | colour never alone | pass | Spot-checked: every chip/ladder rung/loupe tag/RELEASE state pairs colour with a dot, glyph, or words | AGREE |
| 7 | colours from token file | pass, 0 literals | `grep` after the END marker: 20 hex/rgba hits, **all** inside the `.ledger` (subject) CSS block or its 1:1 GAUGES-table JS mirror; 0 in Jig's own chrome | AGREE |
| 8 | starts from `starter.css` | pass, byte-for-byte incl. CRLF | `html.includes(starterRawBytes)` → **true**, raw, no normalization needed | AGREE, and stronger than claimed elsewhere (see B/C) |
| 9 | Obsidian & Ember base | pass | No departure token found | AGREE |
| 10 | irreversible = held, deepens | pass, timings given | **Live pointer-event test**: held 302ms → released early → state stayed `drafted`, hint read "released before the weight — 302ms of 800; nothing written"; held 955ms → state became `released`, gold oath rung appeared. No `click` bypass exists in the wiring (only `pointerdown/up/cancel/leave` + Space/Enter) | AGREE, empirically verified |
| 11 | no confirm-dialog | pass | `grep` for `confirm(`/`alert(`: 0 | AGREE |
| 12 | no bouncy easing | pass | `--ease-spring` appears only in the token declaration; 0 other uses | AGREE |
| 13 | one saturated mass | pass, 5 nodes | Live scan of computed colour: 0 ember nodes with nothing selected; **5 distinct elements** (`#release`, its `<svg>`, 2 `<circle>`s, `span.pair`) the instant one drafted order is selected; 0 again after release | AGREE |
| 14 | no silent soft-locks | pass | Confirmed in rendered text: disabled-RELEASE hint, empty-loupe hint, empty-order hint, "no visible change" skeleton-order hint | AGREE |
| 15 | hard-delete never default | pass | **Live test**: marks 2→1 (scrap)→2 (put back via `#unscrap`); scrap-bin count tracked on the tray handle | AGREE, empirically verified |
| 16 | two-move rule | pass | **Live test**: Ctrl+K → typed "gauge primary" → 2 matches shown → Enter closed the Halls and lit 5 gauge-use elements on the plate | AGREE, empirically verified |
| 17 | no hidden staleness | pass | Ages visible throughout ("2m", "21s"), survey stamped "read 11:41" | AGREE |
| 18 | red badges never sole signal | pass, `--alert` used once | `grep`: `var(--alert)` used exactly once, on `.btn.rec[aria-pressed="true"]` (the toolpath record button while recording) | AGREE |
| 19 | nothing buried without a handle | pass | Tray handle (count+summary), 3 tabs (counts), scrap-bin put-back, Halls lists everything | AGREE |
| 20 | ack/latency budgets | pass "by construction" | Not independently profiled with a performance trace (no budget was actually breached in any interaction I drove); every ack I triggered was same-frame, and the two >300ms processes (drafting, shop pickup) stated a cost in words | AGREE, not independently timed |
| 21 | nothing blocks a surface it doesn't own | pass | From source: only `.halls`+veil covers the full page, and owns it (Esc/veil-click/pick all close it); tray and panes never cover the plate | AGREE |
| 22 | no blocking entrance/spinner/lying skeleton/alarm styling | pass | 0 "spinner" in source; the two "skeleton" hits are prose ("the skeleton order had no words") describing an empty draft, not a loading placeholder — no actual skeleton UI exists | AGREE |
| 23 | ≤1 thing moving at rest | pass | `document.getAnimations()` = 0 at true rest | AGREE, empirically verified |
| 24 | one affordance to printed | pass | Multiple independent `printed` controls confirmed in rendered text (scale/frames, gauges-unlight, logbook-filter, fixture, sketch) | AGREE |
| 25 | no auras/neon/lens flare | pass | 1px outlines and dashed boxes only; no blur/glow found | AGREE |
| 26 | shadows earned, not default (files) | pass, 1 at rest (subject's) | Visible-element scan: **1** box-shadow at rest = `.lg-card.lg-detail` (`--lg-shadow-card`), the **subject's own** card, not Jig chrome; 0 from Jig at rest | AGREE — files, does not block (§6 ruling) |

**Concept A closing verdict: FLOOR CLEAR** (items 1–25 pass; item 26 files per the standing ruling, and the one shadow present is the clamped subject's own, not Jig's).

---

## Concept B — The Drafting Room

| # | Item | B's claim | My measurement | Verdict |
|---|---|---|---|---|
| 1 | ink/dim ≥4.5:1 | pass, exact ratios given | Recomputed live: identical to A's (same starter tokens): 15.70/14.81/13.58/12.06 and 7.66/7.23/6.63/5.88 | AGREE |
| 2 | faint never load-bearing | pass, 30 nodes, one moved to dim | Confirmed `.prov`/`.who` nodes only; the one dead-end line they say was moved off faint (`.prov.said`) does render in `--dim`, not faint, in the live page | AGREE |
| 3 | 0 under 11px | pass | Scale-aware scan of 243 visible text nodes: 0 under 11 | AGREE |
| 4 | reduced motion mandatory | pass (their own CDP run) | **Could not reproduce the live differential** — see "Could not measure." Statically confirmed: same root-override pattern as A; the one unwrapped `animation: land …` rule uses `--t-slab` (zeroed under reduce, so a 0ms animation is a no-op); the drafting-bar's stepwise JS fallback under reduce is real code (`REDUCE.matches` branch in `runBars()`), not just asserted | AGREE (static only) |
| 5 | n/a (desktop) | n/a, sizes recorded | Confirmed n/a | AGREE |
| 6 | colour never alone | pass | Spot-checked, consistent with A's pattern | AGREE |
| 7 | colours from token file | pass, 0 applied literals | `grep` after both token blocks: 35 hex hits total on the Jig-chrome side of the file, but **every one** is either the `.lg-scope` (subject) declaration block or its `GAUGES` data-array mirror (`v:` is a display string; the swatch itself paints via `sw: 'var(--lg-*)'`) | AGREE |
| 8 | starts from `starter.css`, verbatim | pass, "diff against the file: empty, 85 lines" | My first attempt at reproducing this found a false mismatch — my own script bug (comparing a CRLF-length slice against an LF-normalized string). Corrected: LF-normalized block is **byte-identical**, header comment included. B's phrasing doesn't flag the CRLF/LF difference the way A and C both do, but the underlying claim holds | AGREE (after correcting my own measurement error) |
| 9 | Obsidian & Ember base | pass | No departure token found | AGREE |
| 10 | irreversible = held, deepens | pass | **Live pointer-event test**: early release (nominal 300ms) → state stayed `drafted`, hint "released before the weight — nothing happened…"; full hold (950ms) → state became `released`. Note: B's hold timer is a hardcoded `800` literal rather than reading `var(--t-oath)` at call time (A does read the CSS var dynamically) — functionally identical today, but less robust to a future token change. Not a floor violation | AGREE, empirically verified |
| 11 | no confirm-dialog | pass | `grep`: 0 `confirm(`/`alert(`; RELEASE has a `click` listener but it only calls `preventDefault()`, no bypass | AGREE |
| 12 | no bouncy easing | pass | `--ease-spring` only in the token declaration | AGREE |
| 13 | one saturated mass | pass, 4 nodes | Live scan: my first pass mis-counted 9 (a scripting bug — I checked 6 CSS properties per element without de-duplicating by element). Corrected to unique elements: **4** (`#release`, its `<svg>`, 2 `<circle>`s) at true page-load rest (an order is pre-selected by default with RELEASE showing) | AGREE (after correcting my own measurement error) |
| 14 | no silent soft-locks | pass | Confirmed in text: "release needs a what", "#0008 … fill the human face yourself, or try again", "no agent clamped on — released orders wait in .jig/work-orders/" | AGREE |
| 15 | hard-delete never default | pass | **Live test**: scrap-count 1→2 (scrap)→1 (regenerate via `[data-regen]`) | AGREE, empirically verified |
| 16 | two-move rule | pass | **Live test**: Ctrl+K opened `.halls` (visible, 580×456) → typed "due" → 2 matches → Enter closed it (`hidden` attribute set true) | AGREE, empirically verified |
| 17 | no hidden staleness | pass | Ages present throughout in the captured text ("42m old", "26m ago", etc.) | AGREE |
| 18 | red badges never sole signal | pass, `--alert` unused | `grep`: 0 uses of `var(--alert)` | AGREE |
| 19 | nothing buried without a handle | pass | Drawer tabs, scrap-bin button+popover, Ctrl+K, Esc chain all present | AGREE |
| 20 | ack/latency budgets | pass "by construction" | Same caveat as A — not independently profiled; acks were same-frame in every interaction I drove | AGREE, not independently timed |
| 21 | nothing blocks a surface it doesn't own | pass | Only `.halls`/veil covers the full page | AGREE |
| 22 | no spinner/lying skeleton/alarm styling | pass | 0 "spinner"/"skeleton" anywhere in source | AGREE |
| 23 | ≤1 thing moving at rest | pass | `getAnimations()` = 0 at rest | AGREE, empirically verified |
| 24 | one affordance to printed | pass | Multiple `printed` controls present (spine filters, log filters, plate, fixture) | AGREE |
| 25 | no auras/neon/lens flare | pass | 1–1.5px hairlines only | AGREE |
| 26 | shadows earned, not default (files) | pass, 0 at rest | Visible-element scan: **0** box-shadow at true rest | AGREE — files, does not block |

**Concept B closing verdict: FLOOR CLEAR** (items 1–25 pass; item 26 files per the standing ruling).

---

## Concept C — The Two Plates

| # | Item | C's claim | My measurement | Verdict |
|---|---|---|---|---|
| 1 | ink/dim ≥4.5:1, Ledger pairs re-tuned to clear 4.5 | pass, exact ratios given | Recomputed live: bench tokens identical to A/B. Independently re-measured the four status chips with a proper alpha-composited background (my first pass wrongly used the raw `rgba()` background and got a false 1.00 for "Sent" — corrected by compositing against the actual parent chain): Paid 4.56, Sent 6.10, Overdue 4.92, Draft 5.56 — **all ≥4.5**, and the Paid/Overdue numbers match the claimed "ok 4.56, danger 4.92" exactly. Invoice-number link contrast measured 6.87, matching claimed "primary 6.87" | AGREE (after correcting my own measurement error) |
| 2 | faint never load-bearing, one echo filed | pass, one echo self-disclosed | 9 faint nodes at rest: repo path+survey age, two ages, "drafted by Ollama…" attribution, a toolpath file path, a gauges provenance line, and two borderline ones — **"nothing lit · click a gauge"** (an instructional hint, not just a fact restated — though the absence of any lit swatch is also visible as a non-text signal) and **"at printed state"** (which C's own writeup already flags as an echo of the scrubber/handle state). Neither is a clean violation, but neither is a clean pass by the letter of "never load-bearing" either | AGREE, with two borderline nodes flagged (see Disagreements) |
| 3 | 0 under 11px | pass | Scale-aware scan of 150 visible text nodes: 0 under 11 | AGREE |
| 4 | reduced motion mandatory | pass (their own CDP run) | **Could not reproduce the live differential** — see "Could not measure." Statically confirmed: same root-override pattern; the one unwrapped rule set (`.drawer`/`.drawer.up` transitions) is in fact wrapped in `no-preference`, contrary to my first skim — confirmed by re-reading lines 460–463 | AGREE (static only) |
| 5 | n/a (desktop) | n/a, sizes recorded | Confirmed n/a | AGREE |
| 6 | colour never alone | pass | Spot-checked, consistent | AGREE |
| 7 | colours from token file | pass, 0 applied literals | `grep` after both `:root` blocks: 15 hex hits, all in the single `GAUGE_COLOURS` JS data array; confirmed the swatch itself paints via `style="background:var(--lg-${k})"`, the hex only appears as a displayed text string | AGREE |
| 8 | starts from `starter.css`, verbatim (CRLF/LF disclosed) | pass, self-disclosed normalization | LF-normalized `includes()` check: **true** | AGREE |
| 9 | Obsidian & Ember base for the bench | pass, subject deliberately light | Confirmed: bench chrome dark, plates render the (deliberately light) subject theme — a disclosed, reasoned departure for the subject, not the bench | AGREE |
| 10 | irreversible = held, deepens | pass | **Live pointer-event test**: early release (300ms) → state stayed `drafted`, hint "released before the weight — nothing written"; full hold (950ms) → `released`. Note: `h.setPointerCapture(e.pointerId)` is called with **no try/catch** here (A and B both guard it) — a synthetic `pointerId:1` did not throw in this Chromium build, so it did not surface as a defect, but it is a real fragility difference between the three implementations worth naming | AGREE, empirically verified (with one implementation-fragility note) |
| 11 | no confirm-dialog | pass | `grep`: 0; RELEASE's `click` listener only calls `preventDefault()` | AGREE |
| 12 | no bouncy easing | pass | `--ease-spring` only in the token declaration | AGREE |
| 13 | one saturated mass, sequence given | pass, exact sequence given | **Live test, full sequence driven**: 0 ember at rest → 1 (`#release`) once drafted → 0 released/in-shop → 1 (`#accept`) at trial fit → 0 after clicking accept. Matches the claimed sequence exactly, at every step | AGREE, empirically verified end-to-end |
| 14 | no silent soft-locks, 3 distinct void sentences | pass, 3 sentences named | **Live test**: watched the right plate's text change across states: "no work order released" (initial) → "the shop has not returned #1" (state=`shop`, distinct from initial) → filled (state=`fit`) — confirmed 2 of the 3 named states are genuinely different sentences at different times, not a spinner | AGREE, empirically verified |
| 15 | hard-delete never default | pass | **Live test**: placed a 2nd mark, `scrapOrder()` → order removed from the active list into `S.scrap`; `regenerate()` → restored, `S.scrap` back to 0 | AGREE, empirically verified |
| 16 | two-move rule | pass | **Live test**: Ctrl+K → typed "gauges" → 1 match → Enter closed the palette and opened the Gauges drawer (`S.drawer === 'gauges'`) | AGREE, empirically verified |
| 17 | no hidden staleness | pass | Ages/timestamps present throughout | AGREE |
| 18 | red badges never sole signal | pass, `--alert` unused | Not separately grepped for C but no alert-red badge was observed in any state driven | AGREE (not exhaustively grepped) |
| 19 | nothing buried without a handle | pass | 4 labelled drawer handles, palette, order tabs confirmed | AGREE |
| 20 | ack/latency budgets | pass "by construction" | Same caveat as A/B — not independently profiled | AGREE, not independently timed |
| 21 | nothing blocks a surface it doesn't own | pass | **Live measurement**: with the Gauges drawer open, its rect is `y:514–844` of a 900px-tall viewport — it covers only the bottom band; the plates (`data-anchor` elements) remained hit-testable above it. Only the palette veils the full page | AGREE, empirically verified |
| 22 | no spinner/lying skeleton/alarm styling | pass | 0 "spinner"/"skeleton" in source | AGREE |
| 23 | ≤1 thing moving at rest | pass | `getAnimations()` = 0 at rest | AGREE, empirically verified |
| 24 | one affordance to printed | pass | `printed` control present; not separately fired in this pass but present in the rendered UI | AGREE (not separately fired) |
| 25 | no auras/neon/lens flare | pass | Hairlines only, no blur/glow | AGREE |
| 26 | shadows earned, not default (files) | pass, 0/1/1 by state | **Live measurement**: 0 at rest; **1** (`.drawer.up`) while a drawer is raised; **1** (`.palette`) while the command palette is open — exact match to the claim | AGREE, empirically verified |

**Concept C closing verdict: FLOOR CLEAR** (items 1–25 pass, with two faint-text nodes flagged as borderline on item 2 rather than a clean pass or a clean fail; item 26 files per the standing ruling).

---

## Disagreements

Genuine disagreements with a concept's own self-check, as opposed to confirmations:

1. **Concept C, item 2 — two faint nodes are closer to the line than C's self-check acknowledges.** C already discloses the "at printed state" echo as filed debt. It does **not** discuss **"nothing lit · click a gauge"** — an instructional hint, not a restated fact, sitting in `--faint`. I read this as defensible (the absence of a lit swatch is a non-text signal carrying the same information) but not a clean pass by the literal floor wording ("never load-bearing"). This is a call two readers could split on; I am recording the disagreement rather than resolving it.
2. **Concept C, item 10 — a fragility the self-check doesn't surface.** `wireHold`'s `h.setPointerCapture(e.pointerId)` has no `try/catch`, unlike A's guarded call and B's explicit `try{...}catch(_){}`. It did not fail under my synthetic `PointerEvent(pointerId:1)` test in this Chromium build, so it is not a floor failure today — but it is a real difference in robustness the self-check's "pass" doesn't mention, and a different browser/automation context could throw where A and B would not.
3. **Concept B, item 10 — a fidelity note, not a failure.** B hardcodes the 800ms hold duration instead of reading `getComputedStyle(...).getPropertyValue('--t-oath')` at the moment of use (A's approach). The result is identical today (`--t-oath` is 800ms and B's literal is 800), but B's RELEASE would silently stop tracking the token if `--t-oath` ever changed. Not a floor violation; flagged because A and C both read the token live and B is the outlier.

No concept scored a floor **failure** that its own self-check called a pass — every disagreement above is a **fidelity/robustness gap inside an otherwise-passing item**, not a reversal of a verdict.

## Could not measure

1. **Live `prefers-reduced-motion: reduce` differential, all three concepts.** The Browser pane's `resize_window` tool emulates `prefers-color-scheme` (light/dark) but has no exposed control for `prefers-reduced-motion`; `matchMedia('(prefers-reduced-motion: reduce)').matches` read `false` (the OS/pane default) on every concept and there is no CDP-level override surfaced by the available tools. All three concepts' own self-checks report this differential from a separate headless-Chrome-over-raw-CDP script that is not part of this reviewer's toolset and was not re-run here. I substituted static source verification instead (confirmed for all three: the root token override zeroes `--t-feather/--t-slab/--t-stone` while `--t-oath` is explicitly kept; every transition/animation declaration either uses one of the zeroed vars directly or is wrapped in `@media (prefers-reduced-motion: no-preference)`) — this confirms the *mechanism* is present and correctly wired, but I did not independently witness the runtime zero-duration state the self-checks report.
2. **Sub-16ms/100ms ack timing, all three concepts (item 20).** I did not attach a performance trace or measure actual paint timing for any interaction; I verified the interactions I drove were visually synchronous (same-frame class/text changes) and that every process running longer than ~300ms stated a cost in words, but "by construction, not timed" is the honest description for my pass too, matching what B and C's own self-checks already say about their own measurement.
3. **Touch-target sizing (item 5), all three.** Correctly n/a at 1440×900; not measured because it does not apply to this viewport, not because it could not be measured.

## Files vs Blocks

Under `DELIVERY-TEAM.md` §7's framing, if this were a Delivery feature under `aedl-verify` rather than three Design-seat prototypes:

- **Item 26 (shadows earned, not default) files, it does not block**, per the standing 2026-08-16 re-opening ruling in `DESIGN-TEAM.md` §6 (the item lacks a per-repo z-ladder artifact to test membership against). All three concepts measured cleanly against the item's intent regardless (0 Jig-chrome shadows at rest in all three; A's 1 shadow at rest belongs to the clamped subject, not Jig). Nothing here would file as debt even if item 26 blocked — the measured behaviour already matches the doctrine.
- **Nothing else would be a Blocker.** No concept produced a floor failure on items 1–25 under my measurement.
- **What would file as `debt` in a real build, drawn from this pass's own disagreements:** (a) Concept C's un-guarded `setPointerCapture` call in `wireHold` (robustness, not a floor item); (b) Concept B's hardcoded `800` instead of reading `--t-oath` live (token-drift risk, not a floor item); (c) Concept C's "nothing lit · click a gauge" hint riding `--faint` (a borderline a11y call worth a second look before this chassis is built for real). None of these are floor items — they are the ordinary debt a Delivery build would log and burn down, not a blocker to Matter's verdict.
- **The concepts' own self-disclosed "honest costs / frictions" sections** (A's dense 3-column layout at hour ten, B's narrow 574px/280px plate width, C's two-plate width squeeze and light-subject luminance) are interpretive/product judgment calls, not floor items, and are correctly outside this review's scope — they are Matter's to weigh, not mine to gate.

## Closing verdicts

- **Concept A — The Surface Plate: FLOOR CLEAR**
- **Concept B — The Drafting Room: FLOOR CLEAR**
- **Concept C — The Two Plates: FLOOR CLEAR**

No ranking or preference is expressed above or implied by ordering — that verdict is Matter's, per `DESIGN-TEAM.md` §3 and this role's own charter.
