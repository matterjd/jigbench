import type { ClaudeStatus } from '@jigbench/core';
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
  /** AMENDMENT-1 A6 — "a setup checklist lives one click from the status line": when given, a
   * second button, "setup", sits at the right end of the line and toggles the checklist
   * (`aria-controls="setup"`). Absent, the line is exactly as before — one button. */
  onToggleSetup?: () => void;
  setupOpen?: boolean;
  /** A short reading beside the word, in the line's mono style — "3 of 5", say. */
  setupWord?: string;
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
 * duration. Nothing else on the line; a click opens the logbook drawer over it. The one
 * addition (AMENDMENT-1 A6): when the caller wires `onToggleSetup`, the word "setup" sits at
 * the far right and opens the checklist — otherwise the line stays exactly as it was. */
export function StatusLine({ wired, status, lastEventText, logbookOpen, onToggleLogbook, onToggleSetup, setupOpen, setupWord }: StatusLineProps) {
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
      {onToggleSetup && (
        <button
          type="button"
          className="jig-status-line__setup"
          aria-expanded={setupOpen ?? false}
          aria-controls="setup"
          title="setup — the checklist: the repo, the app, docs, Claude Code"
          onClick={onToggleSetup}
        >
          <span className="jig-status-line__word">setup</span>
          {setupWord && (
            <>
              {' '}
              <span className="jig-status-line__mono">{`· ${setupWord}`}</span>
            </>
          )}
        </button>
      )}
    </footer>
  );
}
