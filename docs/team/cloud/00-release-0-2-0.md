# 00 · R0 · release 0.2.0 (the desk, not a session)
**Tier** ruling (Matter's hands only) · **Depends on** nothing · **Expected PRs** 0 · **Roadmap row** R0

This is the one file in this folder that is not pasted into a cloud session. **No session may
publish or change repository visibility** — that stays your hands. The block below is for your own
terminal on the desk, in Git Bash, from the repo root.

----8<---- paste from here ----8<----
npm ci --no-audit --no-fund
npm run build:release && npm run pack:release && bash scripts/npx-control.sh "$(pwd)/jigbench-0.2.0.tgz"
cd packages/cli && npm login && npm publish --access public
----8<---- to here ----8<----

Notes on those three lines, two of them learned the hard way on the first attempt:

- **`npm ci` first, after any pull of `main`.** A stale `node_modules` does not carry the
  `@jigbench/adapter-web` workspace, and the server build then dies with `Cannot find module
  '@jigbench/adapter-web'`. Run it before `build:release`, every time you have pulled.
- **`npm login` first.** A publish answering `404 Not Found - PUT
  https://registry.npmjs.org/jigbench` does not mean the name is taken or the package is missing: it
  means the npm token has expired. Log in, then publish. The one-time password prompt is yours
  alone — no session may answer it.
- `packages/cli/README.md` and `LICENSE` do not exist in a fresh checkout. `build:release` writes
  them, and `scripts/npx-control.sh` fails loudly if a pack goes out without it. Run the control
  before the publish, every time.

## The tag, the release and the registry check — a session may do these

Once you confirm `+ jigbench@0.2.0` came back from the publish, the rest is an Opus session's to
run, on `main` at the sha you published. This is the one exception to the "never tag" rule every
other block in this folder carries, and it opens only on your word that 0.2.0 is on npm:

```bash
git tag -a v0.2.0 -m "Jig v0.2.0 — one loop" && git push origin v0.2.0
gh release create v0.2.0 ./jigbench-0.2.0.tgz --title "Jig v0.2.0 — one loop" --notes-file CHANGELOG.md
npx --yes jigbench@0.2.0 --version   # the registry check, from an empty folder
```

All three go on issue #1: the tag, the release URL, and the version `npx` answered.

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
