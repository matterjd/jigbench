// Test fixture for target/runner.test.ts — a target script whose log carries real ANSI escapes:
// colour (`ESC [ 33 m`), a window title (an OSC sequence terminated by BEL) and a reset, which is
// what `ng serve` and `vite` write when they believe they own a TTY. Spelled with \u001B escapes so
// this file carries no raw control bytes. No explicit `process.exit()`: the process ends once both
// writes have flushed, so neither line can be truncated on the way out.
process.stdout.write('\u001B[33m❯\u001B[39m Building...\n');
process.stderr.write('\u001B]0;jig fixture\u0007\u001B[1m\u001B[32mcompiled\u001B[0m successfully\n');
