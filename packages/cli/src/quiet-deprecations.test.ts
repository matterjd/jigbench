import { afterEach, describe, expect, it } from 'vitest';
import { quietHttpProxyDeprecation, resetQuietDeprecationsForTest } from './quiet-deprecations.js';

/**
 * #24: `http-proxy@1.18.1` calls `util._extend` while building an outgoing request, so the CLI
 * prints `[DEP0060] DeprecationWarning: The util._extend API is deprecated` on stderr the first
 * time the plate proxies anything. This is the filter that drops that one warning — and only
 * that one.
 */

let restore: typeof process.emitWarning | undefined;
let defaultListeners: readonly ((...args: never[]) => void)[] = [];

/** Node's own printer is a `'warning'` listener; taking it off while a test emits keeps the
 * suite's stderr clean, and it is put back afterwards. */
function collectWarnings(): { seen: string[] } {
  const seen: string[] = [];
  defaultListeners = process.listeners('warning') as unknown as ((...args: never[]) => void)[];
  process.removeAllListeners('warning');
  process.on('warning', (warning: Error & { code?: string }) => seen.push(warning.code ?? warning.name));
  return { seen };
}

afterEach(() => {
  if (restore) {
    resetQuietDeprecationsForTest(restore);
    restore = undefined;
  }
  process.removeAllListeners('warning');
  for (const listener of defaultListeners) process.on('warning', listener as never);
  defaultListeners = [];
});

/** `process.emitWarning` reaches its listeners on a later tick. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('quietHttpProxyDeprecation', () => {
  it("drops http-proxy's DEP0060, and nothing else", async () => {
    const { seen } = collectWarnings();
    restore = quietHttpProxyDeprecation();

    process.emitWarning('The `util._extend` API is deprecated.', 'DeprecationWarning', 'DEP0060');
    process.emitWarning('something Jig should hear about', 'Warning', 'JIG0001');
    await nextTick();

    expect(seen).toEqual(['JIG0001']);
  });

  it('reads the code out of every shape emitWarning accepts', async () => {
    const { seen } = collectWarnings();
    restore = quietHttpProxyDeprecation();

    process.emitWarning('deprecated', { type: 'DeprecationWarning', code: 'DEP0060' });
    const asError = Object.assign(new Error('deprecated'), { name: 'DeprecationWarning', code: 'DEP0060' });
    process.emitWarning(asError);
    process.emitWarning('a different deprecation stays', { type: 'DeprecationWarning', code: 'DEP0040' });
    await nextTick();

    expect(seen).toEqual(['DEP0040']);
  });

  it('is idempotent — a second call does not stack another wrapper', async () => {
    const { seen } = collectWarnings();
    restore = quietHttpProxyDeprecation();
    const wrapped = process.emitWarning;
    quietHttpProxyDeprecation();
    expect(process.emitWarning).toBe(wrapped);

    process.emitWarning('still heard', 'Warning', 'JIG0002');
    await nextTick();
    expect(seen).toEqual(['JIG0002']);
  });
});
