# Test run — Jig v0.1.0, end to end

A step-by-step run for Matter: prove the published package, drive every part of the bench on the
Ledger example, connect Claude Code as the shop, then the same moves on your own repos on Tuesday.
Every command is bash (Git Bash). Every step ends with what PASS looks like. Steps marked
**[you only]** are the ones an agent on this desk cannot verify — your hand, your machine.
Companion: `demo-1.md` (QA's click-through with the exact UI labels) and `../../USING.md`.

Ports: bench **4600** · plate proxy **4601** · trial-fit mirror **4602** · Angular example **4200**
· .NET example **5210**. Jig never edits application source; it writes only under `.jig/`.

---

## Part 0 — Before you start (once)

**1. Toolchain.**
```bash
node --version && npm --version && dotnet --version && git --version
```
PASS: Node `v22`+ (this desk: v24), .NET `10.x`, git present.

**2. Ollama (the local drafter).** Open the **Ollama** app from the Start menu (it did not survive
the reboot), then:
```bash
curl -s http://127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"'
```
PASS: `"name":"qwen2.5-coder:7b"`. No Ollama? Every step still works — prefix Jig with
`JIG_NO_MODEL=1` and you see the honest no-model path instead of a draft.

**3. Free the ports** (never kill by name — port → PID only):
```bash
for p in 4600 4601 4602 4200 5210; do pid=$(netstat -ano | grep ":$p " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done; echo ports-free
```

**4. The repo (for the example apps; Jig itself comes from npm).**
```bash
cd /c/Users/matte/source/repos/jigbench && git pull -q && npm ci --no-audit --no-fund && npm run build && git log --oneline -1
```
PASS: build ends without `error`; the last line names the current `main` commit.

---

## Part 1 — Prove the published package (2 minutes)

**5. From an empty directory, straight from the registry:**
```bash
T=$(mktemp -d) && cd "$T" && git init -q && npx --yes jigbench@0.1.0 survey && npx --yes jigbench@0.1.0 init && cat .mcp.json && cd /tmp && rm -rf "$T"
```
PASS: `No survey adapter detected a matching repo (registered: angular, dotnet).` then
`Wrote an honest stub survey`; then the `.mcp.json` diff and the file content with
`"command": "npx", "args": ["jigbench", "mcp"]`. That is the whole install story: nothing to
install, no admin.

---

## Part 2 — The example app: every part of the bench (≈25 minutes)

**6. Start the Ledger fixture** — two terminals:
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-api && dotnet run --urls http://localhost:5210
```
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-angular && npm ci --no-audit --no-fund && npx ng serve --port 4200
```
PASS: terminal 1 `Now listening on: http://localhost:5210`; terminal 2 `Local: http://localhost:4200/`.
Open http://localhost:4200 once — you should see **Ledger**'s invoices.

**7. Survey the app** (a third terminal; this is the read Jig makes of the repo):
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-angular && npx jigbench survey && ls .jig/survey
```
PASS: `Survey — 7 components 5 routes 0 endpoints 5 schemas 30 gauges` · `angular: … (ts-morph)`;
files `angular.json survey.json`.
*Optional, to see the .NET adapter:* `npx jigbench survey --repo ..` from the same place reads both
example apps from `examples/` → `7 endpoints 13 schemas` and `dotnet: … (openapi-file)`; then
`rm -rf ../.jig` so it does not confuse step 9.

**8. Clamp some docs** (Jig's own docs stand in for a product's documentation):
```bash
npx jigbench clamp --docs ../../docs && ls .jig/survey
```
PASS: a per-kind summary (`md: N files, M chunks`), `Wrote: … .jig/survey/docs.json`.

**9. Start the bench.** From `examples/ledger-angular` (the target dev server is found from
`angular.json`; add `--target http://localhost:4200` only if you moved it):
```bash
npx jigbench
```
PASS: `Jig is on the bench: http://localhost:4600` · `Clamped: … ledger-angular` · `Plate:
http://localhost:4601/ -> http://localhost:4200`; the browser opens and **Ledger's invoice table is
on the plate**. Bottom ribbon (the SIM strip): `survey: wired` · `proxy: wired` · `drafter: wired`
(with Ollama; `stub` without) · `docs: wired` · `shop: none` · `fixtures: stub` · `toolpath: none`
· `sketch: none`. FAIL: a bound-port error — step 3.

**10. Survey tab** (properties column, right): click **SURVEY 7**.
PASS: `stack angular`, `components 7` with file paths, `routes 5`, `endpoints 0`, `clamped docs`
with the count from step 8.

**11. Loupe** — the rail (left) icon *Loupe — point at anything and see what it is*, **and** the
Loupe tab's own `Loupe` toggle (both; the rail alone does not engage it — a v0.1 quirk). Hover the
plate, then click an invoice row.
PASS: the panel reads `Component`, `File`, `Tag`, `Text` (e.g. `_InvoiceListComponent`), a ruler
readout above the plate like `59×25 @ 138,16 · off the 4px grid by 1.8px (x)`, and **the click does
not navigate**. Then click the rail's *Hand* to give the app its clicks back.

**12. Gauges** — click **GAUGES 30**.
PASS: categories `colour 10` · `type` · `space` · `radius` · `shadow` · `motion`, swatches like
`--ledger-color-accent #3b6e5e` with instance counts; clicking a swatch outlines every component on
the plate that uses it (storm hairline); one `printed` clears the lighting.

**13. The command palette** — press **Ctrl+K**, type `invoice`.
PASS: components, routes and gauges matching; Enter on a component selects it on the plate; **Esc**
closes. Two moves: invoke, then name the thing.

**14. Mark → work order** — rail icon *Mark — a highlighted spot with a request attached*, click
the due-date column header on the plate, type in the prompt field
`the invoice due date should show how many days overdue`, click **mark**.
PASS: the tray shows **#0001**, the ladder `marked → drafted → released → in-the-shop → trial-fit`,
a badge `drafting · local model …` that becomes `drafted · qwen2.5-coder:7b · N.Ns`, and the human
face filled: **WHAT / WHY / WHERE / ACCEPTANCE / FIXTURE**. Without Ollama the badge reads
`drafted · no local model and no connected agent — fill the human face yourself` (fields empty for
you). FAIL: the badge never leaves `marked` after ~90 s — Ollama is not serving (step 2).

**15. Release — the one held gesture [you only].** Tap the **release — hold for about 800
milliseconds** button once: PASS is the honest cancel *released before the weight — nothing
written*. Now press and **hold ~1 s**: the ring fills, the ladder moves to `released`, and the
**shop face** appears — files, patterns, tests, brief, in Angular idiom. Then, in the terminal:
```bash
cat .jig/work-orders/0001-*.md
```
PASS: frontmatter `state: released`, the human face, then `## Shop brief` with `### Files` naming
`src/app/invoices/invoice-list/…`. This file is what the agent will read.

**16. The spine and the scrap bin.** Expand the tray (its handle): every order as a card by
state. Scrap #0001 from its card, watch the scrap-bin count go to 1, restore it. Nothing is ever
deleted (the file stays; its state changes).

**17. Fixtures** — rail icon *Fixture — a reproducible set of test data*: name `overdue-heavy`,
seed `42`, **new fixture**, then **load**.
PASS: the plate's invoice list changes to generated data and a storm chip says
`fixture · overdue-heavy · loaded — the plate answers from it`. Prove it from the terminal:
```bash
curl -sI http://127.0.0.1:4601/api/invoices | grep -i x-jig-fixture
```
PASS: `x-jig-fixture: overdue-heavy`. Click **unload** → the header is gone and the real list is
back. (Same seed, same data, every time — that is the point of a fixture.)

**18. Toolpath** — rail icon *Toolpath — a recorded click sequence, replayable* → **record**,
switch to *Hand*, click Invoices → Customers → an invoice, **stop**, name it `tour`, save; pick `1×`
and **replay**.
PASS: the plate walks the same three clicks; the stops are numbered; `printed` resets.

**19. Sketch** — rail icon *Sketch — a screen that does not exist yet*: **name this sketch**
`Overdue invoices`, **new**; drag a `box`, a `text`, a `button` from the palette onto the sheet;
in the properties column pick a **colour gauge** for the button (only the app's own gauges are
offered — never a raw hex); link the button to the route `/invoices`; save.
PASS: elements snap to the 4px grid; `.jig/sketches/` holds the file; the sketch's HTML render
opens on the plate with the Ledger gauges applied.

---

## Part 3 — The shop: Claude Code builds the work order (≈15 minutes) [you only]

**20. Register Jig with Claude Code** (still in `examples/ledger-angular`; keep the bench running):
```bash
npx jigbench init && cat .mcp.json
```
PASS: `.mcp.json` carries the `jig` server (`npx jigbench mcp`).

**21. Open Claude Code in the example** (a fourth terminal):
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-angular && claude
```
Type `/mcp`. PASS: `jig` listed; the first time it says **Pending approval** — approve it once
(that is Claude Code's trust gate for a checked-in `.mcp.json`, not a Jig fault) → `✔ connected`.
Within ~10 s the bench's **shop lane** (bottom) names the connected client and the SIM strip flips
to `shop: wired`. That is the heartbeat file `.jig/cache/shop.json` being read.

**22. Let the shop build #0001.** In Claude Code, type `/` and pick the `jig` prompt
**implement-work-order**, give it `0001`. Watch: Claude reads `jig://work-orders/0001`, calls
`jig_claim` (the ladder moves to `in-the-shop`), edits the Ledger app test-first, runs its tests,
then calls `jig_report` with a summary.
PASS: the ladder reaches `trial-fit` and **the plate splits in two** — *before · snapshot at
release* on the left, *after · live* on the right — with the toolpath scrubber underneath if you
recorded one in step 18; the shop's reported files are listed beside it. The change itself is in
the Ledger repo's working tree (Jig wrote none of it):
```bash
git -C /c/Users/matte/source/repos/jigbench status --short examples/ledger-angular | head
```
When you are done judging the trial fit, discard the shop's change (it is a fixture):
```bash
git -C /c/Users/matte/source/repos/jigbench checkout -- examples/ledger-angular
```

**No Claude session handy?** Drive the same ladder from the terminal — this is exactly what the
MCP tools call:
```bash
curl -s -X POST http://127.0.0.1:4600/api/work-orders/0001/claim && curl -s -X POST -H 'Content-Type: application/json' -d '{"summary":"renamed the Total column","files":["src/app/invoices/invoice-list/invoice-list.html"]}' http://127.0.0.1:4600/api/work-orders/0001/report
```
PASS: the bench shows `trial-fit` and the two plates.

---

## Part 4 — Claude Desktop (optional, 3 minutes)

**23.** From the clamped repo:
```bash
npx jigbench mcp install --claude-desktop
```
PASS: a diff of `claude_desktop_config.json` with the `jig` entry (absolute `--repo` path) and
**nothing written**. Add `--yes` to write it, restart Claude Desktop, and the `jig` tools appear in
its tools list. Desktop has no repo of its own: it reads and drafts; Claude Code builds.

---

## Part 5 — Tuesday: your prototype repo and the work app

**24. In each repo (Angular frontend; the .NET API beside it or in its own repo):**
```bash
cd /path/to/your/repo && npx jigbench survey && npx jigbench clamp --docs ./docs && npx jigbench init && npx jigbench --target http://localhost:<your ng serve port>
```
- For endpoints and DTO schemas, either run the API so the survey can fetch `/openapi/v1.json`,
  or keep a recorded `openapi*.json` in the repo; without both, the survey falls back to reading
  the C# and **badges the result STUB** rather than guessing.
- If the frontend and API live in one folder, run the survey from that folder (`--repo .`) so both
  adapters are found (the example's `--repo ..` in step 7 is that case).
- Commit `.jig/` (survey, gauges, work orders, fixtures, toolpaths, sketches) and `.mcp.json`; the
  cache is gitignored. Your teammates then share the same work orders and any Claude Code opened in
  the repo sees `jig`.
- A locked-down laptop: `npx jigbench` needs only Node ≥ 22 and a user-level npm cache; Ollama's
  Windows installer is per-user (no admin), or run with `JIG_NO_MODEL=1` and let the connected
  agent draft (`jig_draft`).

**25. When something surprises you**, it is an issue on the public repo:
```bash
gh issue create -R matterjd/jigbench --label debt --title "<what you saw>" --body "<repo type, the command, what happened, what you expected>"
```

---

## Part 6 — Cleanup after the example run

```bash
cd /c/Users/matte/source/repos/jigbench && git checkout -- examples && rm -rf examples/ledger-angular/.jig examples/.jig examples/ledger-angular/node_modules && for p in 4600 4601 4602 4200 5210; do pid=$(netstat -ano | grep ":$p " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done; git status --short
```
PASS: `git status --short` prints nothing.

## Where things live

| Thing | Place |
|---|---|
| The survey, gauges, work orders, fixtures, toolpaths, sketches | `<repo>/.jig/` (files are the state; two processes — the bench and `jigbench mcp` — share it) |
| The agent's registration | `<repo>/.mcp.json` (Claude Code) · `claude_desktop_config.json` (Desktop) |
| The tongue (bench · clamp · survey · plate · loupe · mark · work order · release · the shop · trial fit · toolpath · fixture · gauges · sketch · scrap bin · logbook) | `docs/design/COMMISSION.md` §3 |
| The walk-through in prose | `docs/USING.md` |
| Env switches | `JIG_NO_MODEL=1` (skip the local model) · `JIG_OLLAMA_URL` (a different Ollama) · `JIGBENCH_SMOKE_GLOBAL=1` (the one smoke that touches your global Claude config, opt-in only) |
