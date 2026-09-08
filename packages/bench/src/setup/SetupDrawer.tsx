import { useEffect, useState } from 'react';
import type { BenchState, TargetState } from '@jigbench/core';
import { getSetup, unclamp, type SetupChecklist } from '../clamp/api.js';
import { SetupSteps, targetWords } from './SetupSteps.js';
import './SetupDrawer.css';

export interface SetupDrawerProps {
  open: boolean;
  onClose(): void;
  state: BenchState | null;
  targetLogTail: string[];
  /** Whether "clamp another repo" is offered — the host decides (a `--repo`-booted server
   * has nothing to go back to). */
  canUnclamp: boolean;
  fetchImpl?: typeof fetch;
  onLog?(actor: 'human' | 'bench', event: string, ref: string, note?: string): void;
  onUnclamp?(): void;
}

/** "A setup checklist lives one click from the status line" (AMENDMENT-1 §7, A6). Renders
 * nothing while closed; open, it is a fixed drawer at the status line's right end that reads
 * `GET /api/setup` once and carries the same three steps the Clamp screen does. */
export function SetupDrawer(props: SetupDrawerProps) {
  if (!props.open) return null;
  return <OpenDrawer {...props} />;
}

const NONE: TargetState = { status: 'none' };

function OpenDrawer({ onClose, state, targetLogTail, canUnclamp, fetchImpl = fetch, onLog, onUnclamp }: SetupDrawerProps) {
  const [checklist, setChecklist] = useState<SetupChecklist | null>(null);
  const [message, setMessage] = useState('');
  const [unclamping, setUnclamping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getSetup(fetchImpl).then((result) => {
      if (cancelled) return;
      if (result.ok) setChecklist(result.data);
      else setMessage(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchImpl]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function unclampNow(): Promise<void> {
    setUnclamping(true);
    const result = await unclamp(fetchImpl);
    setUnclamping(false);
    if (result.ok) {
      onLog?.('human', 'unclamp', 'bench');
      onUnclamp?.();
    } else {
      setMessage(`still clamped · ${result.message}`);
    }
  }

  const repoRoot = state?.bench?.repoRoot;
  const target = state?.target ?? checklist?.target ?? NONE;
  const claudeInstalled = (checklist?.claude ?? state?.wiring.claude) === 'installed';
  const devServerGuess = state?.survey?.adapters?.find((a) => a.devServer)?.devServer;

  return (
    <aside id="setup" className="jig-setup-drawer" aria-label="setup — the checklist">
      <div className="jig-setup-drawer__head">
        <p className="jig-setup-drawer__title">setup</p>
        <button type="button" className="jig-setup-drawer__hair" onClick={onClose}>
          close
        </button>
      </div>

      {checklist ? (
        <dl className="jig-setup-drawer__kv">
          <dt>survey</dt>
          <dd>{checklist.survey ? 'read' : 'not yet — clamp a repo'}</dd>
          <dt>the app</dt>
          <dd>{targetWords(target)}</dd>
          <dt>docs</dt>
          <dd>{checklist.docs ? 'clamped' : 'none'}</dd>
          <dt>.mcp.json</dt>
          <dd>{checklist.mcp.written ? 'written' : 'not yet'}</dd>
          <dt>Claude Desktop</dt>
          <dd>{checklist.desktop.written ? 'written' : checklist.desktop.path === undefined ? 'no known path' : 'not yet'}</dd>
          <dt>Claude Code</dt>
          <dd>{checklist.claude === 'installed' ? 'installed' : 'not found'}</dd>
        </dl>
      ) : (
        <p className="jig-setup-drawer__say">{message ? `could not read the checklist · ${message}` : 'reading the checklist … a moment'}</p>
      )}

      {repoRoot ? (
        <SetupSteps
          repoRoot={repoRoot}
          target={target}
          targetLogTail={targetLogTail}
          detected={checklist?.detected ?? null} // #20: the server says what Start the app would run
          devServerGuess={devServerGuess}
          docs={{ wired: checklist?.docs ?? state?.wiring.docs === 'wired' }}
          mcp={checklist?.mcp ?? { written: false }}
          desktop={checklist?.desktop ?? { written: false }}
          claudeInstalled={claudeInstalled}
          fetchImpl={fetchImpl}
          onLog={onLog}
          onDocsClamped={() => setChecklist((c) => (c ? { ...c, docs: true } : c))}
          onMcpWritten={() => setChecklist((c) => (c ? { ...c, mcp: { ...c.mcp, written: true } } : c))}
          onDesktopWritten={() => setChecklist((c) => (c ? { ...c, desktop: { ...c.desktop, written: true } } : c))}
        />
      ) : (
        <p className="jig-setup-drawer__say">nothing clamped — the Clamp screen is where a repo gets picked</p>
      )}

      {canUnclamp && (
        <div className="jig-setup-drawer__foot">
          <button type="button" className="jig-setup-drawer__hair" disabled={unclamping} onClick={() => void unclampNow()}>
            clamp another repo
          </button>
          {unclamping && <span className="jig-setup-drawer__say">letting go of this repo …</span>}
        </div>
      )}
    </aside>
  );
}
