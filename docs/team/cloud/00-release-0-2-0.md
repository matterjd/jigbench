# 00 · R0 · release 0.2.0 (the desk, not a session)
**Tier** ruling (Matter's hands only) · **Depends on** nothing · **Expected PRs** 0 · **Roadmap row** R0

This is the one file in this folder that is not pasted into a cloud session. No session may publish,
tag, or change visibility. The block below is for your own terminal on the desk, in Git Bash, from
the repo root.

----8<---- paste from here ----8<----
npm run build:release && npm run pack:release && bash scripts/npx-control.sh "$(pwd)/jigbench-0.2.0.tgz"
cd packages/cli && npm publish --access public
gh release create v0.2.0 ./jigbench-0.2.0.tgz --title "Jig v0.2.0 — one loop" --notes-file CHANGELOG.md
----8<---- to here ----8<----

Notes on those three lines:

- `npm publish` asks for your one-time password.
- `packages/cli/README.md` and `LICENSE` do not exist in a fresh checkout. `build:release` writes
  them, and `scripts/npx-control.sh` fails loudly if a pack goes out without it. Run the control
  before the publish, every time.
- `gh release create` makes the `v0.2.0` tag from the current commit if the tag is not there yet.
  Run it from `main` at the sha you published.

## Then the retest, per `docs/TEST-RUN.md`

At 1440x900 and again at 1280x720. The parts the cloud has never been able to prove:

1. Part 1, the published package: `npx jigbench@0.2.0` in an empty folder, the Clamp screen opens.
2. Part 2, the loop on `examples/ledger-angular`: clamp, Start the app, go to the bench, Point at an
   invoice row, write a requirement, Polish (start the Ollama tray app first, or run with
   `JIG_NO_MODEL=1`), hold Ready, Build, Built.
3. The saved prompt file under `.jig/prompts/`: read it with your own eyes. It should name the
   component, its file, the gauges and the route.
4. Part 3, Advanced. Ruling 1 of issue #23 is why the toolpath step may not pass. Note what happens
   rather than working around it.
5. Part 4, your own repo.
6. Part 5, cleanup. Delete the merged `wo/0003-days-overdue` branch when you are ready.

## What the desk owes after it

- One issue per defect the retest finds. Those become slice S18 (`01-retest-fixes.md`).
- Your three answers on issue #23. Those unblock slice S21 (`04-rulings.md`).
- A note on issue #1 saying 0.2.0 is published, with the npm version and the release URL.
