# Test run — Jig v0.1.0, end to end

A step-by-step run for Matter: prove the published package, drive every part of the bench on the
Ledger example, connect Claude Code as the shop, then the same moves on your own repos on Tuesday.
Every command is bash (Git Bash). Every step says where to look, what to click (labels quoted
exactly as the bench shows them), and what PASS looks like. Steps marked **[you only]** are the
ones an agent on this desk cannot verify — your hand, your machine.

Ports: bench **4600** · plate proxy **4601** · trial-fit mirror **4602** · Angular example **4200**
· .NET example **5210**. Jig never edits application source; it writes only under `.jig/`.

---

## The bench at a glance

When Jig opens in the browser you see five regions:

| Region | Where | What it holds |
|---|---|---|
| **Rail** | a narrow dark strip on the far left | six tool icons, top to bottom: **Hand**, **Loupe**, **Mark**, **Fixture**, **Toolpath**, **Sketch**. Hover one to read its full name, e.g. *Loupe — point at anything and see what it is*. The lit icon is the active tool. |
| **Plate** | the large centre area, with rulers along its top and left edges | the app you clamped, running live (here: Ledger's **Invoices** table). |
| **Properties column** | the right-hand column | tabs across its top: **Loupe · Gauges · Survey · Fixture** (a **Toolpath** tab and a **Sketch** tab appear when you pick those tools). The Loupe tab has a two-button toggle **Hand | Loupe**. |
| **Tray** | the strip along the bottom, above the ribbon | the work order in hand (its number, the ladder `marked → drafted → released → in-the-shop → trial-fit`, the human face, the **release** button) and a **work orders · N** button that expands it into the spine. |
| **Ribbon** | the very bottom line | the SIM strip (`survey: wired · proxy: wired · drafter: wired …`), the logbook line, and the shop lane (which agent is connected). |

One rule that will save you a confused minute: **inside the jigbench repo's `examples/` folders you
must pass `--repo .`** — otherwise Jig walks up to the nearest `.git` and clamps the whole monorepo
(you'd see `survey: stub`). In your own repos the git root *is* the app, so it is automatic.

---

## Part 0 — Before you start (once)

**1. Toolchain.**
```bash
node --version && npm --version && dotnet --version && git --version
```
PASS: Node `v22`+ (this desk: v24), .NET `10.x`, git present.

**2. Ollama (the local drafter).** It usually starts with Windows; check:
```bash
curl -s http://127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"'
```
PASS: `"name":"qwen2.5-coder:7b"`. If you get nothing, open the **Ollama** app from the Start menu
and re-check. No Ollama at all? Everything still works — prefix `JIG_NO_MODEL=1` before the
`jigbench` commands and step 14 shows the honest no-model path instead of a draft.

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

## Part 1 — Prove the published package (2 minutes) — *confirmed by Matter 2026-09-06*

**5. From an empty directory, straight from the registry:**
```bash
T=$(mktemp -d) && cd "$T" && git init -q && npx --yes jigbench@0.1.0 survey && npx --yes jigbench@0.1.0 init && cat .mcp.json && cd /tmp && rm -rf "$T"
```
PASS: `No survey adapter detected a matching repo (registered: angular, dotnet).` then
`Wrote an honest stub survey`; then the `.mcp.json` diff and the file content with
`"command": "npx", "args": ["jigbench", "mcp"]`.

---

## Part 2 — The example app: every part of the bench (≈30 minutes)

You will use **three terminals**. Open three Git Bash windows and label them in your head T1, T2, T3.

**6. T1 — start the Ledger API.**
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-api && dotnet run --urls http://localhost:5210
```
PASS: the last lines include `Now listening on: http://localhost:5210`. Leave it running.

**7. T2 — start the Ledger Angular app** (the first `npm ci` takes a minute or two).
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-angular && npm ci --no-audit --no-fund && npx ng serve --port 4200
```
PASS: `Local: http://localhost:4200/`. Open http://localhost:4200 in a browser tab once — you should
see **Ledger** with an **Invoices** table (eight invoices, statuses like Paid / Sent / Overdue).
Leave T2 running.

**8. T3 — survey the app.** This is the read Jig makes of the repo. Note the `--repo .`.
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-angular && npx jigbench survey --repo . && ls .jig/survey
```
PASS:
```
Survey — 7 components 5 routes 0 endpoints 5 schemas 30 gauges
  angular: C:/Users/matte/source/repos/jigbench/examples/ledger-angular (ts-morph)
```
and `ls` shows `angular.json  survey.json`. (`0 endpoints` is expected: this folder is the Angular
app alone. To see the .NET adapter too, run `npx jigbench survey --repo ..` — it finds both example
apps under `examples/` → `7 endpoints 13 schemas`, `dotnet: … (openapi-file)` — then `rm -rf ../.jig`
so it does not shadow the run below.)

**9. T3 — clamp some documentation** (Jig's own docs stand in for a product's):
```bash
npx jigbench clamp --docs ../../docs --repo . && ls .jig/survey
```
PASS: `Total: 19 files, 143 chunks` (or thereabouts) and `Wrote: … .jig/survey/docs.json`.

**10. T3 — start the bench.**
```bash
npx jigbench --repo .
```
PASS in T3:
```
Jig is on the bench: http://localhost:4600
Clamped: C:\Users\matte\source\repos\jigbench\examples\ledger-angular
Plate: http://localhost:4601/ -> http://localhost:4200
```
(the target is found from `angular.json`; add `--target http://localhost:4200` only if you changed
the port). Your browser opens http://localhost:4600. PASS on screen: the **Ledger Invoices table is
inside the plate**, rulers around it; in the ribbon at the very bottom the SIM strip reads
`survey: wired` · `proxy: wired` · `drafter: wired` (`stub` if you skipped Ollama) · `docs: wired`
· `shop: none` · `fixtures: none` · `toolpath: none` · `sketch: none`, and the logbook says it is
empty so far. FAIL: `survey: stub` → you forgot `--repo .` (T3 will say `Clamped: …\jigbench`);
stop with Ctrl+C and redo steps 8–10. A bound-port error → step 3.

**11. Survey tab.** In the properties column (right), click the tab **Survey**.
PASS: `stack angular`; `components 7` — App, ShellComponent, CustomerListComponent,
InvoiceDetailComponent, InvoiceFormComponent, InvoiceListComponent, StatusChipComponent, each with
its file path; `routes 5`; `endpoints 0`; `clamped docs` with the file count from step 9.

**12. Loupe** — point at anything and learn what it is.
- Click the **Loupe** tab (properties column), then inside it click the toggle button **Loupe**
  (the pair reads **Hand | Loupe**). Also click the rail's second icon, *Loupe — point at anything
  and see what it is*. (v0.1 quirk: the rail icon alone does not engage the loupe; the tab's toggle
  does.)
- Move the mouse over the plate: elements outline in a thin cyan line and the Loupe tab fills in
  **Component**, **File**, **Tag**, **Text** — e.g. hovering the `Invoices` nav link reads
  `Component: _ShellComponent · Tag: a · Text: Invoices`.
- Click an invoice row. PASS: the readout shows `_InvoiceListComponent` (or the row's component),
  a ruler readout appears above the plate like `59×25 @ 138,16 · off the 4px grid by 1.8px (x)`,
  and **the page does not navigate** (the loupe swallows the click).
- Finish by clicking the rail's top icon **Hand** — the app gets its clicks back. Click
  `Customers` in the Ledger nav to prove it navigates again, then `Invoices`.

**13. Gauges** — the app's design system, measured. Click the tab **Gauges**.
PASS: categories `colour 10`, `type`, `space`, `radius`, `shadow`, `motion`, each a list of
swatches such as `--ledger-color-accent #3b6e5e` with a usage count badge (`11×`). Click a colour
swatch: every component on the plate whose stylesheet uses it gets a cyan outline. Click the
**printed** button at the top of the panel: the lighting clears. Type `line` in the
*filter by name or value* box: the list narrows; **printed** clears it.

**14. The command palette.** Press **Ctrl+K** anywhere. Type `invoice`.
PASS: a list of matching components, routes and gauges; arrow down + Enter on a component selects
it on the plate and opens the Loupe tab on it; **Esc** closes the palette. Two moves: invoke, then
name the thing.

**15. Mark → work order** — the heart of the loop.
- Click the rail's third icon *Mark — a highlighted spot with a request attached*.
- Click the **Due** column header in the Ledger table on the plate.
- A one-line form appears in the tray with the placeholder **what should change here?** and two
  buttons **mark** / **cancel**. Type
  `the invoice due date should show how many days overdue` and click **mark**.
PASS: the tray now shows **#0001**, the ladder `marked → drafted → released → in-the-shop →
trial-fit` with `marked` lit, and a status line. With Ollama running the status reads
`drafting · local model …` for a few seconds, then the order moves to `drafted`, the badge reads
`drafted · qwen2.5-coder:7b · N.Ns`, and the human face fields are filled: **what** (on this desk
the model wrote *"Show days overdue next to the due date"*), **why**, **where**, **acceptance**
(a bulleted list), **fixture**. With `JIG_NO_MODEL=1` and no agent connected, the order drafts at
once via the human fallback, badged *no local model and no connected agent — fill the human face
yourself*, and the fields are yours to type. FAIL: the ladder never leaves `marked` after ~90 s →
Ollama is not answering (step 2).

**16. Release — the one held gesture [you only].** In the tray, find the button **release — hold
for about 800 milliseconds** (while the draft is still pending it says *release needs a drafted
order first.*).
- **Tap it once, quickly.** PASS: nothing happens except the words *released before the weight —
  nothing written* in orange. That is the safety: a tap cannot commit.
- **Press and hold for about a second.** PASS: a ring fills around the button, the ladder moves to
  `released`, and the **shop face** appears below the human face: **Files** (the Angular files to
  touch), **Patterns**, **Tests**, **Brief** — in the app's own idiom.
- In T3 (or a fourth terminal), read the file it wrote:
```bash
cat /c/Users/matte/source/repos/jigbench/examples/ledger-angular/.jig/work-orders/0001-*.md
```
PASS: frontmatter with `state: released`, the human face, then `## Shop brief` with `### Files`
naming `src/app/invoices/invoice-list/…`. This file is what the agent reads in Part 3.

**17. The spine and the scrap bin.** Click **work orders · 1** in the tray.
PASS: the tray expands into the spine — every order as a card grouped by state along the ladder,
with its age and who drafted it. Scrap #0001 from its card: the scrap bin count becomes 1 and the
card moves there; **restore** brings it back. Nothing is deleted — the file on disk only changes
state. Collapse the tray again.

**18. Fixtures** — reproducible test data. Click the rail's fourth icon *Fixture — a reproducible
set of test data* (the **Fixture** tab opens).
- Two fields: the first is the fixture's **name** (type `overdue-heavy`), the second the **seed**
  (type `42`). Click **new fixture**.
- The fixture appears in the panel's list. Click its **load**.
PASS: the Ledger table on the plate changes to generated invoices, and a cyan chip on the plate's
frame reads `fixture · overdue-heavy · loaded — the plate answers from it`. Prove it from a terminal:
```bash
curl -sI http://127.0.0.1:4601/api/invoices | grep -i x-jig-fixture
```
PASS: `x-jig-fixture: overdue-heavy`. Now click **fill the form** while the Ledger *New invoice*
form is open on the plate (rail **Hand**, click **New invoice** in the app, then back to the
Fixture tab): the form fields fill with the fixture's values. Click **unload**: the chip goes, the
`curl` header disappears, the real invoices return. Same seed, same data, every time.

**19. Toolpath** — record a click sequence, replay it. Click the rail's fifth icon *Toolpath — a
recorded click sequence, replayable* (the **Toolpath** tab opens, with **record**, speed buttons
**0.5× · 1× · 2×**, and **printed**).
- Click **record**, switch the rail to **Hand**, and click in the Ledger app: `Customers`, then
  `Invoices`, then one invoice row. Back in the Toolpath tab click **stop**, name it `tour`, save.
PASS: `tour` is listed with 3 numbered stops. Choose **1×** and click its **replay**: the plate
walks the same three clicks, the current stop highlighted. **printed** resets the scrubber.

**20. Sketch** — a screen that does not exist yet. Click the rail's sixth icon *Sketch — a screen
that does not exist yet* (the **Sketch** tab opens: *no sketches yet.*, a field **name this
sketch**, a button **new**).
- Type `Overdue invoices`, click **new**. PASS: the plate becomes a blank sheet at the app's size,
  and a palette of primitives appears (box · text · button · input · image · list).
- Drag a **box**, a **text** and a **button** onto the sheet; they snap to the 4px grid.
- With the button selected, the properties column offers **gauge pickers** — choose a colour gauge
  for its fill (only Ledger's own gauges are offered, never a raw colour); set its **link** to the
  route `/invoices`; save.
PASS: `.jig/sketches/` holds the file, and the sketch's HTML render opens on the plate with
Ledger's colours and spacing applied. **Esc** returns to Hand.

---

## Part 3 — The shop: Claude Code builds the work order (≈15 minutes) [you only]

**21. Register Jig with Claude Code** (T4, a new terminal; keep T3's bench running):
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-angular && npx jigbench init --repo . && cat .mcp.json
```
PASS: a diff, then `.mcp.json: added the "jig" MCP server entry.`; the file lists the `jig` server
(`npx jigbench mcp`).

**22. Open Claude Code in the example** (same T4):
```bash
claude
```
Type `/mcp`. PASS: `jig` is listed. The first time it says **Pending approval** — that is Claude
Code's own trust gate for a checked-in `.mcp.json`; approve it once → `✔ connected`. Within ~10 s the
bench's **shop lane** (ribbon, bottom right) names the connected client and the SIM strip flips to
`shop: wired`. (The heartbeat file `.jig/cache/shop.json` is how the bench knows.)

**23. Let the shop build #0001.** In Claude Code, type `/` and pick the `jig` prompt
**implement-work-order**; give it `0001`. Watch: Claude reads `jig://work-orders/0001`, calls
`jig_claim` (the tray's ladder moves to `in-the-shop`), edits the Ledger app test-first, runs its
tests, then calls `jig_report` with a summary.
PASS: the ladder reaches `trial-fit` and **the plate splits in two** — left *before · snapshot at
release*, right *after · live* — with the toolpath scrubber underneath (replay `tour` on both) and
the files the shop reported listed beside it. The code change is in the Ledger repo's working
tree; Jig wrote none of it:
```bash
git -C /c/Users/matte/source/repos/jigbench status --short examples/ledger-angular | head
```
When you are done judging the trial fit, discard the change (the example is a fixture):
```bash
git -C /c/Users/matte/source/repos/jigbench checkout -- examples/ledger-angular
```

**No Claude session handy?** Drive the same ladder from a terminal — this is exactly what the
MCP tools do underneath:
```bash
curl -s -X POST http://127.0.0.1:4600/api/work-orders/0001/claim && curl -s -X POST -H 'Content-Type: application/json' -d '{"summary":"renamed the Total column","files":["src/app/invoices/invoice-list/invoice-list.html"]}' http://127.0.0.1:4600/api/work-orders/0001/report
```
PASS: the bench shows `trial-fit` and the two plates.

---

## Part 4 — Claude Desktop (optional, 3 minutes)

**24.** From the clamped repo:
```bash
npx jigbench mcp install --claude-desktop --repo .
```
PASS: a diff of `claude_desktop_config.json` with the `jig` entry (absolute `--repo` path) and
**nothing written**. Add `--yes` to write it, restart Claude Desktop, and the `jig` tools appear in
its tools list. Desktop reads and drafts; Claude Code builds.

---

## Part 5 — Tuesday: your prototype repo and the work app

**25. In each repo** (from its git root, so `--repo` is not needed):
```bash
cd /path/to/your/repo && npx jigbench survey && npx jigbench clamp --docs ./docs && npx jigbench init && npx jigbench --target http://localhost:<your ng serve port>
```
- For endpoints and DTO schemas, either run the API so the survey can fetch `/openapi/v1.json`,
  or keep a recorded `openapi*.json` in the repo; with neither, the survey reads the C# and
  **badges the result STUB** rather than guessing.
- If the frontend and the API live in one folder, run the survey from that folder so both adapters
  are found (step 8's `--repo ..` shows that shape).
- Commit `.jig/` (survey, gauges, work orders, fixtures, toolpaths, sketches) and `.mcp.json`; the
  cache is gitignored. Teammates share the same work orders, and any Claude Code opened in the
  repo sees `jig`.
- A locked-down laptop: `npx jigbench` needs only Node ≥ 22 and a user-level npm cache; Ollama's
  Windows installer is per-user (no admin), or run `JIG_NO_MODEL=1` and let the connected agent
  draft (`jig_draft`).

**26. When something surprises you**, it is an issue on the public repo:
```bash
gh issue create -R matterjd/jigbench --label debt --title "<what you saw>" --body "<repo type, the command, what happened, what you expected>"
```

---

## Part 6 — Cleanup after the example run

Ctrl+C in T1, T2 and T3 (or the port loop), then:
```bash
cd /c/Users/matte/source/repos/jigbench && git checkout -- examples && rm -rf examples/ledger-angular/.jig examples/.jig examples/ledger-angular/node_modules && for p in 4600 4601 4602 4200 5210; do pid=$(netstat -ano | grep ":$p " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done; git status --short
```
PASS: `git status --short` prints nothing.

## Where things live

| Thing | Place |
|---|---|
| The survey, gauges, work orders, fixtures, toolpaths, sketches | `<repo>/.jig/` (files are the state; the bench and `jigbench mcp` are two processes sharing it) |
| The agent's registration | `<repo>/.mcp.json` (Claude Code) · `claude_desktop_config.json` (Desktop) |
| The tongue (bench · clamp · survey · plate · loupe · mark · work order · release · the shop · trial fit · toolpath · fixture · gauges · sketch · scrap bin · logbook) | `docs/design/COMMISSION.md` §3 |
| The walk-through in prose | `docs/USING.md` |
| Env switches | `JIG_NO_MODEL=1` (skip the local model) · `JIG_OLLAMA_URL` (a different Ollama) · `JIGBENCH_SMOKE_GLOBAL=1` (the one smoke that touches your global Claude config, opt-in only) |
