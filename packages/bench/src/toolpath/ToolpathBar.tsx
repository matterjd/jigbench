import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Toolpath, ToolpathSummary } from '@jigbench/core';
import { useToolpathRecorder } from './useToolpathRecorder.js';
import { useToolpathReplay, type ReplaySpeed } from './useToolpathReplay.js';
import type { PlateEvent } from '../plate/usePlateBridge.js';
import './ToolpathBar.css';

export interface ToolpathBarProps {
  /** PlateBench's `onEvent` seam — the last `jig:event` the plate posted. Only consumed
   * while recording (see `useToolpathRecorder`). */
  lastEvent: PlateEvent | null;
  /** `PlateBenchHandle.post` (or a fan-out to two plates — the trial-fit mirror's own
   * scrubber reuses `useToolpathReplay` the same way, wired to both frames there). */
  post: (message: Record<string, unknown>) => void;
  fetchImpl?: typeof fetch;
}

const SPEEDS: ReplaySpeed[] = [0.5, 1, 2];

/**
 * F11 / CHASSIS.md's Toolpath tool — "a recorded click sequence, replayable": the recorder
 * bar (record / stop / name / save) plus the saved list with a per-toolpath replay button,
 * a speed control, and a `printed` affordance that returns the plate to rest without
 * discarding any saved recording (Law II — nothing here is ever deleted, only added to).
 * Reduced motion: this bar has no animation of its own to gate — state changes render
 * directly, nothing here transitions.
 */
export function ToolpathBar({ lastEvent, post, fetchImpl = fetch }: ToolpathBarProps) {
  const recorder = useToolpathRecorder(lastEvent);
  const replay = useToolpathReplay();
  const [toolpaths, setToolpaths] = useState<ToolpathSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchImpl('/api/toolpaths');
      const data = (await res.json()) as { toolpaths?: ToolpathSummary[] };
      setToolpaths(data.toolpaths ?? []);
    } catch {
      setMessage('could not reach the toolpaths API');
    } finally {
      setLoaded(true);
    }
  }, [fetchImpl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || recorder.steps.length === 0) return;
    const res = await fetchImpl('/api/toolpaths', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed, steps: recorder.steps }),
    });
    if (!res.ok) {
      setMessage('could not save this toolpath');
      return;
    }
    setName('');
    recorder.reset();
    setMessage(null);
    await refresh();
  }

  async function replayToolpath(id: string): Promise<void> {
    const res = await fetchImpl(`/api/toolpaths/${id}`);
    const toolpath = (await res.json()) as Toolpath;
    setActiveId(id);
    replay.play(toolpath, post);
  }

  function printed(): void {
    replay.stop();
    setActiveId(null);
  }

  return (
    <div className="jig-toolpath-bar">
      <div className="jig-toolpath-bar__record">
        {!recorder.recording ? (
          <button type="button" onClick={() => recorder.start()}>
            record
          </button>
        ) : (
          <>
            <button type="button" onClick={() => recorder.stop()}>
              stop
            </button>
            <span className="jig-toolpath-bar__count">
              {recorder.steps.length} stop{recorder.steps.length === 1 ? '' : 's'}
            </span>
          </>
        )}
        {!recorder.recording && recorder.steps.length > 0 && (
          <form className="jig-toolpath-bar__save" onSubmit={(e) => void save(e)}>
            <input placeholder="name this toolpath" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit">save</button>
          </form>
        )}
      </div>

      <div className="jig-toolpath-bar__replay">
        {loaded && toolpaths.length === 0 ? (
          <p className="jig-toolpath-bar__empty">no toolpaths yet.</p>
        ) : (
          <ul className="jig-toolpath-bar__list" aria-label="toolpaths">
            {toolpaths.map((t) => (
              <li key={t.id} className="jig-toolpath-bar__row">
                <span className="jig-toolpath-bar__name">{t.name}</span>
                <span className="jig-toolpath-bar__count">
                  {t.stepCount} stop{t.stepCount === 1 ? '' : 's'}
                </span>
                <button type="button" onClick={() => void replayToolpath(t.id)} disabled={replay.playing}>
                  replay
                </button>
                {activeId === t.id && replay.currentStepIndex >= 0 && (
                  <span className="jig-toolpath-bar__stop">stop {replay.currentStepIndex + 1}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="jig-toolpath-bar__speed" role="group" aria-label="replay speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={replay.speed === s}
              className={'jig-toolpath-bar__speed-btn' + (replay.speed === s ? ' jig-toolpath-bar__speed-btn--active' : '')}
              onClick={() => replay.setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>

        <button type="button" onClick={printed}>
          printed
        </button>
      </div>

      {message && <p className="jig-toolpath-bar__message">{message}</p>}
    </div>
  );
}
