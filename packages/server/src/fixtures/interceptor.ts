import type { IncomingMessage } from 'node:http';
import type { Fixture } from '@jigbench/core';
import type { PlateInterceptor } from '../plate/proxy.js';
import { matchPath, parentListKey, stripQuery } from './path-match.js';

/** The minimal read side `FixtureStore` needs to expose here — kept as its own tiny interface
 * (rather than importing the whole `FixtureStore` class) so this module's tests can fake it
 * with a one-liner. */
export interface ActiveFixtureSource {
  getActive(): Fixture | undefined;
}

function idOf(entity: unknown): string | undefined {
  if (!entity || typeof entity !== 'object') return undefined;
  const e = entity as Record<string, unknown>;
  const value = e.id ?? e.Id ?? e.ID;
  return value === undefined || value === null ? undefined : String(value);
}

function lastSegment(path: string): string | undefined {
  const parts = stripQuery(path).split('/').filter((s) => s.length > 0);
  return parts[parts.length - 1];
}

/**
 * F10: "the proxy serves fixture responses for `/api/*` when a fixture is loaded". Wired into
 * `createPlateProxy`'s `interceptors` array (see `http.ts`) — when no fixture is active, or
 * the request matches nothing in the active one, this declines (`undefined`) and the real
 * proxy target answers as usual, per the seam's own contract.
 *
 * HEAD/GET (Matter's retest-18): TEST-RUN.md's own documented proof command,
 * `curl -sI http://127.0.0.1:4601/api/invoices | grep -i x-jig-fixture`, sends a HEAD
 * request — `curl -I` always does. `Fixture.responses` is only ever keyed by the methods a
 * survey actually observed (`GET`, `POST`, ...) — a survey never emits a `HEAD` endpoint — so
 * a literal method-equality match could never answer a HEAD request, and the documented proof
 * line could never appear no matter how complete the fixture's data was. HEAD is defined by
 * HTTP as "GET without a body" (RFC 9110 §9.3.2: a HEAD response carries the SAME headers a
 * GET would), so a HEAD request is matched against the fixture's `GET` entries and answered
 * with the same headers but an empty body — never against any other verb.
 */
export function createFixtureInterceptor(source: ActiveFixtureSource): PlateInterceptor {
  return (req: IncomingMessage): Response | undefined => {
    const fixture = source.getActive();
    if (!fixture) return undefined;

    const requestMethod = (req.method ?? 'GET').toUpperCase();
    const isHead = requestMethod === 'HEAD';
    const lookupMethod = isHead ? 'GET' : requestMethod;
    const path = req.url ?? '/';

    const matchedKey = Object.keys(fixture.responses).find((key) => {
      const spaceIndex = key.indexOf(' ');
      if (spaceIndex === -1) return false;
      const keyMethod = key.slice(0, spaceIndex);
      const keyTemplate = key.slice(spaceIndex + 1);
      return keyMethod === lookupMethod && matchPath(keyTemplate, path);
    });
    if (!matchedKey) return undefined;

    let payload = fixture.responses[matchedKey];

    const listKey = parentListKey(matchedKey);
    if (listKey) {
      const list = fixture.responses[listKey];
      if (Array.isArray(list)) {
        const id = lastSegment(path);
        const match = id !== undefined ? list.find((entity) => idOf(entity) === id) : undefined;
        if (match !== undefined) payload = match;
      }
    }

    return new Response(isHead ? null : JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-jig-fixture': fixture.name },
    });
  };
}
