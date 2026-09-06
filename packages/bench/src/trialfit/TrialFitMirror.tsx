import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolpathSummary, WorkOrder } from '@jigbench/core';
import { useToolpathReplay } from '../toolpath/useToolpathReplay.js';
import { highlightInSnapshot, clearSnapshotHighlight } from './snapshotHighlight.js';
import './TrialFitMirror.css';

export interface TrialFitMirrorProps {
  workOrders: readonly WorkOrder[];
  fetchImpl?: typeof fetch;
  /** The one `printed` affordance: returns the plate to a single frame (App.tsx swaps this
   * component back out for `PlateBench` in the same layout slot — see the integration note
   * in `App.tsx`). */
  onPrinted?: () => void;
}

interface MirrorPlateStatus {
  port: number;
  status: 'up' | 'down' | 'none';
}

function isPastRelease(state: WorkOrder['state']): boolean {
  return state === 'released' || state === 'in-the-shop' || state === 'trial-fit';
}

/**
 * F11 / CHASSIS.md's trial-fit mode: "the app with the change, beside the app before it."
 * Mounted by the integrator in place of `PlateBench` (App.tsx's own `plate=` slot) whenever
 * the order in hand has reached `trial-fit` — this is a wholly separate component, not an
 * edit to `PlateBench.tsx` itself, so the restricted plate-region file stays untouched;
 * visually it fills the exact same layout slot.
 *
 * Before a trial fit exists the right plate is an honest void in words (Law I.6) rather than
 * a spinner. Once one does: left = the release-moment snapshot (`GET
 * /api/plate/snapshot/:id`, same-origin — served from the bench's own port), right = the
 * live mirror proxy (started on demand via `POST /api/plate/mirror`). One toolpath scrubber
 * drives both: the right plate gets the real `jig:*` message; the left (a frozen page) only
 * ever gets a highlight, drawn by `snapshotHighlight.ts` reading the snapshot's OWN live DOM
 * — the choice documented there.
 */
export function TrialFitMirror({ workOrders, fetchImpl = fetch, onPrinted }: TrialFitMirrorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mirror, setMirror] = useState<MirrorPlateStatus | null>(null);
  const [toolpaths, setToolpaths] = useState<ToolpathSummary[]>([]);
  const startedFor = useRef<string | null>(null);
  const leftRef = useRef<HTMLIFrameElement>(null);
  const rightRef = useRef<HTMLIFrameElement>(null);
  const replay = useToolpathReplay();

  useEffect(() => {
    function onSelect(e: Event): void {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) setSelectedId(detail.id);
    }
    window.addEventListener('jig:select-order', onSelect);
    return () => window.removeEventListener('jig:select-order', onSelect);
  }, []);

  const selected = useMemo(() => {
    if (selectedId) {
      const found = workOrders.find((w) => w.id === selectedId);
      if (found) return found;
    }
    return workOrders.length > 0 ? workOrders[workOrders.length - 1] : undefined;
  }, [workOrders, selectedId]);

  const atTrialFit = selected?.state === 'trial-fit';

  // Starts (or repoints) the mirror once per order reaching trial-fit — never re-fires on
  // every render, and never fires again for an order it already started for.
  useEffect(() => {
    if (!atTrialFit || !selected || startedFor.current === selected.id) return;
    startedFor.current = selected.id;
    (async () => {
      const started = await fetchImpl('/api/plate/mirror', { method: 'POST' });
      if (!started.ok) return;
      const status = await fetchImpl('/api/plate');
      const body = (await status.json()) as { mirror?: MirrorPlateStatus };
      if (body.mirror) setMirror(body.mirror);
    })().catch(() => {
      /* the mirror route reports its own errors; a failed auto-start just leaves the right
         plate absent — never a thrown, unhandled rejection from this effect. */
    });
  }, [atTrialFit, selected, fetchImpl]);

  const refreshToolpaths = useCallback(async () => {
    const res = await fetchImpl('/api/toolpaths');
    const data = (await res.json()) as { toolpaths?: ToolpathSummary[] };
    setToolpaths(data.toolpaths ?? []);
  }, [fetchImpl]);

  useEffect(() => {
    if (atTrialFit) void refreshToolpaths();
  }, [atTrialFit, refreshToolpaths]);

  async function replayToolpath(id: string): Promise<void> {
    const res = await fetchImpl(`/api/toolpaths/${id}`);
    const toolpath = await res.json();
    replay.play(toolpath, (message) => {
      rightRef.current?.contentWindow?.postMessage(message, '*');
      const path =
        typeof message.path === 'string'
          ? message.path
          : Array.isArray(message.fields) && typeof message.fields[0]?.path === 'string'
            ? message.fields[0].path
            : undefined;
      const leftDoc = leftRef.current?.contentDocument;
      if (leftDoc && path) highlightInSnapshot(leftDoc, path);
    });
  }

  function printed(): void {
    replay.stop();
    const leftDoc = leftRef.current?.contentDocument;
    if (leftDoc) clearSnapshotHighlight(leftDoc);
    onPrinted?.();
  }

  if (!selected) {
    return (
      <div className="jig-trialfit jig-trialfit--void">
        <p className="jig-trialfit__void">trial fit · not yet — no work order has been released</p>
      </div>
    );
  }

  if (!atTrialFit) {
    const word = isPastRelease(selected.state) ? 'the shop has not returned' : 'not released yet';
    return (
      <div className="jig-trialfit jig-trialfit--void">
        <p className="jig-trialfit__void">
          trial fit · not yet — {word} #{selected.id}
        </p>
      </div>
    );
  }

  const files = selected.shop?.trialFit?.files ?? [];
  const summary = selected.shop?.trialFit?.summary;

  return (
    <div className="jig-trialfit jig-trialfit--split">
      <div className="jig-trialfit__frames">
        <div className="jig-trialfit__frame">
          <p className="jig-trialfit__label">before · snapshot at release</p>
          {/* Wave-4 council finding 4 (MEDIUM): the snapshot HTML is sanitized twice
              (loupe.js client-side, sanitize-snapshot.ts server-side on save) — this sandbox
              is the third, browser-enforced layer, in case anything still slips through.
              `allow-same-origin` (with NO `allow-scripts`) keeps `contentDocument` readable
              for snapshotHighlight.ts (the snapshot is genuinely served from this bench's own
              origin) while disabling script execution entirely — an empty/no `sandbox` at all
              would let any surviving <script> run at full trust in the bench's own origin. */}
          <iframe
            ref={leftRef}
            className="jig-trialfit__iframe"
            title="before — the app at release"
            src={`/api/plate/snapshot/${selected.id}`}
            sandbox="allow-same-origin"
          />
        </div>
        <div className="jig-trialfit__frame">
          <p className="jig-trialfit__label">after · live</p>
          {mirror ? (
            <iframe ref={rightRef} className="jig-trialfit__iframe" title="after — live" src={`http://localhost:${mirror.port}/`} />
          ) : (
            <p className="jig-trialfit__void">starting the mirror…</p>
          )}
        </div>
      </div>

      <div className="jig-trialfit__scrubber">
        <div className="jig-trialfit__changes">
          <p className="jig-trialfit__changes-title">changes the shop reported</p>
          {summary && <p className="jig-trialfit__summary">{summary}</p>}
          <ul className="jig-trialfit__changes-list">
            {files.map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
          </ul>
        </div>

        <ul className="jig-trialfit__toolpaths" aria-label="toolpaths">
          {toolpaths.map((t) => (
            <li key={t.id} className="jig-trialfit__toolpath-row">
              <span>{t.name}</span>
              <button type="button" onClick={() => void replayToolpath(t.id)} disabled={replay.playing}>
                replay
              </button>
            </li>
          ))}
        </ul>

        <button type="button" onClick={printed}>
          printed
        </button>
      </div>
    </div>
  );
}
