import { describe, expect, it } from 'vitest';
import type { Mark } from '@jigbench/core';
import { AgentDrafter } from './shop.js';

function mark(overrides: Partial<Mark> = {}): Mark {
  return {
    id: 'm-0001',
    number: 1,
    target: { path: 'body > app-invoice-list', component: 'InvoiceListComponent' },
    prompt: 'flag overdue invoices',
    createdAt: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('AgentDrafter', () => {
  it('enqueues the mark it is asked to draft rather than answering itself', () => {
    const agent = new AgentDrafter();
    expect(agent.getQueue()).toEqual([]);

    agent.draft(mark());

    expect(agent.getQueue()).toHaveLength(1);
    expect(agent.getQueue()[0]?.id).toBe('m-0001');
  });

  it('returns a face seeded from the mark — a starting point, not an answer', () => {
    const agent = new AgentDrafter();
    const face = agent.draft(mark());

    expect(face.what).toBe('flag overdue invoices');
    expect(face.where).toBe('InvoiceListComponent');
    expect(face.acceptance).toEqual([]);
  });

  it('falls back to file, then the raw DOM path, when the mark has no component name', () => {
    const agent = new AgentDrafter();

    const withFile = agent.draft(mark({ target: { path: 'x', file: 'a.ts' } }));
    expect(withFile.where).toBe('a.ts');

    const bare = agent.draft(mark({ target: { path: 'body > div' } }));
    expect(bare.where).toBe('body > div');
  });

  it('queues every mark handed to it, in order', () => {
    const agent = new AgentDrafter();
    agent.draft(mark({ id: 'm-0001' }));
    agent.draft(mark({ id: 'm-0002' }));

    expect(agent.getQueue().map((m) => m.id)).toEqual(['m-0001', 'm-0002']);
  });
});
