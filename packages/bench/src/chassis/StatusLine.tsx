import type { ClaudeStatus } from '../prompts/types.js';
import './StatusLine.css';

export interface StatusLineProps {
  /** wiring.claude === 'installed' */
  wired: boolean;
  status: ClaudeStatus | undefined;
  /** The most recent build-stream line for the prompt `status` names — status.claude itself
   * carries no per-step text (only id/elapsed), so the caller derives this from the live stream
   * (usePrompts.ts's buildStreams). */
  lastEventText?: string;
  logbookOpen: boolean;
  onToggleLogbook: () => void;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** "One status line at the bottom" (AMENDMENT-1 §3/§4) — Claude's one sentence: idle, not
 * installed, building with elapsed time and the latest step, or built with a file count and
 * duration. Nothing else on the line; a click opens the logbook drawer over it. */
export function StatusLine({ wired, status, lastEventText, logbookOpen, onToggleLogbook }: StatusLineProps) {
  let text: string;
  let pipClass = 'jig-status-line__pip';

  if (!wired) {
    text = '· not installed';
  } else if (status?.state === 'building') {
    pipClass += ' jig-status-line__pip--live';
    text = `· building · ${mmss(status.elapsed)} · ${lastEventText ?? 'starting claude -p'}`;
  } else if (status?.state === 'built') {
    pipClass += ' jig-status-line__pip--done';
    text = `· built · ${status.files.length} files · ${duration(status.elapsed)}`;
  } else {
    text = '· idle';
  }

  return (
    <footer className="jig-status-line">
      <button
        type="button"
        className="jig-status-line__claude"
        aria-expanded={logbookOpen}
        aria-controls="logbook"
        title="Claude — click to open the logbook"
        onClick={onToggleLogbook}
      >
        <span className={pipClass} aria-hidden="true" />
        <span className="jig-status-line__word">Claude</span>
        <span className="jig-status-line__mono">{text}</span>
      </button>
      <span className="jig-status-line__spacer" />
    </footer>
  );
}
