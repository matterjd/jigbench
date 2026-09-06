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
 */
export function createFixtureInterceptor(source: ActiveFixtureSource): PlateInterceptor {
  return (req: IncomingMessage): Response | undefined => {
    const fixture = source.getActive();
    if (!fixture) return undefined;

    const method = (req.method ?? 'GET').toUpperCase();
    const path = req.url ?? '/';

    const matchedKey = Object.keys(fixture.responses).find((key) => {
      const spaceIndex = key.indexOf(' ');
      if (spaceIndex === -1) return false;
      const keyMethod = key.slice(0, spaceIndex);
      const keyTemplate = key.slice(spaceIndex + 1);
      return keyMethod === method && matchPath(keyTemplate, path);
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

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-jig-fixture': fixture.name },
    });
  };
}
