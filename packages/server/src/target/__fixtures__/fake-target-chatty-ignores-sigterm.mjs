// Test fixture for target/runner.test.ts (#81 item 6) — a target that refuses SIGTERM and keeps
// its stdout pipe saturated, so `killTree`'s escalation to SIGKILL always lands with a backlog
// of unread bytes in flight.
//
// `child.on('close')` fires only once the process has been reaped AND its stdio streams have
// ended. That is the guarantee `killTree` cannot give: it resolves when the KILLER is done —
// `taskkill` exiting, or `process.kill(-pid, 'SIGKILL')` returning — so a `stop()` that waits on
// it alone is still feeding its caller lines from a target it has already reported gone.
//
// The shape is tuned, not guessed. Two-byte lines because a pipe holds about 64 KB and that
// backlog is all that survives SIGKILL (whatever is still queued inside the child dies with it),
// so tiny lines mean tens of thousands of readline events pending — many event-loop turns, not
// the handful of microtask hops `stop()` used to take. 5000 per tick because that saturates the
// pipe while still yielding often enough to keep refilling it: measured on this seat, the
// backlog left at SIGKILL is one whole burst every run. Larger bursts make the child CPU-bound
// in its own write loop, which STARVES the pipe and makes the window a coin flip; smaller ones
// leave a backlog small enough to drain inside the gap. Both were tried.
process.on('SIGTERM', () => {});
setInterval(() => {
  for (let i = 0; i < 5000; i++) process.stdout.write('x\n');
}, 1);
