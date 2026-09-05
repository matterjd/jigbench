/**
 * The one place `jigbench` prints text for a human reading the terminal. Every command
 * except `mcp` funnels its result through here — never call `process.stdout.write` or
 * `console.log` anywhere else in this package.
 *
 * `mcp` speaks JSON-RPC on stdout (from S6 on) and nothing else may write there, so this
 * module must never be imported — directly or transitively — by `commands/mcp.ts`. A guard
 * test (`no-stdout.test.ts`) enforces both halves of that rule.
 */
export function printHuman(message: string): void {
  process.stdout.write(message.endsWith('\n') ? message : `${message}\n`);
}
