# Using Jig

A walk through the whole loop — clamp, survey, the plate, Point, the prompt card, Polish, Ready,
Build, Built — plus Sketch, the logbook and everything behind the Advanced switch. Every quoted
word or label below is what the bench actually says (`packages/bench/src/**`), not a paraphrase.
`docs/TEST-RUN.md` is the same loop as a step-by-step run with PASS lines.

## Clamp

One terminal command, ever:

```bash
npx jigbench
```

From a folder that is not a repo, the bench opens on the **Clamp** screen (its pairing: *"attach a
repo; the survey reads it"*). **recent benches** lists every repo you clamped before — one click
re-clamps it. Under **pick the repo folder** the folder browser walks your drives (or `/` and
`~`); a folder that is a repo carries a `git`, `package.json`, `angular.json` or `.csproj` badge,
and `docs` when it has a docs folder. Pick one, or paste a path into the field under the browser,
and press **Clamp** — the one ember act on the screen. While it runs the screen says *"clamping ·
the survey reads the repo — a few seconds"*; a path Jig cannot clamp is answered in words
(*"not clamped · no such path: …"*), never a blank.

From inside a repo (a folder with a `.git`), `npx jigbench` clamps that repo at once and skips the
screen. The terminal prints `Jig is on the bench: http://localhost:4600` and `Clamped: <repo
path>`.

## Survey

The survey runs on clamp and the Clamp screen shows **what the survey found**: the stack, how
many components, routes and endpoints, how many gauges, whether docs were clamped, and what
**the app** is — `npm run start · port 4200` when a dev script was detected. The files land under
`.jig/survey/` and `.jig/gauges.json`; the survey runs again on demand with `npx jigbench survey`.

Jig works with any app that has a dev server — the loop never depends on a survey adapter, and
adapters only enrich it (Angular and .NET 10 have dedicated ones: real components, routes, and API
endpoints). Every other repo still gets a real survey from the generic **web** adapter: any
`package.json` or stylesheet is enough to match, and it reads CSS custom properties, SCSS `$vars`
and Less `@vars` into gauges, guesses a dev-server URL from `package.json`'s scripts, and lists
any frameworks it recognizes from the manifest — honest hints, never invented. Where no stack
adapter matches, the stack reads `web` and components and routes are marked *unknown*, not
guessed at. An app nothing recognizes at all gets an honest stub, never a crash.

## The app, docs, Claude Code — setup on the screen

Three blocks follow the survey on the Clamp screen, and the same three live in the **setup**
checklist one click from the right end of the status line on every bench:

- **the app** — **Start the app** runs the detected dev script inside the repo (the words say
  which: *"Start the app runs npm run start · port 4200"*); its own log streams under the button
  and the line walks *"starting · waiting for the port to answer"* → *"up · http://localhost:4200
  · pid …"*. Already have it running? Paste its URL and press **use this URL**.
- **docs** — a folder Jig reads so the prompt can quote matching chunks. `./docs` is clamped for
  you when it exists; **clamp docs** takes any other folder (markdown, text, PDF) and answers
  with *"N files · M chunks"*.
- **Claude Code** — *"Build runs Claude Code itself in the repo; MCP stays for other agents."*
  **Register with Claude Code** shows **what .mcp.json will say** first; **write .mcp.json**
  writes it. Claude Code reads the file on its own the next time it opens the repo and gets `jig`
  as a local MCP server. **Claude Desktop — also add the entry** does the same for
  `claude_desktop_config.json`. If `claude` is not on PATH the block says so — Build needs it.

Then **go to the bench**.

## The bench

Three regions and one line. The **rail** on the left holds three tools — **Point** (*"click a
component to open the prompt card"*, `P`), **Sketch** (`S`), **Hand** (*"the app takes your
clicks"*, `H`; `Esc` returns to it) — and the **Advanced** switch at its foot. The **plate** fills
the centre with the app, clean: no rulers, no guides, until Advanced says so. The right column has
three tabs: **Prompts**, **Inspect**, **Design system**. The **status line** at the bottom is
Claude's one sentence — `Claude · idle`, `· building · 00:42 · editing invoice-list.html`, `· built
· 3 files · 1m 12s`, or `· not installed` — and a click opens the **logbook**; **setup** at its
right end opens the checklist.

## Point and the prompt card

With Point, hover names a component on the plate (a storm hairline and its tag); click selects
it and opens the **prompt card** beside the selection — never over it (beside → below → above,
and only then the plate's corner, which the card says in words). The card carries the component's
name and file, one field — **what should change here?** — an optional **acceptance** list
(**+ add a line**), and the card's acts. **Inspect** shows the same selection in full: component,
file, tag, text, the gauges it uses (a chip lights every use on the plate), its routes, endpoints
and matching docs.

A draft is not saved until it has words; once it has them, it is a prompt file —
`.jig/prompts/NNNN-<slug>.md`, the slug from your own first words — and **Ready** turns ember.

## Polish

**Polish** appears only when a local model is reachable (Ollama; see the README) and does
nothing until pressed: it tightens the words and adds acceptance lines, locally, nothing leaves
the machine. Your own words are never lost.

## Ready

**Ready** is the one held gesture — *"hold to make the draft the prompt Claude will get"*, about
800 ms, a ring that fills. Let go early and the card says *"let go early — still a draft · 303 ms
of 800"*. Hold through and the prompt is **ready**: the Prompts row takes a gold ring, and
**Build** becomes the card's ember act (never both at once).

## Build

**Build** (*"run Claude Code in the repo with this prompt"*) runs `claude -p` in the clamped repo
with the prompt file on stdin — the requirement on top, then the context Jig appends. The stream
shows on the card and in Prompts as a monospace ribbon (*reading … · editing … · running tests*),
the status line counts the elapsed time and names the latest step, and every step lands in the
logbook as a Claude row. The words are locked while it runs. It ends `Claude · built · N files ·
m:ss`.

## Built

The prompt in hand in **Prompts** carries the **built** line: **before — the plate as it was**
flips the plate to the release snapshot and back, and **refine — go again** opens a new draft on
the same target with the words pre-filled — the loop's second lap. Claude's changes are in the
repo's working tree; Jig wrote none of them (`git status` shows exactly what changed).

## Prompts

The **Prompts** tab lists every prompt grouped **draft · ready · building · built**, with a
collapsed *scrapped* count (**put back** restores one — nothing is deleted). Click a row and it
is the prompt in hand: the requirement, the acceptance, **context Jig appends** (component ·
file · gauges · routes · endpoints · docs — shown in the open before Build), the stream, and the
built line. **scrap** sends a draft or ready prompt to the scrap bin.

## Sketch

**Sketch** turns the plate into a sheet at the app's size, drawn only with the app's own gauges:
box · text · button · input · list. Drag to draw on the 4px grid; drag an element and it snaps to
the grid, then to other elements' edges and centres (and the sheet's centre) within 6px, with a
storm alignment line on each held axis and the exact coordinates said in words. Delete scraps to
the bin; **put back** returns it. The sheet is a prompt target: **build this screen →** opens the
card with that title.

## The logbook

Click `Claude · …` on the status line and the logbook opens as a drawer over it: everything that
happened on the bench this session — your clamp and survey, the app's own log lines, every step
of every build — filterable by who (human · Claude · bench · app), newest first, ages against the
clock. *"nothing leaves the machine."* `Esc` or **close** puts it away.

## Advanced

Everything v0.1 had that is not the loop, one switch away at the rail's foot: the wiring strip,
**the spine** (every prompt on its four-rung ladder), **rulers & guides**, **the mirror — before |
after**, the scrap bin count, **fixtures** (reproducible test data from the survey's schemas —
`new fixture`, **load**, **fill the form**), **toolpath** (**record** Hand clicks on the plate,
name it, **replay**), and **MCP — the secondary door** (which agent is connected). Switch it off
and the plate is whole again.

## Finding your way around

The command palette — `Ctrl`/`⌘`+`K`, type, `Enter` — reaches tools, tabs, every prompt, every
gauge and every surveyed component in two moves; `Esc` closes it.
