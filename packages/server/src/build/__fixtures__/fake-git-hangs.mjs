#!/usr/bin/env node
// #37: a `git` that never answers — the shape that used to hold `BuildRunner.start()` open
// forever, since the before-snapshot is awaited before `claude` is spawned at all. Stands in for a
// credential helper waiting on a prompt, a dead network drive under the working tree, or an
// `index.lock` someone else is holding.
//
// It prints nothing and exits never. The interval (rather than a bare `setTimeout`) keeps the
// event loop alive without a 30-day timer, and the SIGTERM handler is deliberate: a child that
// ignored the kill would make the test hang instead of pass, so this one does NOT ignore it — it
// exits, which is what proves the abort really reaped the process rather than only resolving the
// promise out from under it.
const keepAlive = setInterval(() => {}, 1000);
process.on('SIGTERM', () => {
  clearInterval(keepAlive);
  process.exit(143);
});
