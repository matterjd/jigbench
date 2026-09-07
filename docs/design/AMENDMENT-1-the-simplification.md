---
title: "AMENDMENT 1 — the simplification: one loop, one button"
date: 2026-09-07
seat: Design
status: RULED — four rows by Matter in one batch (2026-09-06 ~21:30 CDT); concept D · The Quiet Bench built, FLOOR CLEAR, and ruled CHASSIS as is (Matter, 2026-09-07); S12 builds it
amends: COMMISSION.md (F5, F6, F7, F11, F13, F14, F20) — the rows stand where not named here
---

# AMENDMENT 1 — the simplification

**Matter's words, 2026-09-06, after driving v0.1.0 on the Ledger example (verbatim):** *"It is very
cluttered but I love all the tooling you have. It just needs less cluttered view with everything
and a more cohesive design. … I want this to be the ultimate developer prototyping tool with AI.
… I mainly want to be able to selected sections, basically write out a requirement from a PM, it
saves that as a serviceable prompt. We kick that prompt off. Or, a new feature add, we discuss it,
write down quick requirements, have claude try to create a mock of the feature, builds it into the
prototype, and then we refine the requirements. … I think the MCP tool is still valuable for this
ask. … this whole system you designed is a little overly complicated. … A lot of working parts
seem to be needed and a lot of points of failure."*

## 1. The rulings

| # | Question | Answer |
|---|---|---|
| A1 | How does a prompt get kicked off? | **RULED: a Build button in Jig runs Claude Code itself.** Jig spawns `claude -p` in the clamped repo with the saved prompt, streams its work into the logbook, and marks the prompt *built* when it exits. One process, one button. **MCP stays as a secondary door** for other agents (and for Claude Desktop, which cannot build). The two-process handshake (heartbeat file + watcher + shop lane) stops being the primary path. |
| A2 | How much does the local model do? | **RULED: on demand — a Polish button.** You write the requirement; one button asks Ollama to tighten it and add acceptance bullets. Nothing fires automatically. No model → the button is absent, not a stub. |
| A3 | What sits in the default view? | **RULED: the loop only.** Rail: **Point · Sketch · Hand**. Right column: **Prompts · Inspect · Design system**. One status line at the bottom (*Claude: idle / building… / built*). Rulers, guides, the SIM strip, fixtures, toolpaths, the spine and the scrap bin live behind one **Advanced** toggle — kept, not deleted. |
| A4 | The artifact | **RULED: a Prompt** — UI word and folder: `.jig/prompts/NNNN-<slug>.md`. States **draft → ready → building → built** (plus *scrapped*). The file is the prompt Claude receives, verbatim: the requirement on top, then what Jig knows about the selection and the app. |

## 2. What the product is, second cut

**Jig is one loop.** Point at something on the running app (or sketch something that does not
exist yet) → write the requirement the way a PM would → Jig saves it as a serviceable prompt →
press **Build** and Claude Code changes the prototype → look at it, refine the requirement, go again.

Everything from v0.1 survives, but only the loop is on the bench by default. The survey, the
gauges and the docs clamp feed the prompt silently (the prompt carries the component, its file, the
gauges it uses, the routes and endpoints it touches, the matching doc chunks). Fixtures, toolpaths,
the trial-fit mirror and the MCP door are **Advanced** — a working part you reach for, never a part
you must operate to get through the loop.

## 3. The tongue, amended

| Was | Now | Note |
|---|---|---|
| work order (two faces, six rungs) | **prompt** — *a requirement saved as the prompt Claude will get* | one text, one optional acceptance list; the "shop face" becomes the context block Jig appends |
| marked · drafted · released · in-the-shop · trial-fit | **draft · ready · building · built** | *ready* is the human's word (the old release); *building* is `claude -p` running |
| release (held) | **Ready** (held ~800 ms — the one held gesture stays; it is what makes a draft the prompt) | |
| the shop · shop lane · heartbeat | **Claude** — one status word on the status line | MCP clients other than the Build button appear as *connected: <name>* under Advanced |
| loupe · mark | **Point** — one tool: click = select and open the prompt card | the loupe readout lives in **Inspect** |
| gauges | **Design system** (tab name); *gauges* stays the word for one token | |
| trial fit | **Built** — the plate after the build, with *before* one click away | the two-plate mirror is Advanced |

Unchanged: bench · clamp · survey · plate · sketch · logbook · scrap bin.

## 4. The default view (the brief for concept D)

- **Rail (left):** Point · Sketch · Hand. Nothing else.
- **Plate (centre):** the app, clean — no rulers, no guides. A selection is one storm hairline. A
  **prompt card** opens anchored to the selection: *what should change here?* (multi-line), an
  optional *acceptance* list, **Polish** (if a local model exists), **Ready** (held), **Build**.
- **Right column:** **Prompts** (the list — draft / ready / building / built — and the prompt in
  hand with its Build button and its stream), **Inspect** (what is selected: component, file, the
  gauges it uses, its routes/endpoints, matching docs), **Design system** (the gauges, categorised;
  two-way lighting stays).
- **Status line (bottom):** `Claude · idle` | `building · 00:42 · editing invoice-list.html` |
  `built · 3 files · 1m 12s` — click to open the logbook drawer. Nothing else on that line.
- **Advanced** (one toggle in the top-right): rulers/guides, the SIM strip, Fixtures, Toolpath,
  the mirror, MCP status, the spine.
- **Sketch:** the sheet with real snapping (4px grid, edge and centre alignment lines), five
  primitives, the app's gauges only; a sketch is a prompt target: *build this screen*.

## 5. v0.2 — the slices

| Slice | What lands | Tier |
|---|---|---|
| **S11 · prompt + build runner** (server/core) | `Prompt` model + `.jig/prompts/`; migration of existing work orders; `POST /api/prompts/:id/build` spawns `claude -p` in the repo with the prompt file, streams events over WS, records the transcript + files touched, marks *built*; cancel; Polish endpoint (Ollama, on demand); MCP tools renamed (`jig_prompts`, `jig_prompt`, `jig_mark_built`) with the old names kept as aliases | green |
| **S12 · the quiet chassis** (bench) | concept D built: rail 3 tools, Prompts · Inspect · Design system, the prompt card, the status line, the Advanced toggle housing everything else; Point replaces loupe+mark | green |
| **S13 · sketch that snaps** | real snapping + alignment lines; *build this screen* as a prompt target | green |
| **S14 · retest fixes** | Matter's 18 (fixtures), 22/23 (MCP repo root, `init` with `--repo`, the prompt text), 5 (badge fields) — in flight | green |
| **S15 · ship 0.2.0** | docs, TEST-RUN rewritten for the loop, CHANGELOG, tag, publish (Matter's OTP) | green |

Order: S14 (running) → S11 ‖ concept D verdict → S12 ‖ S13 → S15. Tuesday's first clamp runs on
whatever is on `main` that morning, with the loop's server side (S11) the priority.
