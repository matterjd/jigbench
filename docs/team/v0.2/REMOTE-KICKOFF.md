# Remote kickoff — Jig v0.2 (cloud session, no desk)

Paste the block between the markers into a **new claude.ai/code (cloud) session on this repository**.
The desk is off-limits to that session, so it never runs a browser walkthrough, `.NET`, Ollama, or a
real `claude -p`; everything else in the plan is buildable in the sandbox. Merges go through pull
requests so GitHub Actions — not a local run — is the arbiter.

----8<---- paste from here ----8<----
Open as the DELIVERY SEAT for matterjd/jigbench. You are a REMOTE session: no Browser pane, no
Windows desk, no .NET SDK, no Ollama, no real Claude Code binary — do not attempt live UI walkthroughs
or `claude -p`; run every server test with `JIG_NO_MODEL=1 JIG_OLLAMA_URL=http://127.0.0.1:9`, and let
the Build-runner tests use the repo's fake `claude` as they already do. Read, in order:
HANDOFF.md · docs/design/AMENDMENT-1-the-simplification.md (rulings A1–A6 — binding) ·
docs/design/COMMISSION.md §3 (the words) · docs/team/v0.2/CHASSIS.md (the built chassis, S12) ·
docs/design/concepts/concept-d-the-quiet-bench.md (the spec; the html is the built spec) ·
packages/server/src/{bench,setup,fs,target}/*.ts and their tests (S17a's in-app setup API) ·
docs/EXECUTION-PLAN.md §5 (gates).

THE FRONTIER, in order:
1. **S17b · the Clamp screen** (bench): when `/api/state.bench` is null the bench opens on a quiet
   Clamp screen in the concept-D register — recent benches first (one click reopens), a folder
   browser over `GET /api/fs/roots` + `/api/fs/list?path=` (directories only, `hasGit`/`hasPackageJson`
   /`hasAngularJson` hints) or a pasted path, `POST /api/clamp` (the survey runs; show what it found:
   stack, components, gauges, dev-server guess), **Start the app** → `POST /api/target/start` with the
   streamed `target-log` and the port probe (or a pasted URL → `/api/target/url`), **Docs** →
   `POST /api/docs/clamp` (default `./docs` when present), **Register with Claude Code** →
   `POST /api/setup/mcp` diff first then `{apply:true}` (and the Desktop entry likewise), **Open the
   bench**. A setup checklist (`GET /api/setup`) one click from the status line. Tongue: clamp ·
   bench · survey · plate · Point · Prompts · Claude. Floor tests (`floor-*.test.ts`, `tongue.test.ts`)
   stay green; the `--repo .` trap is gone for users because the screen sends absolute paths.
2. **S15 · ship 0.2.0**: rewrite `docs/team/v0.1/TEST-RUN.md` into `docs/TEST-RUN.md` for the loop
   (one `npx jigbench`, the Clamp screen, Point → requirement → Polish → hold Ready → Build → Built →
   *before*, Advanced tour, your own repo), `docs/ROADMAP.md` from AMENDMENT §6, `CHANGELOG.md`
   0.2.0, README quick-start true again, `packages/cli/package.json` version 0.2.0, `npm run
   build:release && npm run pack:release && bash scripts/npx-control.sh "$(pwd)/jigbench-0.2.0.tgz"`
   green. Tag nothing, publish nothing, change no visibility — those are Matter's.

HOW WORK LANDS (a remote session has no desk control, so CI is the gate): one branch per slice
(`delegate/build-s17b`, `delegate/build-s15`), test-first (the failing test exists before the code;
quote the red line in the commit body), `git commit -s`, push the branch, open a PR with the
worker-report shape as its body, wait for both CI legs (Windows + Ubuntu) to pass, then merge the PR
(squash or merge, your call — never rewrite pushed history). Never edit `examples/` source,
`QUALITY.md`, `docs/quality/`. Never run `npm link`, `claude mcp add`, or touch anything outside the
repo. If a test reaches for a live model, port, or binary, fake it — the repo's tests already show
how (`FakeOllamaDrafter`, `fake-claude.mjs`, fake upstream servers).

CLOSE: refresh HANDOFF.md (seat Delivery, the shas, what is on main, what Matter still owes: the
0.2.0 publish OTP, the desk retest of the Clamp screen) and commit it on main via a PR like the rest.
The last line of your final message is the one-sentence handoff.
----8<---- to here ----8<----

## What the desk still owes after the remote run (Matter)

- Retest the Clamp screen and the loop on this desk (the browser walkthrough the cloud cannot do).
- `cd packages/cli && npm publish --access public` for 0.2.0 (your one-time password), then the
  `v0.2.0` tag + GitHub release with the tarball (`gh release create v0.2.0 ./jigbench-0.2.0.tgz`).
