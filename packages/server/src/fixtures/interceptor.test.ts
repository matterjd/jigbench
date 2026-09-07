import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { JIG_FORMAT, type Fixture } from '@jigbench/core';
import { createFixtureInterceptor, type ActiveFixtureSource } from './interceptor.js';

/**
 * F10: "the proxy serves fixture responses for /api/* when a fixture is loaded". This is the
 * `PlateInterceptor` (packages/server/src/plate/proxy.ts's seam) that answers from the active
 * fixture — a full through-the-proxy exercise (fake upstream, real createPlateProxy) lives in
 * the fixture-smoke e2e script and http.test.ts; these are the interceptor's own unit tests.
 */

function fakeReq(method: string, url: string): IncomingMessage {
  return { method, url } as unknown as IncomingMessage;
}

function fixtureWith(overrides: Partial<Fixture>): Fixture {
  return {
    jigFormat: JIG_FORMAT,
    id: 'overdue-heavy',
    name: 'overdue-heavy',
    seed: 42,
    createdAt: '2026-09-05T00:00:00.000Z',
    schemaRefs: ['InvoiceDto'],
    responses: {},
    forms: {},
    ...overrides,
  };
}

function sourceFor(fixture: Fixture | undefined): ActiveFixtureSource {
  return { getActive: () => fixture };
}

describe('createFixtureInterceptor', () => {
  it('passes through (returns undefined) when no fixture is active', async () => {
    const interceptor = createFixtureInterceptor(sourceFor(undefined));
    const result = await interceptor(fakeReq('GET', '/api/invoices'));
    expect(result).toBeUndefined();
  });

  it('passes through when the request matches nothing in the fixture', async () => {
    const fixture = fixtureWith({ responses: { 'GET /api/customers': [] } });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('GET', '/api/invoices'));
    expect(result).toBeUndefined();
  });

  it('answers a list request from the fixture with x-jig-fixture and JSON content-type', async () => {
    const list = [{ id: '1', number: 'INV-1' }, { id: '2', number: 'INV-2' }];
    const fixture = fixtureWith({ responses: { 'GET /api/invoices': list } });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('GET', '/api/invoices'));
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(200);
    expect(result?.headers.get('content-type')).toBe('application/json');
    expect(result?.headers.get('x-jig-fixture')).toBe('overdue-heavy');
    expect(await result?.json()).toEqual(list);
  });

  it('ignores the query string when matching', async () => {
    const list = [{ id: '1' }];
    const fixture = fixtureWith({ responses: { 'GET /api/invoices': list } });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('GET', '/api/invoices?status=overdue'));
    expect(await result?.json()).toEqual(list);
  });

  it('an item request ({id} template) with a matching id in the sibling list answers with THAT entity', async () => {
    const list = [{ id: '1', number: 'INV-1' }, { id: '2', number: 'INV-2' }];
    const fixture = fixtureWith({
      responses: {
        'GET /api/invoices': list,
        'GET /api/invoices/{id}': { id: '1', number: 'INV-1-stale-fallback' },
      },
    });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('GET', '/api/invoices/2'));
    expect(await result?.json()).toEqual({ id: '2', number: 'INV-2' });
  });

  it('an item request whose id has no match in the sibling list falls back to the stored item payload', async () => {
    const list = [{ id: '1' }, { id: '2' }];
    const fallback = { id: '999', number: 'fallback' };
    const fixture = fixtureWith({
      responses: { 'GET /api/invoices': list, 'GET /api/invoices/{id}': fallback },
    });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('GET', '/api/invoices/42'));
    expect(await result?.json()).toEqual(fallback);
  });

  it('a non-numeric, non-uuid segment against a {id} template does not match — passes through', async () => {
    const fixture = fixtureWith({ responses: { 'GET /api/invoices/{id}': { id: '1' } } });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('GET', '/api/invoices/overdue'));
    expect(result).toBeUndefined();
  });

  it('distinguishes by method — a POST to a GET-only fixture key passes through', async () => {
    const fixture = fixtureWith({ responses: { 'GET /api/invoices': [] } });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('POST', '/api/invoices'));
    expect(result).toBeUndefined();
  });

  // Matter's retest-18: `curl -sI http://127.0.0.1:4601/api/invoices | grep -i x-jig-fixture`
  // is TEST-RUN.md's own documented proof command — `curl -I` sends a HEAD request, not GET.
  // Before this fix a HEAD never matched a "GET ..." key at all (strict method equality), so
  // the interceptor silently declined and the proof line the doc tells Matter to run could
  // never appear, regardless of whether the fixture had real endpoint data.
  it('a HEAD request matches the GET-keyed response — headers present, body empty (HTTP HEAD semantics)', async () => {
    const list = [{ id: '1', number: 'INV-1' }];
    const fixture = fixtureWith({ responses: { 'GET /api/invoices': list } });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('HEAD', '/api/invoices'));
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(200);
    expect(result?.headers.get('x-jig-fixture')).toBe('overdue-heavy');
    expect(result?.headers.get('content-type')).toBe('application/json');
    const body = await result?.arrayBuffer();
    expect(body?.byteLength).toBe(0);
  });

  it('a HEAD request to a path with no GET-keyed response passes through', async () => {
    const fixture = fixtureWith({ responses: { 'GET /api/customers': [] } });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('HEAD', '/api/invoices'));
    expect(result).toBeUndefined();
  });

  it('a HEAD request against an {id} template still resolves the sibling list entity', async () => {
    const list = [{ id: '1' }, { id: '2', number: 'INV-2' }];
    const fixture = fixtureWith({
      responses: { 'GET /api/invoices': list, 'GET /api/invoices/{id}': { id: '1', number: 'stale' } },
    });
    const interceptor = createFixtureInterceptor(sourceFor(fixture));
    const result = await interceptor(fakeReq('HEAD', '/api/invoices/2'));
    expect(result?.headers.get('x-jig-fixture')).toBe('overdue-heavy');
    const body = await result?.arrayBuffer();
    expect(body?.byteLength).toBe(0);
  });
});
