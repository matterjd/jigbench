import type { Wiring, WiringStatus } from '@jigbench/core';
import { Chip, type ChipTone } from './Chip.js';
import './SimStrip.css';

const SUBSYSTEMS: readonly (keyof Wiring)[] = [
  'survey',
  'proxy',
  'drafter',
  'shop',
  'fixtures',
  'toolpath',
  'sketch',
];

const TONE: Record<WiringStatus, ChipTone> = {
  wired: 'ok',
  stub: 'warn',
  none: 'neutral',
};

export interface SimStripProps {
  /** The bench's live wiring state — `null` until the first `state` message has ever
   * arrived over the bench's own WebSocket. */
  wiring: Wiring | null;
  /** Whether the bench's WebSocket is currently open (`useJigState`'s own `connected`,
   * already tracked live by `App.tsx` — the same fact its "bench socket: open/reconnecting"
   * indicator shows). Takes priority over stale `wiring`: a disconnected socket is
   * "unreachable" even if it still remembers the last wiring it heard. */
  connected: boolean;
}

/**
 * Prints each subsystem as wired / stub / none, from LIVE state — a prop fed by
 * `App.tsx`'s `useJigState()`, not a one-shot fetch of its own. The loading pulse is the
 * ONLY moving thing on the page, and only until the first state message ever arrives.
 *
 * Retest defect 22 (2026-09-06 evening): "the SIM strip SHOP: NONE" persisted even once an
 * agent was genuinely connected, because the old implementation fetched `/api/state` exactly
 * ONCE on mount and never again — a connection made after the bench page had already loaded
 * (the normal order of operations: open the bench, then open Claude Code) never showed up
 * without a manual reload. `wiring`/`connected` are the SAME live state `App.tsx` already
 * holds and updates on every WS broadcast, including the shop-freshness watcher's own flip.
 */
export function SimStrip({ wiring, connected }: SimStripProps) {
  const unreachable = !connected;
  const loading = !unreachable && wiring === null;

  return (
    <div className="jig-simstrip" aria-label="sim: what is wired">
      <span className="jig-simstrip__label">
        <span aria-hidden="true" className="jig-simstrip__glyph">
          •
        </span>
        SIM
      </span>
      {loading && (
        <span className="jig-simstrip__loading" role="status">
          reading state
          <span aria-hidden="true" className="jig-simstrip__pulse" />
        </span>
      )}
      {unreachable && (
        <Chip tone="alert" glyph="!">
          unreachable
        </Chip>
      )}
      {!unreachable &&
        wiring &&
        SUBSYSTEMS.map((name) => (
          // Chip's own text renders at 10px (under the 11px floor threshold) — floor item 3
          // requires a paired non-text signal at that size, hence the glyph.
          <Chip key={name} tone={TONE[wiring[name]]} glyph="●">
            {name}: {wiring[name]}
          </Chip>
        ))}
    </div>
  );
}
