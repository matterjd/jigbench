// #81 item 7 (the lead's 2026-09-15 review): a `git` that ACKNOWLEDGES a working tree and then
// refuses to read it — the corrupt-index / stale-lock case. `rev-parse --show-toplevel` answers
// 0 with a top level, `status --porcelain -z` exits 128 with git's own sentence on stderr,
// which is exactly what a real git does with a garbage `.git/index` (reproduced on the lead's
// desk: "fatal: .git/index: index file smaller than expected").
//
// Driven through `process.execPath` like `fake-git-hangs.mjs`, so nothing has to be on PATH and
// the fixture behaves identically on both CI legs.
const args = process.argv.slice(2);

if (args.includes('rev-parse')) {
  process.stdout.write(`${process.cwd()}\n`);
  process.exit(0);
}

process.stderr.write('fatal: .git/index: index file smaller than expected\n');
process.exit(128);
