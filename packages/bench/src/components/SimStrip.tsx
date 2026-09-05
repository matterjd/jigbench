import { useEffect, useState } from 'react';
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
  /** Override point for tests — defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Reads `/api/state.wiring` and prints each subsystem as wired / stub / none. The loading
 * pulse is the ONLY moving thing on the page, and only while the fetch is in flight. */
export function SimStrip({ fetchImpl = fetch }: SimStripProps) {
  const [wiring, setWiring] = useState<Wiring | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchImpl('/api/state')
      .then((res) => res.json())
      .then((data: { wiring: Wiring }) => {
        if (!cancelled) setWiring(data.wiring);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  const loading = wiring === null && !failed;

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
      {failed && (
        <Chip tone="alert" glyph="!">
          unreachable
        </Chip>
      )}
      {wiring &&
        SUBSYSTEMS.map((name) => (
          <Chip key={name} tone={TONE[wiring[name]]}>
            {name}: {wiring[name]}
          </Chip>
        ))}
    </div>
  );
}
