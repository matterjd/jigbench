# Demo 1 — Jig v0.1, the Tuesday cut

For Matter, Sunday 2026-09-06 (the v0.1 closing review). Every quoted label below is what the
bench actually said when QA drove this walkthrough live (`packages/bench/src/**`, Browser pane,
`examples/ledger-angular` at 1440×900) — not a paraphrase, and not the plan's aspirational
wording where the two differ. Steps marked **[Matter-only]** cannot be verified by an agent on
this desk — `DELIVERY-TEAM.md` §3's physics rule: an agent's clicks run in an isolated profile,
so a handful of checks only count on your machine.

All commands are bash, run from the repo root (`C:\Users\matte\source\repos\jigbench`) unless a
step says otherwise. Nothing here edits application code — Jig only ever writes under `.jig/`.

## 0. Start the fixture apps

```bash
cd examples/ledger-api && dotnet run --urls http://localhost:5210 &
cd examples/ledger-angular && npm ci && npx ng serve --port 4200 &
```

**PASS:** terminal 1 prints `Now listening on: http://localhost:5210`; terminal 2 prints
`Local: http://localhost:4200/`.
**FAIL:** either port refuses `curl`. Check `dotnet --version` (need 10.x) and `node --version`
(need ≥22).
**Cleanup:** stop both by port, never by name — `scripts/plate-smoke.sh`'s own pattern:
```bash
for p in 5210 4200; do pid=$(netstat -ano | grep ":$p " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done
```

## 1. Start Jig on the Ledger fixture

```bash
node packages/cli/dist/bin.js --repo examples/ledger-angular --target http://localhost:4200 --no-open
```
(or, from the packed tarball: `npx --yes ./jigbench-0.1.0.tgz --repo examples/ledger-angular
--target http://localhost:4200 --no-open`)

**PASS:** terminal prints `Jig is on the bench: http://localhost:4600`, `Clamped: ...
ledger-angular`, `Plate: http://localhost:4601/ -> http://localhost:4200`. Opening
`http://localhost:4600` shows **Ledger**'s Invoices table rendered inside the **Plate** panel.
**FAIL:** blank plate with no error — the survey hasn't run yet (see step 2's note). A bound-port
error means something is still listening on 4600/4601 from a prior run — stop it by port first.
**Cleanup:** stop by port `4600` (also frees the `4601` plate proxy it owns).

## 2. What the bench shows first — the SIM strip

Bottom-left ribbon, exact wording: **`SIM`** · **`survey: wired`** · **`proxy: wired`** ·
**`drafter: stub`** · **`shop: none`** · **`fixtures: none`** · **`toolpath: none`** ·
**`sketch: none`**. Also **`bench socket: open`** and *"The logbook — the record of everything
that happened on the bench — is empty so far."*

**Note (found live):** the survey does **not** run automatically on first boot the way
`docs/USING.md` describes — run it once explicitly before or after starting Jig, then restart Jig
so it picks up the write:
```bash
node packages/cli/dist/bin.js survey --repo examples/ledger-angular
```
This is filed as debt-worthy documentation drift, not a product defect — flag to the Lead if it's
worth a ticket; QA did not file it because it's a one-line doc fix, not a shipped behavior gap
(§7's "fix in passing" filter would apply if anyone touches `USING.md` next).

**PASS:** after the survey + restart, the strip reads `survey: wired` (was `stub`) and the
**Survey**/**Gauges** tab counts populate (next step).
**FAIL:** strip still says `survey: stub` after restart — check `examples/ledger-angular/.jig/
survey/survey.json` exists and is non-empty.
**Cleanup:** none yet — `.jig/` is cleaned at the end (step 14).

## 3. Survey tab counts

Click the **Survey** tab (top of the properties column, reads `SURVEY 7`).

**PASS:** shows heading **`stack`** → `angular`; **`components 7`** (App, ShellComponent,
CustomerListComponent, InvoiceDetailComponent, InvoiceFormComponent, InvoiceListComponent,
StatusChipComponent, each with its file path); **`routes 5`**; **`endpoints 0`** (this survey ran
against the Angular repo alone — clamping the sibling `.NET` API adds endpoints, not covered by
this walkthrough); **`clamped docs`** → `0 file(s)`.
**FAIL:** `components 0` — the survey adapter didn't detect Angular; check `angular.json` exists
at the repo root Jig was pointed at.
**Cleanup:** none.

## 4. Loupe pick → the readout

Click the **`Loupe — point at anything and see what it is`** rail icon (the **Loupe** tab's own **`Loupe`** toggle mirrors it automatically — either one alone engages loupe mode). Hover the plate.

**PASS:** the **Loupe** panel shows **`Component`**, **`File`**, **`Tag`**, **`Text`** — hovering
the "Invoices" nav link read `Component: _ShellComponent`, `Tag: a`, `Text: Invoices`, plus
**`gauges it uses`** → *"no gauges on this element itself — its children may carry them."*
Clicking an invoice row with Loupe active shows `Component: InvoiceDetailComponent` (or
`_InvoiceListComponent` from the list) **and does not navigate** — QA confirmed this live
(clicking stayed on the same route; only Hand-tool clicks navigate). A ruler readout also appears
above the plate, e.g. `59×25 @ 138,16 · off the 4px grid by 1.8px (x)`.
**FAIL:** the click navigates away, or the readout stays empty after a click.
**Cleanup:** click **`Hand — move the plate — the app takes your clicks`** to restore normal
navigation before the next step.

## 5. Gauges tab → what lights

Click the **Gauges** tab (`GAUGES 30`).

**PASS:** categories **`colour 10`**, **`type`**, **`space`**, etc., each a list of swatches —
`--ledger-color-paper #f7f4ec`, `--ledger-color-accent #3b6e5e`, and so on, with an instance count
badge per swatch (e.g. `--ledger-color-line ... 11×`). A **`filter by name or value`** search box
sits above the categories.
**FAIL:** `GAUGES 0` — same root cause as a stub survey (step 2).
**Cleanup:** none.

## 6. Mark → the prompt → the tray's draft and its cost

Click **`Mark — a highlighted spot with a request attached`**, then click a spot on the plate. A
form opens at the bottom: placeholder **`what should change here?`**, buttons **`MARK`** /
**`CANCEL`**. Type a request and click **`mark`**.

**PASS:** the tray shows **`#0001`**, the mark text as its title, and the ladder
**`marked`→`drafted`→`released`→`in-the-shop`→`trial-fit`** with the current stage highlighted.
QA's live run (Ollama reachable, `qwen2.5-coder:7b`) produced a real draft in a few seconds,
filling **`WHAT`** / **`WHY`** / **`WHERE`** / **`ACCEPTANCE`** / **`FIXTURE`** — e.g. WHAT: "Show
days overdue next to the due date", ACCEPTANCE: a three-line bulleted list. The draft badge
(verified from `packages/bench/src/orders/TrayRegion.tsx`) reads **`drafted · qwen2.5-coder:7b ·
<N.N>s`** — the model name and elapsed seconds, per Law III ("a process over 300ms shows its
charge, never a bare spinner").
**With `JIG_NO_MODEL=1`** (Ollama probe skipped) and no agent connected, the same mark instead
drafts immediately via the human fallback and badges **`drafted · no local model and no connected
agent — fill the human face yourself`** — the fields are left for you to fill by hand, never a
hard stop. If a shop agent *is* connected but Ollama isn't, the badge instead reads **`queued for
the shop`**.
**FAIL:** the mark form doesn't appear on click (wrong tool active — re-click the rail's Mark
icon), or the badge never leaves an unlabeled `marked` state past ~90s (the drafter's own timeout;
check Ollama is actually serving `http://127.0.0.1:11434`).
**Cleanup:** none yet — this work order carries into the next step.

## 7. Hold RELEASE ≈1s → the shop face

The button reads **`release — hold for about 800 milliseconds`**. **A quick click deliberately
does NOT release** — QA verified this live: a tap shows **`released before the weight — nothing
written`** in ember/orange, and the ladder stays at `drafted`. This is the safety half of the
design, working as specified.
**PASS (the commit half — [Matter-only], see below):** press and hold for about a second; the
button fills with a ring animation, then the ladder advances to `released`, the **shop face**
(the implementation brief, filled from the survey in the app's own Angular idiom) appears, and
`.jig/work-orders/0001-<slug>.md` is written to `examples/ledger-angular/.jig/`.
**FAIL:** holding does nothing, or the file under `.jig/work-orders/` is missing after a
successful-looking release.
**[Matter-only]:** the Browser pane's automation has no raw mousedown/mouseup primitive to sustain
an ~800ms hold, so QA verified only the cancel path (the tap above) plus the full ladder mechanics
over the REST API directly (`scripts/trialfit-smoke.sh`, PASS). The ring-fill/ember visual and the
actual hold-to-commit gesture need your own hand.
**Cleanup:** none yet.

## 8. `jigbench init` → `.mcp.json`

```bash
cd examples/ledger-angular && node ../../packages/cli/dist/bin.js init
```

**PASS:** prints a diff, e.g.:
```
--- .mcp.json (before)
(no .mcp.json yet)
+++ .mcp.json (after)
{
  "mcpServers": { "jig": { "command": "npx", "args": ["jigbench", "mcp"] } }
}
```
then `.mcp.json: added the "jig" MCP server entry.` and `.gitignore: appended .jig/cache/.`
**FAIL:** no diff printed, or `.mcp.json` unchanged on disk after the command.
**Cleanup:** `.mcp.json` is meant to stay (it's what Claude Code reads) — remove it only as part
of the full `.jig`/fixture cleanup at the end.

## 9. Claude Code — `/mcp` shows `jig` [Matter-only]

Open `examples/ledger-angular` in Claude Code. Run **`/mcp`**.

**PASS:** `jig` is listed. Wave-4 council's own live check (recorded on jigbench#1) read
`Claude Code 2.1.259 jig ✔ Connected`; QA's own `mcp-smoke.sh` (read-only mode) proved the
same protocol path with a real SDK client but did not touch Claude Code's own global state.
**FAIL:** `jig` shows **"Pending approval"** — this is Claude Code's own one-time trust gate on a
checked-in `.mcp.json` from an unfamiliar repo, not a Jig bug; approve it once interactively.
**[Matter-only]:** QA's grant forbids touching this machine's global Claude Code config
(`~/.claude.json`) outside the opt-in smoke path, so this step was not run live by QA this pass.

## 10. The prompt `implement-work-order` → `jig_report` → trial fit [Matter-only]

Run the **`implement-work-order`** prompt Claude Code lists from `jig`. Claude claims the released
work order (`jig_claim`), implements it against the Ledger app's own idiom, then calls
**`jig_report`** when done.

**PASS:** the ladder moves `in-the-shop` → `trial-fit`; the plate splits into two frames — the
before snapshot beside the live after — with a toolpath scrubber underneath if one was recorded.
**FAIL:** the ladder never leaves `in-the-shop` — check the agent actually called `jig_report`
(not just finished silently); `wiring.shop` staying `wired` after an agent exits ungracefully was
wave-4 finding 3, fixed (a 10s freshness tick).
**[Matter-only]:** this needs a real Claude Code session with a model actually implementing code —
outside what an agent QA pass can drive or verify.

## 11. Fixture → load → the invoice list changes

Click **`Fixture — a reproducible set of test data`**. Fill **`name`** (e.g. `overdue-heavy`) and
optionally **`seed`**, click **`new fixture`**.

**PASS (verified by QA over the API, `fixture-smoke.sh`):** the fixture appears in the panel;
loading it makes the plate's `/api/invoices` answer from the fixture (proxy response carries
`x-jig-fixture: overdue-heavy`) — the rendered invoice list visibly changes to the fixture's data.
Removing it sends it to the **scrap bin** (counted, regenerable).
**FAIL:** the invoice list doesn't change after loading — check the proxy target is still the
real dev server (`--target` was passed at boot).
**Cleanup:** unload the fixture (`x-jig-fixture` header disappears; list reverts to the real API).

## 12. Toolpath record/replay

Click **`Toolpath — a recorded click sequence, replayable`**, then **`record`**. Click 2-3 things
on the plate, then save with a name. Pick a **replay speed** (`0.5×` / `1×` / `2×`) and replay.

**PASS (verified by QA over the API, `trialfit-smoke.sh`):** a 3-step toolpath saved and read back
byte-for-byte; in the UI, replay drives the plate through the same clicks at the chosen speed.
**FAIL:** replay does nothing — check a toolpath is actually selected from the list before
pressing replay.
**Cleanup:** none required; toolpaths persist under `.jig/toolpaths/` and are cleaned with the
rest.

## 13. Sketch → draw one box

Click **`Sketch — a screen that does not exist yet`**. Panel reads *"no sketches yet."* with a
**`name this sketch`** field and **`new`** button. Name one and click **`new`**.

**PASS:** a blank sketch canvas opens on the plate; drawing uses the app's own gauges (colours,
spacing) rather than generic shapes. Saved sketches live under `.jig/sketches/`.
**FAIL:** `new` does nothing — check the name field isn't empty (a blank name is rejected).
**Cleanup:** see final cleanup below.

## Final cleanup

```bash
rm -rf examples/ledger-angular/.jig examples/ledger-angular/node_modules
for p in 4600 4601 4200 5210; do pid=$(netstat -ano | grep ":$p " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done
git status --short   # should be clean — examples/ is never committed to by Jig or by QA
```
