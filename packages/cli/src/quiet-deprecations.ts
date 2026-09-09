/**
 * #24 (the 0.2.0 review): "the CLI prints a Node `util._extend` deprecation on stderr at start.
 * Silence or upgrade."
 *
 *   (node:1234) [DEP0060] DeprecationWarning: The `util._extend` API is deprecated.
 *   Please use Object.assign() instead.
 *
 * It is `http-proxy@1.18.1`'s, not Jig's: that package captures `require('util')._extend` at
 * load (`lib/http-proxy/index.js:2`, `lib/http-proxy/common.js:3`) and calls it while building
 * the outgoing request, so the warning lands the first time the plate proxies anything — which,
 * since `npx jigbench` opens the bench and the bench loads the app through the plate, is a
 * second into the run. Nothing in this repo calls `util._extend`; `http-proxy` has had no
 * release since 2020, so there is no version of it to move to (only a fork, which is a
 * different change from this one). There is nothing a reader of that line can do about it.
 *
 * `util.deprecate` emits through the PUBLIC `process.emitWarning`, so wrapping that is the
 * narrowest place to drop this one warning: Node's own listener never sees it, and every other
 * warning still goes through Node's own path and prints in Node's own format, byte for byte.
 * (Adding a second `'warning'` listener would not have worked — Node's default printer is a
 * listener too, and a new one does not replace it.)
 *
 * Deliberately in the CLI and not in `packages/server`: this changes process-wide behaviour, and
 * a program embedding the server should decide that for itself.
 */

/** The one warning this drops. Nothing else is touched. */
const SILENCED_CODE = 'DEP0060';

let applied = false;

/** The code carried by an `emitWarning` call, across all three of its documented shapes:
 * `(warning, type, code, ctor)`, `(warning, options)`, and `(error)` with `error.code`. */
function warningCode(warning: unknown, rest: readonly unknown[]): string | undefined {
  if (typeof warning === 'object' && warning !== null) {
    const code = (warning as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  const [typeOrOptions, code] = rest;
  if (typeof code === 'string') return code;
  if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
    const fromOptions = (typeOrOptions as { code?: unknown }).code;
    if (typeof fromOptions === 'string') return fromOptions;
  }
  return undefined;
}

/**
 * Stops `http-proxy`'s `util._extend` deprecation reaching stderr. Idempotent — calling it
 * twice does not stack a second wrapper. Returns the function it replaced, so a test (or a
 * caller that wants its own lifetime) can put things back exactly as they were.
 */
export function quietHttpProxyDeprecation(): typeof process.emitWarning {
  const previous = process.emitWarning;
  if (applied) return previous;
  applied = true;

  const emit = previous.bind(process) as (...args: unknown[]) => void;
  process.emitWarning = ((warning: unknown, ...rest: unknown[]) => {
    if (warningCode(warning, rest) === SILENCED_CODE) return;
    emit(warning, ...rest);
  }) as typeof process.emitWarning;

  return previous;
}

/** Test-only: forget that `quietHttpProxyDeprecation` ran, so a test can apply it again. */
export function resetQuietDeprecationsForTest(restore: typeof process.emitWarning): void {
  process.emitWarning = restore;
  applied = false;
}
