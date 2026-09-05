import type { LogEntry } from '@jigbench/core';
import './Logbook.css';

export interface LogbookProps {
  entries: readonly LogEntry[];
}

/** The record of everything that happened on the bench. */
export function Logbook({ entries }: LogbookProps) {
  if (entries.length === 0) {
    return (
      <p className="jig-logbook__empty">
        The logbook — the record of everything that happened on the bench — is empty so far.
      </p>
    );
  }

  return (
    <ol className="jig-logbook" aria-label="logbook">
      {entries.map((entry, i) => (
        <li key={`${entry.ref}-${entry.at}-${i}`} className="jig-logbook__entry">
          <span className="jig-logbook__at">{entry.at}</span>
          <span className="jig-logbook__actor">{entry.actor}</span>
          <span className="jig-logbook__event">{entry.event}</span>
          {entry.note && <span className="jig-logbook__note">{entry.note}</span>}
        </li>
      ))}
    </ol>
  );
}
