// #81 item 6 (the lead's 2026-09-15 review): a child whose `exit` fires long before its
// `close`. It spawns a DETACHED grandchild that INHERITS this process's stdout — the same pipe
// the runner reads — and then exits at once. Node reaps this process immediately, so
// `exitCode` is set and `exit` fires; `close` cannot fire until every stdio stream has ended,
// and the grandchild holds the write end of that pipe for another `argv[2]` milliseconds.
//
// That gap is the whole subject of `awaitExit`: a `stop()` that returns on `exit` alone reports
// a child gone while its output is still arriving. On win32 it is also the LIKELY ordering,
// because `killTree` there awaits the spawned `taskkill`'s own `close` — a whole macrotask,
// by which time the target's `exit` has usually been processed.
import { spawn } from 'node:child_process';

const holdMs = Number(process.argv[2] ?? 600);

const grandchild = spawn(
  process.execPath,
  ['-e', `setTimeout(() => process.stdout.write('late line from the grandchild\\n'), ${holdMs})`],
  { detached: true, stdio: ['ignore', 'inherit', 'ignore'] },
);
grandchild.unref();

process.exit(0);
