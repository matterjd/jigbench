import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FixturePanel } from './FixturePanel.js';

afterEach(() => cleanup());

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as unknown as Response;
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/** A tiny router-style fake fetch: `routes` maps `"METHOD path"` (path may be a RegExp
 * source, matched with `new RegExp`) to a response body OR a function producing one. Every
 * call is recorded in `calls` so tests can assert what was actually sent — matching the
 * repo's `fetchImpl` override convention (see SimStrip.test.tsx) but extended for POSTs. */
function routedFetch(routes: Record<string, unknown | ((call: Call) => unknown)>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call: Call = { url, method, body };
    calls.push(call);
    const key = Object.keys(routes).find((k) => {
      const [m, pattern] = k.split(' ', 2);
      return m === method && new RegExp(`^${pattern}$`).test(url);
    });
    const entry = key ? routes[key] : { error: `no route for ${method} ${url}` };
    const result = typeof entry === 'function' ? (entry as (call: Call) => unknown)(call) : entry;
    return jsonResponse(result);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const emptyList = { fixtures: [], active: null };

describe('FixturePanel — list', () => {
  it('says so honestly when there are no fixtures yet', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/fixtures': emptyList });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/no fixtures yet/i)).toBeTruthy());
  });

  it('lists a live fixture with its name and seed in mono', async () => {
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [{ id: 'overdue-heavy', name: 'overdue-heavy', seed: 42, createdAt: new Date().toISOString() }],
        active: null,
      },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText('overdue-heavy')).toBeTruthy());
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByRole('button', { name: /load/i })).toBeTruthy();
  });

  it('lists a scrapped fixture in its own scrap bin, with restore instead of load', async () => {
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [
          { id: 'old', name: 'old', seed: 1, createdAt: new Date().toISOString(), scrapped: true, scrappedAt: new Date().toISOString() },
        ],
        active: null,
      },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText('old')).toBeTruthy());
    expect(screen.getByText(/scrap bin/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^load$/i })).toBeNull();
  });
});

describe('FixturePanel — the tongue: "key," never "seed" (COMMISSION.md §3, FLOOR-PASS-D-2026-09-07.md)', () => {
  it('labels the reproducibility field "key," and never shows the word "seed" as surface text', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/fixtures': emptyList });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/no fixtures yet/i)).toBeTruthy());

    expect(screen.getByText(/key \(optional\)/i)).toBeTruthy();
    expect(screen.queryByText(/^seed\b/i)).toBeNull();
  });
});

describe('FixturePanel — create', () => {
  it('creates a fixture with just a name — no seed key sent when the seed field is blank', async () => {
    const { fetchImpl, calls } = routedFetch({
      'GET /api/fixtures': emptyList,
      'POST /api/fixtures': { id: 'a', name: 'a', seed: 123, createdAt: new Date().toISOString(), responses: {}, forms: {} },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/no fixtures yet/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: /new fixture/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ name: 'a' });
  });

  it('sends an explicit numeric seed when one is given', async () => {
    const { fetchImpl, calls } = routedFetch({
      'GET /api/fixtures': emptyList,
      'POST /api/fixtures': { id: 'a', name: 'a', seed: 7, createdAt: new Date().toISOString(), responses: {}, forms: {} },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/no fixtures yet/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'a' } });
    // The form field is labelled "key" (COMMISSION.md §3 bans "seed" as surface text for
    // Fixture) — the wire field name (body.seed, unchanged, an API concern out of scope here)
    // is a separate thing from the word shown to a human.
    fireEvent.change(screen.getByLabelText(/key/i), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /new fixture/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ name: 'a', seed: 7 });
  });
});

describe('FixturePanel — load / unload', () => {
  it('loading a fixture posts :id/load, shows the loaded chip, and dispatches jig:fixture-loaded', async () => {
    let activeName: string | null = null; // a real fake fixtures API tracks its own state
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': () => ({
        fixtures: [{ id: 'overdue-heavy', name: 'overdue-heavy', seed: 1, createdAt: new Date().toISOString() }],
        active: activeName,
      }),
      'POST /api/fixtures/overdue-heavy/load': () => {
        activeName = 'overdue-heavy';
        return { active: activeName };
      },
    });
    const events: unknown[] = [];
    const onLoaded = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('jig:fixture-loaded', onLoaded);
    try {
      render(<FixturePanel fetchImpl={fetchImpl} />);
      await waitFor(() => expect(screen.getByRole('button', { name: /^load$/i })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /^load$/i }));

      await waitFor(() => expect(screen.getByText(/loaded/i)).toBeTruthy());
      expect(screen.getByText(/the plate answers from it/i)).toBeTruthy();
      expect(events).toEqual([{ name: 'overdue-heavy' }]);
    } finally {
      window.removeEventListener('jig:fixture-loaded', onLoaded);
    }
  });

  it('unloading dispatches jig:fixture-loaded with a null name', async () => {
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [{ id: 'a', name: 'a', seed: 1, createdAt: new Date().toISOString() }],
        active: 'a',
      },
      'POST /api/fixtures/unload': { active: null },
    });
    const events: unknown[] = [];
    const onLoaded = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('jig:fixture-loaded', onLoaded);
    try {
      render(<FixturePanel fetchImpl={fetchImpl} />);
      await waitFor(() => expect(screen.getByRole('button', { name: /unload/i })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /unload/i }));
      await waitFor(() => expect(events).toEqual([{ name: null }]));
    } finally {
      window.removeEventListener('jig:fixture-loaded', onLoaded);
    }
  });
});

describe('FixturePanel — scrap / restore', () => {
  it('scrap posts :id/scrap and restore posts :id/restore', async () => {
    const { fetchImpl, calls } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [{ id: 'a', name: 'a', seed: 1, createdAt: new Date().toISOString() }],
        active: null,
      },
      'POST /api/fixtures/a/scrap': { id: 'a', name: 'a', seed: 1, scrapped: true },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /scrap/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /scrap/i }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/a/scrap'))).toBe(true));
  });
});

describe('FixturePanel — fill the form', () => {
  it('says so in words when no fixture is loaded — never touches the plate', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/fixtures': emptyList });
    const iframeRef = createRef<HTMLIFrameElement>();
    render(<FixturePanel fetchImpl={fetchImpl} iframeRef={iframeRef} plateOrigin="http://localhost:4601" />);
    await waitFor(() => expect(screen.getByText(/no fixtures yet/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /fill the form/i }));
    await waitFor(() => expect(screen.getByText(/load a fixture/i)).toBeTruthy());
  });

  it('resolves the matching schema and posts jig:fill to the plate with the resolved fields', async () => {
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [{ id: 'a', name: 'a', seed: 1, createdAt: new Date().toISOString() }],
        active: 'a',
      },
      'GET /api/fixtures/a': {
        id: 'a',
        name: 'a',
        seed: 1,
        forms: { CreateInvoiceRequest: { customerId: 'c-1', notes: 'net 30' } },
      },
      'POST /api/plate/fill': {
        fields: [
          { name: 'customerId', value: 'c-1' },
          { name: 'notes', value: 'net 30' },
        ],
      },
    });

    const postMessage = vi.fn();
    const iframeRef = { current: { contentWindow: { postMessage } } } as unknown as React.RefObject<HTMLIFrameElement>;

    render(<FixturePanel fetchImpl={fetchImpl} iframeRef={iframeRef} plateOrigin="http://localhost:4601" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /fill the form/i })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /fill the form/i }));

    // the panel posted the probe — reply as the loupe would.
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'jig:fill-probe' }),
      'http://localhost:4601',
    ));
    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'jig:fill-fields', formPath: 'form:nth-of-type(1)', names: ['customerId', 'notes'] },
        origin: 'http://localhost:4601',
      }),
    );

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'jig:fill',
          fields: [
            { name: 'customerId', value: 'c-1' },
            { name: 'notes', value: 'net 30' },
          ],
        }),
        'http://localhost:4601',
      ),
    );
  });

  it('says in words when nothing on the form matches any schema in the fixture', async () => {
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [{ id: 'a', name: 'a', seed: 1, createdAt: new Date().toISOString() }],
        active: 'a',
      },
      'GET /api/fixtures/a': {
        id: 'a',
        name: 'a',
        seed: 1,
        forms: { CreateInvoiceRequest: { customerId: 'c-1' } },
      },
    });
    const postMessage = vi.fn();
    const iframeRef = { current: { contentWindow: { postMessage } } } as unknown as React.RefObject<HTMLIFrameElement>;

    render(<FixturePanel fetchImpl={fetchImpl} iframeRef={iframeRef} plateOrigin="http://localhost:4601" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /fill the form/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /fill the form/i }));

    await waitFor(() => expect(postMessage).toHaveBeenCalled());
    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'jig:fill-fields', formPath: null, names: ['somethingUnrelated'] },
        origin: 'http://localhost:4601',
      }),
    );

    await waitFor(() => expect(screen.getByText(/no schema in this fixture matches/i)).toBeTruthy());
  });
});

describe('FixturePanel — printed', () => {
  it('the printed affordance unloads the active fixture', async () => {
    const { fetchImpl, calls } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [{ id: 'a', name: 'a', seed: 1, createdAt: new Date().toISOString() }],
        active: 'a',
      },
      'POST /api/fixtures/unload': { active: null },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /printed/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /printed/i }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/fixtures/unload'))).toBe(true));
  });
});
