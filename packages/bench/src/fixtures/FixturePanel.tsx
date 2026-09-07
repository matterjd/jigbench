import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { FixtureSummary } from '@jigbench/core';
import { Chip } from '../components/Chip.js';
import './FixturePanel.css';

/**
 * F10 / CHASSIS.md's Fixture tool ("a reproducible set of test data"). Mounted by the
 * integrator (S4 owns the properties column / App.tsx) — see this package's index.ts. Talks
 * to the S7 REST surface (`packages/server/src/fixtures/route.ts`) for everything except the
 * actual form fill, which has to be posted into the plate's cross-origin iframe directly
 * (the server can't reach it) — `POST /api/plate/fill` only RESOLVES which values to send.
 */

export interface FixturePanelProps {
  /** The plate's `<iframe>` (owned by S4's PlateFrame) — needed only for "fill the form".
   * Absent until the integrator wires it; the panel degrades to "not connected to the plate
   * yet" rather than throwing. */
  iframeRef?: RefObject<HTMLIFrameElement | null>;
  /** The plate's own origin (S3's `GET /api/plate` `target`, once known) — required alongside
   * `iframeRef` to postMessage into it at all. */
  plateOrigin?: string | null;
  /** The last loupe pick's DOM path (`usePlateBridge`'s `lastPick.path`) — anchors "the
   * current pick's nearest <form>" for the fill probe. Omitted: the probe falls back to the
   * plate page's first form. */
  lastPickPath?: string | null;
  /** Override point for tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface FixturesListResponse {
  fixtures: FixtureSummary[];
  active: string | null;
}

interface FullFixture {
  id: string;
  name: string;
  forms: Record<string, Record<string, unknown>>;
}

const PROBE_TIMEOUT_MS = 4000;

function ageOf(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function dispatchFixtureLoaded(name: string | null): void {
  window.dispatchEvent(new CustomEvent('jig:fixture-loaded', { detail: { name } }));
}

/** Waits for exactly one `window` `message` event of `replyType` from `origin`. Used for both
 * halves of the fill exchange (probe -> jig:fill-fields). Never used for the final `jig:fill`
 * post itself — that one is fire-and-forget from the panel's point of view (the loupe's
 * `jig:filled` reply is informational, not blocking). */
function waitForReply(origin: string, replyType: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error(`timed out waiting for ${replyType}`));
    }, PROBE_TIMEOUT_MS);

    function onMessage(event: MessageEvent): void {
      if (event.origin !== origin) return;
      const data = event.data as { type?: unknown } | undefined;
      if (data && data.type === replyType) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(data as Record<string, unknown>);
      }
    }
    window.addEventListener('message', onMessage);
  });
}

/** The schemaRef whose `forms` values share the most keys with `names` (the plate form's own
 * field names) — "choose the schema by matching input names to schema properties". `null`
 * when nothing overlaps at all. */
function bestMatchingSchema(forms: Record<string, Record<string, unknown>>, names: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [schemaRef, values] of Object.entries(forms)) {
    const score = names.filter((name) => name in values).length;
    if (score > bestScore) {
      best = schemaRef;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export function FixturePanel({ iframeRef, plateOrigin, lastPickPath, fetchImpl = fetch }: FixturePanelProps) {
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); // has GET /api/fixtures answered at least once
  const [name, setName] = useState('');
  const [seed, setSeed] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [fillStatus, setFillStatus] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchImpl('/api/fixtures');
      const data = (await res.json()) as FixturesListResponse;
      setFixtures(data.fixtures ?? []);
      setActive(data.active ?? null);
      setLoaded(true);
    } catch {
      setMessage('could not reach the fixtures API');
      setLoaded(true);
    }
  }, [fetchImpl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createFixture(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedSeed = seed.trim();
    const body: { name: string; seed?: number | string } = { name: trimmedName };
    if (trimmedSeed) {
      const asNumber = Number(trimmedSeed);
      body.seed = Number.isFinite(asNumber) && trimmedSeed !== '' ? asNumber : trimmedSeed;
    }
    const res = await fetchImpl('/api/fixtures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const created = (await res.json()) as { error?: string };
    if (created.error) {
      setMessage(created.error);
      return;
    }
    setName('');
    setSeed('');
    setMessage(null);
    await refresh();
  }

  async function loadFixture(id: string): Promise<void> {
    const res = await fetchImpl(`/api/fixtures/${id}/load`, { method: 'POST' });
    const body = (await res.json()) as { active?: string; error?: string };
    if (body.error) {
      setMessage(body.error);
      return;
    }
    dispatchFixtureLoaded(body.active ?? null);
    await refresh();
  }

  async function unloadFixture(): Promise<void> {
    await fetchImpl('/api/fixtures/unload', { method: 'POST' });
    dispatchFixtureLoaded(null);
    await refresh();
  }

  async function scrapFixture(id: string): Promise<void> {
    await fetchImpl(`/api/fixtures/${id}/scrap`, { method: 'POST' });
    await refresh();
  }

  async function restoreFixture(id: string): Promise<void> {
    await fetchImpl(`/api/fixtures/${id}/restore`, { method: 'POST' });
    await refresh();
  }

  async function printed(): Promise<void> {
    await unloadFixture();
    setFillStatus(null);
  }

  async function fillForm(): Promise<void> {
    setFillStatus(null);
    const activeSummary = fixtures.find((f) => f.name === active);
    if (!active || !activeSummary) {
      setFillStatus('load a fixture before filling a form');
      return;
    }
    const win = iframeRef?.current?.contentWindow;
    if (!win || !plateOrigin) {
      setFillStatus('not connected to the plate yet');
      return;
    }

    setFilling(true);
    try {
      win.postMessage({ type: 'jig:fill-probe', formPath: lastPickPath ?? undefined }, plateOrigin);
      const probe = await waitForReply(plateOrigin, 'jig:fill-fields');
      const names = Array.isArray(probe.names) ? (probe.names as string[]) : [];
      if (names.length === 0) {
        setFillStatus('no form found on the plate to fill');
        return;
      }

      const fixtureRes = await fetchImpl(`/api/fixtures/${activeSummary.id}`);
      const fullFixture = (await fixtureRes.json()) as FullFixture;
      const schemaRef = bestMatchingSchema(fullFixture.forms ?? {}, names);
      if (!schemaRef) {
        setFillStatus('no schema in this fixture matches the fields on this form');
        return;
      }

      const resolveRes = await fetchImpl('/api/plate/fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fixture: activeSummary.id, schemaRef }),
      });
      const resolved = (await resolveRes.json()) as { fields?: unknown };

      win.postMessage(
        { type: 'jig:fill', formPath: (probe.formPath as string | null) ?? undefined, fields: resolved.fields ?? [] },
        plateOrigin,
      );
      setFillStatus(`filling "${schemaRef}" onto the plate`);
    } catch {
      setFillStatus('could not reach the plate to fill the form');
    } finally {
      setFilling(false);
    }
  }

  const live = fixtures.filter((f) => !f.scrapped);
  const scrapped = fixtures.filter((f) => f.scrapped);

  return (
    <div className="jig-fixtures">
      {active && (
        <Chip tone="storm" glyph="●">
          fixture · {active} · loaded — the plate answers from it
        </Chip>
      )}

      {loaded && live.length === 0 && scrapped.length === 0 && <p className="jig-fixtures__empty">no fixtures yet.</p>}

      {live.length > 0 && (
        <ul className="jig-fixtures__list" aria-label="fixtures">
          {live.map((f) => (
            <li key={f.id} className="jig-fixtures__row">
              <span className="jig-fixtures__name">{f.name}</span>
              <span className="jig-fixtures__seed">{String(f.seed)}</span>
              <span className="jig-fixtures__age">{ageOf(f.createdAt)}</span>
              {active === f.name ? (
                <button type="button" onClick={() => void unloadFixture()}>
                  unload
                </button>
              ) : (
                <button type="button" onClick={() => void loadFixture(f.id)}>
                  load
                </button>
              )}
              <button type="button" onClick={() => void scrapFixture(f.id)}>
                scrap
              </button>
            </li>
          ))}
        </ul>
      )}

      {scrapped.length > 0 && (
        <div className="jig-fixtures__scrap-bin">
          <p className="jig-fixtures__scrap-bin-title">scrap bin</p>
          <ul className="jig-fixtures__list" aria-label="scrapped fixtures">
            {scrapped.map((f) => (
              <li key={f.id} className="jig-fixtures__row">
                <span className="jig-fixtures__name">{f.name}</span>
                <span className="jig-fixtures__seed">{String(f.seed)}</span>
                <button type="button" onClick={() => void restoreFixture(f.id)}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={(e) => void createFixture(e)} className="jig-fixtures__create">
        <label>
          name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {/* COMMISSION.md §3 bans "seed" as Fixture's surface word — the human-visible label
              says "key" (FLOOR-PASS-D-2026-09-07.md's disagreement #2). The state name, the
              wire field (body.seed, shared with the core FixtureSummary schema), and this
              CSS class are internal identifiers, unchanged — renaming those is an API change,
              not a copy change, and out of this slice's scope. */}
          key (optional)
          <input value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button type="submit">new fixture</button>
      </form>

      <div className="jig-fixtures__fill">
        <button type="button" onClick={() => void fillForm()} disabled={filling}>
          fill the form
        </button>
        <button type="button" onClick={() => void printed()}>
          printed
        </button>
        {fillStatus && <p className="jig-fixtures__fill-status">{fillStatus}</p>}
      </div>

      {message && <p className="jig-fixtures__message">{message}</p>}
    </div>
  );
}
