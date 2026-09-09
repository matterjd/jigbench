# Test run — Jig 0.2.0, the loop end to end

A step-by-step run for Matter: one `npx jigbench`, the Clamp screen, then the loop on the Ledger
example — Point → requirement → Polish → hold Ready → Build → Built — the Advanced
tour, and the same moves on your own repo. Every command is bash (Git Bash). Every step says where
to look, what to click (labels quoted exactly as the bench shows them), and what PASS looks like.
Steps marked **[you only]** are the ones a remote session cannot verify — your hand, your desk.
`docs/team/v0.2/LOOP-TEST-RUN.md` is the measured draft this run grew from (its Part 2 numbers
were read off a live browser at 1440×900 and 1280×720); `docs/team/v0.1/TEST-RUN.md` is the v0.1
record and stays as it was.

Ports: bench **4600** · plate proxy **4601** · Angular example **4200** · .NET example **5210**.
Jig never edits application source; it writes only under `.jig/`. Claude Code edits source when
you press **Build** — and only then.

---

## The bench at a glance

| Region | Where | What it holds |
|---|---|---|
| **Clamp screen** | the whole window, before a repo is clamped | **recent benches**, **pick the repo folder** (the folder browser + a path field), **Clamp**; after the clamp: **what the survey found**, **the app**, **docs**, **Claude Code**, **go to the bench →** |
| **Rail** | the narrow strip on the far left | three tools top to bottom: **Point**, **Sketch**, **Hand** (`P` · `S` · `H`; `Esc` → Hand). Hover one to read its pairing, e.g. *Point — click a component to open the prompt card*. The **Advanced** switch sits at the rail's foot. |
| **Plate** | the centre | the app you clamped, running live, clean — no rulers or guides unless Advanced is on. The **prompt card** opens here, beside your selection. |
| **Right column** | 340px on the right | tabs **Prompts · Inspect · Design system** |
| **Status line** | the one line at the very bottom | `Claude · nothing clamped` (before any clamp — the `claude`-on-PATH probe runs at the clamp, so there is nothing to report yet) / `Claude · idle` / `· building · 00:42 · …` / `· built · 3 files · 1m 12s` / `· not installed` (click → the logbook drawer) and **setup** at the right end (click → the checklist drawer) |

One rule from v0.1 is gone: you never need `--repo .` any more. The Clamp screen sends the
absolute path of the folder you picked; nothing walks up to a parent `.git`.

---

## Part 0 — Before you start (once)

**1. Toolchain.**
```bash
node --version && npm --version && dotnet --version && git --version && claude --version
```
PASS: Node `v22`+ (this desk: v24), .NET `10.x`, git present, and a Claude Code version — Build
needs `claude` on PATH. No `claude`? Everything up to Build still works and the status line says
`Claude · not installed` **once a repo is clamped** (before that it reads `Claude · nothing
clamped` — the probe runs at the clamp); Build is the one step that stops.

**2. Ollama (optional — Polish).** It usually starts with Windows; check:
```bash
curl -s http://127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"'
```
PASS: `"name":"qwen2.5-coder:7b"`. Nothing? Start the **Ollama** app from the Start menu and
re-check, or skip it: with no model the card simply has no **Polish** button (step 14 says so).

**3. Free the ports** (never kill by name — port → PID only):
```bash
for p in 4600 4601 4200 5210; do pid=$(netstat -ano | grep ":$p " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done; echo ports-free
```

**4. The repo (for the example apps; Jig itself comes from npm).**
```bash
cd /c/Users/matte/source/repos/jigbench && git pull -q && git log --oneline -1
```
PASS: the last line names the current `main` commit (0.2.0 or later).

---

## Part 1 — Prove the published package (2 minutes) [you only, after `npm publish`]

**5. From an empty directory, straight from the registry:**
```bash
T=$(mktemp -d) && cd "$T" && npx --yes jigbench@0.2.0 --no-open --port 4699 & sleep 8; curl -s http://127.0.0.1:4699/api/state | head -c 200; echo; pid=$(netstat -ano | grep ":4699 " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; cd /tmp && rm -rf "$T"
```
PASS: the terminal prints `Jig is on the bench: http://localhost:4699` and `No repo clamped yet —
open the bench to pick one.`; the `curl` answers `{"bench":null,…` — the Clamp screen's server side,
from the registry, in a folder that is not a repo.

---

## Part 2 — The example app: the loop (≈20 minutes)

Two terminals: T1 for the Ledger API, T2 for Jig. The Angular app is started **from the bench**.

**6. T1 — start the Ledger API.**
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-api && dotnet run --urls http://localhost:5210
```
PASS: `Now listening on: http://localhost:5210`. Leave it running.

**7. T2 — the Angular example's dependencies (first time only), then Jig from OUTSIDE any repo.**
```bash
cd /c/Users/matte/source/repos/jigbench/examples/ledger-angular && npm ci --no-audit --no-fund && cd /tmp && npx jigbench
```
PASS in T2:
```
Jig is on the bench: http://localhost:4600
No repo clamped yet — open the bench to pick one.
```
and the browser opens on the **Clamp** screen: the word **Jig** with its pairing, **Clamp —
attach a repo; the survey reads it**, **recent benches** (*No recent benches yet — pick a folder
below.* on a fresh desk), and **pick the repo folder**.

**8. Pick the repo.** In the folder browser click the `C:` root, then walk `Users` → `matte` →
`source` → `repos` → `jigbench` → `examples` → `ledger-angular` (each row you click fills the
path field under the browser; `up` goes back one level). Rows that are repos carry badges —
`ledger-angular` shows `package.json` and `angular.json` (no `git`: the example lives inside the
jigbench repo, so the `.git` is two levels up); `ledger-api` shows `.csproj`.
Or paste `C:\Users\matte\source\repos\jigbench\examples\ledger-angular` into the field.
PASS: the **Clamp** button turns ember once the field has a path. Click it. The screen says
*clamping · the survey reads the repo — a few seconds*, then **what the survey found**:
`stack angular` · `components 7` · `routes 5` · `endpoints 0` · `gauges 30` (or thereabouts) ·
`docs none yet — below` · `the app npm run start · port 4200`.
(The Ledger example has no `docs/` folder of its own; step 10 clamps one.) FAIL: *not clamped · no such path*
→ check the path.

**9. Start the app.** In **the app** block click **Start the app**.
PASS: the line reads *starting · waiting for the port to answer*, **the app's own log** fills with
`ng serve`'s lines, and within a minute the line reads *up · http://localhost:4200 · pid NNNN*.
(A `stop` button appears beside it; leave it running.) Already have `ng serve` up from a terminal?
Paste `http://localhost:4200` and click **use this URL** instead.

**10. Docs.** In **docs**, replace `./docs` with `../../docs` (Jig's own docs stand in for a
product's) and click **clamp docs**.
PASS: *19 files · 143 chunks* (or thereabouts).

**11. Register with Claude Code.** In **Claude Code** click **Register with Claude Code**.
PASS: **what .mcp.json will say** shows the `jig` server entry (`npx jigbench mcp --repo <the
absolute path>`) and nothing is written yet. Click **write .mcp.json**. PASS: *written ·
.mcp.json*. Prove it:
```bash
cat /c/Users/matte/source/repos/jigbench/examples/ledger-angular/.mcp.json
```
Optional: **Claude Desktop — also add the entry** shows the Desktop config change, **write the
Desktop entry** writes it.

**12. go to the bench →.** Click it.
PASS: the rail (Point · Sketch · Hand), the Ledger **Invoices** table inside the plate, the right
column on **Prompts** (*No prompts yet — Point at the plate and click a component, or Sketch a
screen.*), the status line `Claude · idle`. Click **setup** at the right end of the status line:
the checklist drawer reads `survey read` · `the app up · http://localhost:4200` · `docs clamped`
· `.mcp.json written` · `Claude Code installed`. **close** it.

**13. Point → the prompt card.** Point is the active tool at rest. Move over the plate: components
outline in a thin storm hairline with their name. Click the **Due** column header.
PASS: a **prompt card** opens beside the header (never over it) titled with the component
(`InvoiceListComponent`) and its file line; the field **what should change here?**; **acceptance
· optional** with **+ add a line**; **Ready** greyed with *· write the requirement first*.
**Inspect** (right column) shows the same selection: component, file, tag, text, the gauges it
uses as chips, its routes.

**14. The requirement.** Type `the invoice due date should show how many days overdue`.
PASS: **Ready** turns ember (*· hold*); the card's foot reads `draft`; **Prompts** lists it under
**draft** as `0001` with a slug made from your words, and the file exists:
```bash
ls /c/Users/matte/source/repos/jigbench/examples/ledger-angular/.jig/prompts/
```
With Ollama running a **Polish** button sits beside Ready — click it: the words tighten and
acceptance lines appear (*your own words are never lost*). With no model there is no Polish
button at all — not a greyed one.

**15. Ready — the one held gesture [you only].**
- **Tap it once, quickly.** PASS: *let go early — still a draft · 303 ms of 800* (your number will
  differ) and nothing changes. That is the safety: a tap cannot commit.
- **Press and hold for about a second.** PASS: the ring fills, the Prompts row's pip takes a gold
  ring under **ready**, and the card's one ember act is now **Build · runs Claude Code**.
```bash
cat /c/Users/matte/source/repos/jigbench/examples/ledger-angular/.jig/prompts/0001-*.md
```
PASS: frontmatter `state: ready`, `# Requirement` with your words, `## Context` naming the
component and file, `## Rules`. This file is exactly what Claude receives.

**16. Build [you only].** Click **Build**.
PASS: the card says *Claude is building — the words are locked while it runs*; the status line
reads `Claude · building · 00:02 · …` with the latest step, its pip pulsing (the one thing moving
on the page); the stream ribbon on the card and in **Prompts** lists Claude's steps. Click the
status line: the **logbook** drawer opens with every step as a `Claude` row, your clamp and
survey as `human`/`bench` rows, and `ng serve`'s lines as `app` rows; the pills filter by who.
When Claude exits: `Claude · built · N files · m:ss`, the prompt moves to **built**. FAIL: `Claude
· not installed` → step 1.

**17. Built.** In **Prompts** click the built prompt.
PASS: its **built** line reads *built · N files* and lists the files Claude touched, with
**refine — go again** beside it (opens a new draft on the same target with the words pre-filled).
There is no *before* switch: the plate shows the app after the build, and a snapshot at Ready is
not kept for a prompt yet (#8, open). The change is in the working tree; Jig wrote none of it:
```bash
git -C /c/Users/matte/source/repos/jigbench status --short examples/ledger-angular | head
```
When you are done judging it, discard the change (the example is a fixture):
```bash
git -C /c/Users/matte/source/repos/jigbench checkout -- examples/ledger-angular
```

**18. Design system.** Click the tab **Design system**.
PASS: the gauges by category (`colour 10`, `type`, `space`, `radius`, `shadow`, `motion`) with
use counts; click a colour swatch and every use on the plate takes a dashed storm outline;
**printed** clears it.

**19. Sketch.** Press `S`. Name a sketch `Overdue invoices`, click **new**.
PASS: a sheet at the app's size; draw a box, then a button; drag the button toward the box's edge:
it snaps within 6px, an alignment line shows on each held axis, and the sheet says the coordinates.
**build this screen →** opens the prompt card with that title. `Esc` returns to Hand.

**20. The palette.** `Ctrl+K`, type `design`, `Enter`.
PASS: the Design system tab opens — two moves. `Esc` closes.

---

## Part 3 — Advanced (5 minutes)

**21.** Switch **Advanced** on at the rail's foot.
PASS: a drawer under the plate with the wiring strip (`survey: wired · proxy: wired · docs: wired
…`), **the spine — every prompt on the ladder** (your prompt on its rung), **rulers & guides**
(switch it on: rulers in the app's px around the plate), a line in place of the mirror (*the
mirror — before | after — returns once a built prompt keeps its before*), `scrap bin · 0`, **fixtures** (the form's reproducibility field reads **key (optional)**),
**toolpath** (**record**, then Hand-click `Customers` → `Invoices` → a row, **stop**, name it
`tour`, **replay**), and **MCP — the secondary door** (*none connected* until an agent attaches).
Switch Advanced off: the plate is whole again.

**22. MCP, the secondary door [you only].** In a terminal in the example, `claude`, then `/mcp`.
PASS: `jig` is listed (approve it once); within ~10 s **MCP — the secondary door** under Advanced
names the client and the strip reads `shop: wired`. Claude Desktop reads prompts over the same
door; only **Build** runs Claude Code.

---

## Part 4 — Your own repo (Tuesday)

**23.** From anywhere:
```bash
npx jigbench
```
Pick the repo on the Clamp screen (it is in **recent benches** from the second time on — one
click). **Start the app** runs whatever `package.json`'s `start`/`dev`/`serve` script is (or
`ng serve` from `angular.json`); paste a URL for anything else. Register with Claude Code from the
same screen. Then the loop: Point → requirement → Ready → Build.

- A non-Angular app: the survey's stack reads `web`, components and routes read *unknown —
  this adapter cannot list them*; Point still names React and Vue components at runtime, and the
  tag and DOM path for anything else. The loop runs the same.
- For endpoints and DTO schemas, either run the API so the survey can fetch `/openapi/v1.json`,
  or keep a recorded `openapi*.json` in the repo; with neither, the survey reads the C# and
  badges the result STUB rather than guessing.
- Commit `.jig/` (survey, gauges, prompts, fixtures, sketches) and `.mcp.json`; the cache is
  gitignored. Teammates share the same prompts, and any Claude Code opened in the repo sees `jig`.
- A locked-down laptop: `npx jigbench` needs only Node ≥ 22 and a user-level npm cache; Ollama's
  Windows installer is per-user (no admin), or skip Polish.

**24. When something surprises you**, it is an issue on the public repo:
```bash
gh issue create -R matterjd/jigbench --label debt --title "<what you saw>" --body "<repo type, the command, what happened, what you expected>"
```

---

## Part 5 — Cleanup after the example run

`Ctrl+C` in T1 and T2 (the bench stops the `ng serve` it started), then:
```bash
cd /c/Users/matte/source/repos/jigbench && git checkout -- examples && rm -rf examples/ledger-angular/.jig examples/ledger-angular/.mcp.json examples/ledger-angular/node_modules && for p in 4600 4601 4200 5210; do pid=$(netstat -ano | grep ":$p " | grep LISTENING | awk '{print $NF}' | head -1); [ -n "$pid" ] && taskkill //PID "$pid" //F; done; git status --short
```
PASS: `git status --short` prints nothing.

## Where things live

| Thing | Place |
|---|---|
| The survey, gauges, prompts, fixtures, toolpaths, sketches | `<repo>/.jig/` (files are the state; the bench and `jigbench mcp` are two processes sharing it) |
| The recent benches | `~/.jig/recent.json` |
| The agent's registration | `<repo>/.mcp.json` (Claude Code) · `claude_desktop_config.json` (Desktop) |
| The tongue | `docs/design/COMMISSION.md` §3 as amended by `docs/design/AMENDMENT-1-the-simplification.md` §3 |
| The walk-through in prose | `docs/USING.md` |
| Env switches | `JIG_NO_MODEL=1` (skip the local model) · `JIG_OLLAMA_URL` (a different Ollama) · `JIGBENCH_SMOKE_GLOBAL=1` (the one smoke that touches your global Claude config, opt-in only) |
