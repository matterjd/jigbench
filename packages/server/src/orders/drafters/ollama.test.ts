import { describe, expect, it, vi } from 'vitest';
import type { Mark, Survey } from '@jigbench/core';
import { stubSurvey } from '@jigbench/core';
import { OllamaDrafter } from './ollama.js';

function mark(overrides: Partial<Mark> = {}): Mark {
  return {
    id: 'm-0001',
    number: 1,
    target: { path: 'body > app-invoice-list', component: 'InvoiceListComponent', file: 'src/app/invoices/invoice-list/invoice-list.ts' },
    prompt: 'highlight the due date when overdue',
    createdAt: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

function survey(): Survey {
  return {
    ...stubSurvey('2026-09-05T00:00:00.000Z'),
    stub: false,
    components: [
      {
        name: 'InvoiceListComponent',
        selector: 'app-invoice-list',
        file: 'src/app/invoices/invoice-list/invoice-list.ts',
        standalone: true,
        inline: false,
        inputs: [],
        outputs: [],
        templateUrl: './invoice-list.html',
        styleUrls: ['./invoice-list.scss'],
      },
    ],
  };
}

function fakeFetch(handlers: { tags?: unknown; generate?: unknown; tagsStatus?: number; generateStatus?: number }): typeof fetch {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith('/api/tags')) {
      if (init?.signal && (init.signal as AbortSignal).aborted) throw new Error('aborted');
      return {
        ok: (handlers.tagsStatus ?? 200) < 400,
        status: handlers.tagsStatus ?? 200,
        json: async () => handlers.tags ?? { models: [] },
      } as Response;
    }
    if (href.endsWith('/api/generate')) {
      return {
        ok: (handlers.generateStatus ?? 200) < 400,
        status: handlers.generateStatus ?? 200,
        json: async () => handlers.generate ?? {},
      } as Response;
    }
    throw new Error(`unexpected fetch: ${href}`);
  }) as unknown as typeof fetch;
}

describe('OllamaDrafter.available', () => {
  it('reports true when /api/tags lists the configured model', async () => {
    const drafter = new OllamaDrafter({
      model: 'qwen2.5-coder:7b',
      fetchImpl: fakeFetch({ tags: { models: [{ name: 'qwen2.5-coder:7b' }] } }),
    });
    expect(await drafter.available()).toBe(true);
  });

  it('reports false when the configured model is not in the list', async () => {
    const drafter = new OllamaDrafter({
      model: 'qwen2.5-coder:7b',
      fetchImpl: fakeFetch({ tags: { models: [{ name: 'llama3:8b' }] } }),
    });
    expect(await drafter.available()).toBe(false);
  });

  it('reports false, never throws, when the request fails outright', async () => {
    const drafter = new OllamaDrafter({
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    await expect(drafter.available()).resolves.toBe(false);
  });

  it('reports false, never throws, on a non-2xx response', async () => {
    const drafter = new OllamaDrafter({ fetchImpl: fakeFetch({ tagsStatus: 500 }) });
    await expect(drafter.available()).resolves.toBe(false);
  });

  it('times out at the configured budget and reports false rather than hanging', async () => {
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    const drafter = new OllamaDrafter({ fetchImpl: slow, availabilityTimeoutMs: 20 });
    await expect(drafter.available()).resolves.toBe(false);
  }, 2000);
});

describe('OllamaDrafter.draft', () => {
  it('parses a well-formed JSON face from /api/generate', async () => {
    const face = { what: 'flag overdue rows', why: 'nothing calls out overdue invoices today', where: 'InvoiceListComponent', acceptance: ['an overdue row renders in the alert colour'] };
    const drafter = new OllamaDrafter({
      model: 'qwen2.5-coder:7b',
      fetchImpl: fakeFetch({ generate: { response: JSON.stringify(face) } }),
    });

    const result = await drafter.draft(mark(), { survey: survey() });

    expect(result).toEqual(face);
  });

  it('sends the model, a prompt mentioning the mark and component, and a JSON format schema', async () => {
    const face = { what: '', why: '', where: '', acceptance: [] };
    const fetchImpl = fakeFetch({ generate: { response: JSON.stringify(face) } });
    const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b', fetchImpl });

    await drafter.draft(mark(), { survey: survey() });

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).endsWith('/api/generate'));
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.model).toBe('qwen2.5-coder:7b');
    expect(body.stream).toBe(false);
    expect(body.prompt).toContain('highlight the due date when overdue');
    expect(body.prompt).toContain('InvoiceListComponent');
    expect(body.format).toBeTruthy();
    expect(body.format.type).toBe('object');
  });

  it('throws a catchable error — never crashes — when the response is not JSON', async () => {
    const drafter = new OllamaDrafter({ fetchImpl: fakeFetch({ generate: { response: 'not json at all' } }) });
    await expect(drafter.draft(mark(), { survey: survey() })).rejects.toThrow();
  });

  it('throws a catchable error when the JSON does not match the human-face schema', async () => {
    const drafter = new OllamaDrafter({ fetchImpl: fakeFetch({ generate: { response: JSON.stringify({ nope: true }) } }) });
    await expect(drafter.draft(mark(), { survey: survey() })).rejects.toThrow();
  });

  it('throws a catchable error on a non-2xx /api/generate response', async () => {
    const drafter = new OllamaDrafter({ fetchImpl: fakeFetch({ generateStatus: 500 }) });
    await expect(drafter.draft(mark(), { survey: survey() })).rejects.toThrow();
  });

  it('draftWithMeta reports the model name and a measured elapsed time', async () => {
    const face = { what: 'x', why: 'y', where: 'z', acceptance: [] };
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/generate')) {
        await new Promise((r) => setTimeout(r, 5));
        return { ok: true, status: 200, json: async () => ({ response: JSON.stringify(face) }) } as Response;
      }
      throw new Error('unexpected');
    }) as unknown as typeof fetch;
    const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b', fetchImpl });

    const result = await drafter.draftWithMeta(mark(), { survey: survey() });

    expect(result.human).toEqual(face);
    expect(result.model).toBe('qwen2.5-coder:7b');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  // Finding 3 (wave-3 council, security medium): /api/generate carried no timeout at all —
  // a wedged Ollama process would hang draftOrder (and, through it, the whole auto-draft
  // path) forever. Same abort-signal pattern `available()`'s own timeout test above uses.
  it('times out at the configured budget rather than hanging forever', async () => {
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    const drafter = new OllamaDrafter({ fetchImpl: slow, draftTimeoutMs: 20 });

    await expect(drafter.draft(mark(), { survey: survey() })).rejects.toThrow(/timed out/i);
  }, 2000);

  it('defaults draftTimeoutMs to 90 seconds when not configured', () => {
    const drafter = new OllamaDrafter();
    expect(drafter.draftTimeoutMs).toBe(90_000);
  });
});
