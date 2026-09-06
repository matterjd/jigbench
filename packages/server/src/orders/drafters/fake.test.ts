import { describe, expect, it } from 'vitest';
import { stubSurvey, type Mark } from '@jigbench/core';
import { FakeOllamaDrafter } from './fake.js';

/**
 * `FakeOllamaDrafter` is the deterministic, network-free stand-in `http.test.ts` and
 * `http.orders.test.ts` inject via `createJigServer`'s `drafters.ollama` option (wave-3
 * council: an HTTP/unit test must never depend on a live Ollama process, warm or cold).
 * These tests pin its OWN behaviour before anything else depends on it.
 */

function mark(): Mark {
  return {
    id: 'm-0001',
    number: 1,
    target: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' },
    prompt: 'highlight the due date when overdue',
    createdAt: '2026-09-05T00:00:00.000Z',
  };
}

describe('FakeOllamaDrafter', () => {
  it('defaults to unavailable, resolving instantly and recording the probe', async () => {
    const drafter = new FakeOllamaDrafter();
    const ok = await drafter.available();
    expect(ok).toBe(false);
    expect(drafter.calls).toEqual([{ kind: 'available' }]);
  });

  it('carries an unmistakably-fake model name — never the real qwen default', () => {
    const drafter = new FakeOllamaDrafter();
    expect(drafter.model).toBe('fake-model');
    expect(drafter.model).not.toMatch(/qwen/i);
  });

  it('reports available when configured to, and draft() resolves the fixed face — recording both calls', async () => {
    const face = { what: 'a fixed what', why: 'a fixed why', where: 'a fixed where', acceptance: ['a fixed acceptance'] };
    const drafter = new FakeOllamaDrafter({ available: true, face });

    expect(await drafter.available()).toBe(true);
    const result = await drafter.draft(mark(), { survey: stubSurvey() });

    expect(result).toEqual(face);
    expect(drafter.calls).toEqual([{ kind: 'available' }, { kind: 'draft' }]);
  });

  it('rewrite() echoes the input text back unmodified and records the call', async () => {
    const drafter = new FakeOllamaDrafter();
    const result = await drafter.rewrite('the original brief', 'polish this');
    expect(result).toBe('the original brief');
    expect(drafter.calls).toEqual([{ kind: 'rewrite' }]);
  });
});
