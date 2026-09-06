import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { Gauge, SketchElement } from '@jigbench/core';
import { resolveGridPx } from '../plate/gridReadout.js';
import { PlateRulers } from '../plate/PlateRulers.js';
import { PlateGuides } from '../plate/PlateGuides.js';
import {
  DEFAULT_GRID,
  addElement,
  moveElement,
  newSketch,
  openSketch,
  loadSketches,
  printed,
  resizeElement,
  restoreSketch,
  save,
  scrapSelected,
  scrapSketch,
  selectElement,
  useSketchWorkspace,
} from './sketchWorkspace.js';
import './SketchSheet.css';

export interface SketchSheetProps {
  /** The survey's gauge set — used only to resolve the sheet's own snap grid (the same
   * smallest-`space`-gauge rule the plate's rulers/guides already use). */
  gauges?: readonly Gauge[];
  fetchImpl?: typeof fetch;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

interface DragState {
  kind: 'move' | 'resize';
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
}

/**
 * F9 / CHASSIS.md's Sketch tool: "the rail's Sketch swaps the frame for a sheet drawn with
 * the app's gauges" (concept-a-the-surface-plate.md) — mounted by the integrator (App.tsx) in
 * the SAME `plate` slot `PlateBench`/`TrialFitMirror` already occupy, exactly the pattern S8's
 * trial-fit mode already established. Before a sketch is open this renders the sheet browser
 * (open an existing one, start a new one, the whole-document scrap bin); once one is open it
 * renders the drawing surface itself — click-to-add (the concept's own interaction, snapped
 * to the grid), drag-to-move, a resize handle, and `Delete` to scrap the selection.
 */
export function SketchSheet({ gauges, fetchImpl = fetch }: SketchSheetProps) {
  const state = useSketchWorkspace();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [name, setName] = useState('');
  const [showScrapBin, setShowScrapBin] = useState(false);
  const grid = resolveGridPx(gauges).px || DEFAULT_GRID;

  useEffect(() => {
    void loadSketches(fetchImpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedElementId) {
        event.preventDefault();
        scrapSelected();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.selectedElementId]);

  useEffect(() => {
    function onMove(event: MouseEvent): void {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.kind === 'move') {
        moveElement(drag.id, drag.originX + dx, drag.originY + dy, grid);
      } else {
        resizeElement(drag.id, drag.originW + dx, drag.originH + dy, grid);
      }
    }
    function onUp(): void {
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [grid]);

  async function createSketch(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // The sheet starts at the app's own viewport size (S9 brief) — the plate's viewport when
    // one is known, else a sensible desktop default.
    const size = { w: window.innerWidth || 1280, h: window.innerHeight || 800 };
    await newSketch(trimmed, size, fetchImpl);
    setName('');
  }

  function onSheetClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target !== sheetRef.current) return; // a click ON an element is handled by that element
    const box = sheetRef.current?.getBoundingClientRect();
    const x = event.clientX - (box?.left ?? 0);
    const y = event.clientY - (box?.top ?? 0);
    addElement(x, y, grid);
  }

  function onElementMouseDown(event: ReactMouseEvent, element: SketchElement): void {
    event.stopPropagation();
    selectElement(element.id);
    dragRef.current = {
      kind: 'move',
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
      originW: element.w,
      originH: element.h,
    };
  }

  function onResizeMouseDown(event: ReactMouseEvent, element: SketchElement): void {
    event.stopPropagation();
    dragRef.current = {
      kind: 'resize',
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
      originW: element.w,
      originH: element.h,
    };
  }

  const live = state.sketches.filter((s) => !s.scrapped);
  const scrapped = state.sketches.filter((s) => s.scrapped);

  if (!state.activeSketch) {
    return (
      <div className="jig-sketch-sheet-panel">
        {state.loaded && live.length === 0 && scrapped.length === 0 && (
          <p className="jig-sketch-sheet-panel__empty">no sketches yet.</p>
        )}

        {live.length > 0 && (
          <ul className="jig-sketch-sheet-panel__list" aria-label="sketches">
            {live.map((s) => (
              <li key={s.id} className="jig-sketch-sheet-panel__row">
                <span className="jig-sketch-sheet-panel__name">{s.name}</span>
                <span className="jig-sketch-sheet-panel__count">{s.elementCount} elements</span>
                <button type="button" onClick={() => void openSketch(s.id, fetchImpl)}>
                  edit
                </button>
                <button type="button" onClick={() => void scrapSketch(s.id, fetchImpl)}>
                  scrap
                </button>
              </li>
            ))}
          </ul>
        )}

        {scrapped.length > 0 && (
          <div className="jig-sketch-sheet-panel__scrap-bin">
            <button type="button" onClick={() => setShowScrapBin((v) => !v)}>
              scrap bin ({scrapped.length})
            </button>
            {showScrapBin && (
              <ul className="jig-sketch-sheet-panel__list" aria-label="scrapped sketches">
                {scrapped.map((s) => (
                  <li key={s.id} className="jig-sketch-sheet-panel__row">
                    <span className="jig-sketch-sheet-panel__name">{s.name}</span>
                    <button type="button" onClick={() => void restoreSketch(s.id, fetchImpl)}>
                      restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form className="jig-sketch-sheet-panel__new" onSubmit={(e) => void createSketch(e)}>
          <input placeholder="name this sketch" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">new</button>
        </form>
      </div>
    );
  }

  const sketch = state.activeSketch;
  const gridResult = { px: grid, fallbackUsed: resolveGridPx(gauges).fallbackUsed };
  const selected = sketch.elements.find((e) => e.id === state.selectedElementId) ?? null;
  const selectedRect = selected ? { x: selected.x, y: selected.y, width: selected.w, height: selected.h } : null;
  // "every filtered or resized surface has one printed affordance" (design floor) — save and
  // printed both appear ONLY once the draft has actually drifted from what is on disk.
  const dirty = JSON.stringify(sketch) !== JSON.stringify(state.savedSketch);

  return (
    <div className="jig-sketch-sheet-panel">
      <div className="jig-sketch-sheet-panel__tab">
        <span>Sketch · {sketch.name}</span>
        <span className="jig-sketch-sheet-panel__faint">·</span>
        <span className="jig-sketch-sheet-panel__mono">.jig/sketches/{sketch.id}.json</span>
        {dirty && (
          <span className="jig-sketch-sheet-panel__actions">
            <button type="button" onClick={() => void save(fetchImpl)}>
              save
            </button>
            <button type="button" className="jig-sketch-sheet-panel__printed" onClick={() => printed()}>
              printed
            </button>
          </span>
        )}
      </div>
      <div className="jig-sketch-sheet-panel__surface">
        <PlateRulers cursor={null} />
        <div className="jig-sketch-sheet-panel__viewport">
          <div
            ref={sheetRef}
            className="jig-sketch-sheet-panel__sheet"
            aria-label="sketch sheet"
            style={{ width: sketch.size.w, height: sketch.size.h }}
            onClick={onSheetClick}
          >
            {sketch.elements.map((element) => (
              <div
                key={element.id}
                data-testid={`sketch-element-${element.id}`}
                className={
                  'jig-sketch-sheet-panel__element' +
                  (state.selectedElementId === element.id ? ' jig-sketch-sheet-panel__element--selected' : '') +
                  ` jig-sketch-sheet-panel__element--${element.kind}`
                }
                style={{ left: element.x, top: element.y, width: element.w, height: element.h }}
                onMouseDown={(e) => onElementMouseDown(e, element)}
              >
                {element.kind === 'text' && element.content}
                {element.kind === 'button' && (element.label ?? 'button')}
                {element.kind === 'image' && (element.label ?? 'image')}
                <span
                  className="jig-sketch-sheet-panel__resize-handle"
                  data-testid={`sketch-resize-handle-${element.id}`}
                  onMouseDown={(e) => onResizeMouseDown(e, element)}
                />
              </div>
            ))}
          </div>
          <PlateGuides rect={selectedRect} grid={gridResult} />
        </div>
      </div>
    </div>
  );
}
