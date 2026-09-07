import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JIG_FORMAT, type Survey } from '@jigbench/core';
import { FixturePanel } from './FixturePanel.js';

function surveyWith(endpoints: Survey['endpoints']): Survey {
  return {
    jigFormat: JIG_FORMAT,
    stack: ['angular'],
    components: [],
    routes: [],
    endpoints,
    schemas: [],
    docs: [],
    generatedAt: '2026-09-07T00:00:00.000Z',
  };
}

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

// Matter's retest-18: surveying `--repo examples/ledger-angular` alone (the Angular adapter
// contributes component-model schemas but never endpoints — that's the .NET adapter's job)
// yields a Fixture whose `responses` map is permanently empty, so the plate can never answer
// a real request from it. The panel must SAY so, in words, rather than let Matter discover it
// only via a missing terminal header.
describe('FixturePanel — honest note when the survey has no endpoints', () => {
  it('says so when the survey has zero endpoints', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/fixtures': emptyList });
    render(<FixturePanel fetchImpl={fetchImpl} survey={surveyWith([])} />);
    await waitFor(() => expect(screen.getByText(/this survey has no endpoints — survey the api too/i)).toBeTruthy());
  });

  it('says nothing when the survey has endpoints', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/fixtures': emptyList });
    render(
      <FixturePanel
        fetchImpl={fetchImpl}
        survey={surveyWith([{ method: 'GET', path: '/api/invoices' }])}
      />,
    );
    await waitFor(() => expect(screen.getByText(/no fixtures yet/i)).toBeTruthy());
    expect(screen.queryByText(/survey the api too/i)).toBeNull();
  });

  it('says nothing when no survey prop is given at all — never guesses at a survey it was not told about', async () => {
    const { fetchImpl } = routedFetch({ 'GET /api/fixtures': emptyList });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByText(/no fixtures yet/i)).toBeTruthy());
    expect(screen.queryByText(/survey the api too/i)).toBeNull();
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
    fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /new fixture/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ name: 'a', seed: 7 });
  });
});

describe('FixturePanel — load / unload', () => {
  it('loading a fixture posts :id/load, shows the CONFIRMED loaded chip with the real x-jig-fixture value, and dispatches jig:fixture-loaded', async () => {
    let activeName: string | null = null; // a real fake fixtures API tracks its own state
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': () => ({
        fixtures: [{ id: 'overdue-heavy', name: 'overdue-heavy', seed: 1, createdAt: new Date().toISOString() }],
        active: activeName,
      }),
      'POST /api/fixtures/overdue-heavy/load': () => {
        activeName = 'overdue-heavy';
        return { active: activeName, proof: { ok: true, header: 'x-jig-fixture', value: 'overdue-heavy' } };
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
      // The proof line (Matter's retest-18): a REAL x-jig-fixture value read back from the
      // plate, not the panel repeating the fixture name it already knew client-side.
      expect(screen.getByText(/x-jig-fixture: overdue-heavy/i)).toBeTruthy();
      // PlateBench's own plate-frame chip listens for this same event (integration seam 3) —
      // the proof must ride along so that chip can say the same honest thing, never a second,
      // independently-worded (and here, unconditionally confirmed) claim.
      expect(events).toEqual([
        { name: 'overdue-heavy', proof: { ok: true, header: 'x-jig-fixture', value: 'overdue-heavy' } },
      ]);
    } finally {
      window.removeEventListener('jig:fixture-loaded', onLoaded);
    }
  });

  it('loading a fixture the plate does NOT confirm never claims "the plate answers from it" — says so honestly instead', async () => {
    let activeName: string | null = null;
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': () => ({
        fixtures: [{ id: 'overdue-heavy', name: 'overdue-heavy', seed: 1, createdAt: new Date().toISOString() }],
        active: activeName,
      }),
      'POST /api/fixtures/overdue-heavy/load': () => {
        activeName = 'overdue-heavy';
        return { active: activeName, proof: { ok: false, reason: 'no-endpoints' } };
      },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^load$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));

    await waitFor(() => expect(screen.getByText(/loaded/i)).toBeTruthy());
    expect(screen.queryByText(/the plate answers from it/i)).toBeNull();
    expect(screen.getByText(/survey the api too/i)).toBeTruthy();
  });

  it('loading when the server never wires a plate at all (no proof key) shows a neutral loaded state — no unverified claim', async () => {
    let activeName: string | null = null;
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': () => ({
        fixtures: [{ id: 'a', name: 'a', seed: 1, createdAt: new Date().toISOString() }],
        active: activeName,
      }),
      'POST /api/fixtures/a/load': () => {
        activeName = 'a';
        return { active: activeName }; // no `proof` key — the prior, plate-less contract
      },
    });
    render(<FixturePanel fetchImpl={fetchImpl} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^load$/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^load$/i }));

    await waitFor(() => expect(screen.getByText(/loaded/i)).toBeTruthy());
    expect(screen.queryByText(/the plate answers from it/i)).toBeNull();
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

    // close the loop so this test never leaves a dangling jig:filled wait behind it.
    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'jig:filled', filled: ['customerId', 'notes'], missing: [] },
        origin: 'http://localhost:4601',
      }),
    );
    await waitFor(() => expect(screen.getByText(/filled "CreateInvoiceRequest" onto the plate/i)).toBeTruthy());
  });

  // Matter's retest-18 asked, explicitly: "when nothing matches, the panel says which fields
  // it could not match, in words" — not only the all-or-nothing "no schema matches" case
  // below, but per-FIELD misses too (the Ledger form's real "Invoice" schema carries fields
  // like `id`/`status`/`lines` that have no matching input on the New-invoice form at all —
  // the loupe already reports these as `missing` in its `jig:filled` reply; the panel used to
  // just say "filling ... onto the plate" and never look at that reply again).
  it('reports which fields the loupe could NOT match, in words, once it replies', async () => {
    const { fetchImpl } = routedFetch({
      'GET /api/fixtures': {
        fixtures: [{ id: 'a', name: 'a', seed: 1, createdAt: new Date().toISOString() }],
        active: 'a',
      },
      'GET /api/fixtures/a': {
        id: 'a',
        name: 'a',
        seed: 1,
        forms: { Invoice: { customerId: 'c-1', issuedOn: '2026-09-01', id: 'inv-1', status: 'draft' } },
      },
      'POST /api/plate/fill': {
        fields: [
          { name: 'customerId', value: 'c-1' },
          { name: 'issuedOn', value: '2026-09-01' },
          { name: 'id', value: 'inv-1' },
          { name: 'status', value: 'draft' },
        ],
      },
    });
    const postMessage = vi.fn();
    const iframeRef = { current: { contentWindow: { postMessage } } } as unknown as React.RefObject<HTMLIFrameElement>;

    render(<FixturePanel fetchImpl={fetchImpl} iframeRef={iframeRef} plateOrigin="http://localhost:4601" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /fill the form/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /fill the form/i }));

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'jig:fill-fields', formPath: 'form:nth-of-type(1)', names: ['customerId', 'issuedOn'] },
        origin: 'http://localhost:4601',
      }),
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'jig:fill' }), 'http://localhost:4601'));

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'jig:filled', filled: ['customerId', 'issuedOn'], missing: ['id', 'status'] },
        origin: 'http://localhost:4601',
      }),
    );

    await waitFor(() => expect(screen.getByText(/could not match: id, status/i)).toBeTruthy());
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
