# Using Jig

A walk through the whole loop — clamp, survey, the plate and the loupe, a mark, a work order,
release, the shop, the trial fit — plus fixtures, toolpaths, and sketch. Every quoted word or
label below is what the bench actually says (`packages/bench/src/**`), not a paraphrase.

This assumes `npx jigbench` quick-started already (`README.md`). Run everything from
`examples/ledger-angular`'s repo if you want to follow along against a real app, or your own.

## Clamp

Clamping is just running Jig inside (or pointed at) a repo:

```bash
cd your-app-repo
npx jigbench
```

The terminal prints `Jig is on the bench: http://localhost:4600` and `Clamped: <repo path>`. If
the repo has docs worth drafting from (a handbook, a spec folder), clamp those too:

```bash
npx jigbench clamp --docs ./docs
```

This reads markdown, text, and PDF files under that folder, heading-chunks them, and writes
`.jig/survey/docs.json` — the drafter retrieves from it later.

## Survey

The survey runs automatically the first time Jig starts (and again on demand with
`npx jigbench survey`). It writes `.jig/survey/survey.json`, one `.jig/survey/<adapter>.json`
per adapter that detected the repo, and `.jig/gauges.json`. The bench's **Survey** tab (one
of the three tabs in the properties column, alongside **Loupe** and **Gauges**) shows what it
found under a **stack** heading — and a **clamped docs** heading if you clamped one.

Jig works with any app that has a dev server — the loop never depends on a survey adapter, and
adapters only enrich it (Angular and .NET 10 have dedicated ones: real components, routes, and API
endpoints). Every other repo still gets a real survey from the generic **web** adapter: any
`package.json` or stylesheet is enough to match, and it reads CSS custom properties, SCSS `$vars`,
and Less `@vars` into gauges, guesses a dev-server URL from `package.json`'s scripts (so
`--target` can often be inferred without asking), and lists any frameworks it recognizes from the
manifest's dependencies — honest hints, never invented. Where no stack adapter matches at all, the
survey's stack is `web` and components/routes are marked unknown, not guessed at; where a stack
adapter also matches, the web adapter's gauges and dev-server guess still fold in alongside the
stack adapter's own real components and routes. An app nothing recognizes at all still gets an
honest stub, never a crash.

## The plate and the loupe

Start Jig against a running dev server with `--target`:

```bash
npx jigbench --target http://localhost:4200
```

The **Plate** panel is where the clamped app renders — proxied through Jig so the app itself
changes nothing. Pick the **Loupe** tool from the rail (its pair: *"point at anything and see
what it is"*) and click anything on the plate. The **Loupe** panel in the properties column shows
what you hit — component, file, route — resolved from the survey, not source maps.

## Mark

Switch to the **Mark** tool (*"a highlighted spot with a request attached"*), click a spot on the
plate, and a form opens asking **"what should change here?"**. Type the change and press **mark**.
This creates a work order and — if a drafter is reachable (a local Ollama model, then a connected
agent, then a human) — fires off a first draft immediately.

## Work order

Every work order shows up in the tray's **spine** (*"every work order by state"*) as it moves
through the ladder: marked → drafted → released → done, or scrapped along the way. Open one to
see its two faces:

- the **human face** — the requirement, the acceptance, and a fixture — editable at any state
  before release;
- the **shop face** — the implementation brief in the app's own stack idiom, filled in only once
  you release.

## Release

Releasing approves a work order and fills its shop face. The control is a deliberate press-and-
hold (**"release — hold for about 800 milliseconds"**) rather than a single click — a released
work order is a real commitment (the shop face gets written, the trial fit starts watching), not
an accidental tap.

## The shop

**the shop** panel shows whichever agents are connected (Claude Code, Claude Desktop) over MCP.
Before anything is released it says **"nothing released — the shop has nothing to pick up"**.
Once a work order is released, a connected agent lists it as an MCP resource, claims it, and
implements it — Jig never writes application source itself.

## Trial fit

Until a work order comes back, the trial fit panel reads **"not yet — no work order has been
released"**. Once the shop reports a work order done, it shows two frames — **"before · snapshot
at release"** and **"after · live"** — side by side, plus **"changes the shop reported"** (the
files it touched) and any recorded toolpaths, replayable on both frames at once.

## Fixtures

The **Fixture** tool (*"a reproducible set of test data"*) opens the fixtures panel. **new
fixture** generates one from the survey's data shapes (OpenAPI/DTOs → JSON Schema → seeded
faker); load it and the plate proxy serves it for `/api/*` and fills forms by dispatching the
input events the app itself listens for. Removing one sends it to the **scrap bin** — counted,
regenerable, never silently gone.

## Toolpaths

The **Toolpath** tool (*"a recorded click sequence, replayable"*) records what you click on the
plate. Give it a name and **save**; replay it later at whatever **replay speed** you pick, and it
drives the plate the same way on the trial fit's before/after frames.

## Sketch

The **Sketch** tool (*"a screen that does not exist yet"*) draws a low-fidelity screen on the
plate using the app's own gauges — for a feature that has no code yet. **new** starts one;
finished sketches are files under `.jig/sketches/`, clickable through their own hotspots, same as
a real screen.

## Finding your way around

The command palette — **the Halls** — searches everything at once: tools, components, routes,
gauges, work orders, and clamped docs. Everything that happens on the bench is also recorded in
the **logbook**.
