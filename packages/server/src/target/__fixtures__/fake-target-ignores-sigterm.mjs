// Test fixture for target/runner.test.ts — a target that refuses SIGTERM and keeps running, so
// `killTree`'s own 300ms wait before SIGKILL is real time the runner spends inside `stop()`.
// That window is what lets a probe answer AFTER the runner let go of this process, which is the
// race #24 names at runner.ts:199. It binds no port: the test's own server answers the probe.
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
