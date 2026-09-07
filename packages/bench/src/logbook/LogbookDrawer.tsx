// packages/bench/src/logbook/LogbookDrawer.tsx — the logbook drawer over the status line
// (concept D · The Quiet Bench: z5, the one earned deep shadow while open). The status line's
// Claude button is its trigger (`aria-controls="logbook"`); useLogbook.ts is its source.
import { useEffect, useState } from 'react';
import type { LogEntry } from '@jigbench/core';
import './LogbookDrawer.css';

export interface LogbookDrawerProps {
  open: boolean;
  /** Oldest first (useLogbook's order); the drawer shows newest first. */
  entries: readonly LogEntry[];
  onClose: () => void;
  /** The clock the ages are read against — a test seam; defaults to Date.now. */
  now?: () => number;
}

const ALL = 'all';

/** The house actors, in the order their pills sit; anyone else follows alphabetically. */
const ACTOR_ORDER = ['human', 'claude', 'bench', 'app', 'model'];

/** How long ago, in one word: "now" under five seconds, then "12s", "3m", "2h". */
export function ageWord(at: string, nowMs: number): string {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function actorRank(actor: string): number {
  const i = ACTOR_ORDER.indexOf(actor.toLowerCase());
  return i === -1 ? ACTOR_ORDER.length : i;
}

/** The pills: every actor with at least one row — house order first, then the rest A–Z. */
export function actorsOf(entries: readonly LogEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) seen.add(entry.actor);
  return [...seen].sort((a, b) => actorRank(a) - actorRank(b) || a.localeCompare(b));
}

/** The row's left edge, per actor: human → ink, Claude → wyrd, model → dim; everyone else
 * (bench, app) keeps the hairline. */
function rowModifier(actor: string): string {
  switch (actor.toLowerCase()) {
    case 'human':
      return ' jig-logbook-drawer__row--human';
    case 'claude':
      return ' jig-logbook-drawer__row--claude';
    case 'model':
      return ' jig-logbook-drawer__row--model';
    default:
      return '';
  }
}

export function LogbookDrawer({ open, entries, onClose, now = Date.now }: LogbookDrawerProps) {
  const [filter, setFilter] = useState<string>(ALL);

  // Escape closes — a window listener only while the drawer is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nowMs = now();
  const actors = actorsOf(entries);
  const rows = entries
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => filter === ALL || entry.actor === filter)
    .reverse();

  return (
    <section id="logbook" className="jig-logbook-drawer" aria-label="logbook — the record of everything that happened on the bench">
      <div className="jig-logbook-drawer__head">
        <span className="jig-logbook-drawer__title">logbook</span>
        <button type="button" className="jig-logbook-drawer__filter" aria-pressed={filter === ALL} onClick={() => setFilter(ALL)}>
          all
        </button>
        {actors.map((actor) => (
          <button key={actor} type="button" className="jig-logbook-drawer__filter" aria-pressed={filter === actor} onClick={() => setFilter(actor)}>
            {actor}
          </button>
        ))}
        {filter !== ALL && (
          <button type="button" className="jig-logbook-drawer__printed" title="printed — show everything" onClick={() => setFilter(ALL)}>
            printed
          </button>
        )}
        <span className="jig-logbook-drawer__prov">this session · nothing leaves the machine</span>
        <button type="button" className="jig-logbook-drawer__close" onClick={onClose}>
          close
        </button>
      </div>
      <div className="jig-logbook-drawer__body">
        {entries.length === 0 ? (
          <p className="jig-logbook-drawer__empty">The logbook — the record of everything that happened on the bench — is empty so far.</p>
        ) : rows.length === 0 ? (
          <p className="jig-logbook-drawer__empty">
            nothing on the shelves for <b>{filter}</b>
          </p>
        ) : (
          <ol className="jig-logbook-drawer__rows">
            {rows.map(({ entry, i }) => (
              <li key={`${i}-${entry.at}`} className={`jig-logbook-drawer__row${rowModifier(entry.actor)}`}>
                <span className="jig-logbook-drawer__age">{ageWord(entry.at, nowMs)}</span>
                <span className="jig-logbook-drawer__what">
                  <span className="jig-logbook-drawer__event">{entry.event}</span>
                  {entry.note && <span className="jig-logbook-drawer__note">{entry.note}</span>}
                </span>
                <span className="jig-logbook-drawer__who">{entry.actor}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
