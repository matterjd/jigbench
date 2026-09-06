// packages/bench/src/sketch/sketchWorkspace.ts — the Sketch tool's own client state (not
// server state), the same module-level "external store" shape `tools/toolState.ts` already
// uses for the rail's active tool: two independent surfaces (the sheet on the plate, the
// properties column's Sketch tab) both need the same selection/draft/scrap-bin state with no
// common ancestor to lift it through (App.tsx only ever mounts each in its own slot) — a
// shared module store is the minimal-diff answer, not a context provider threaded through a
// restricted file.
import { useSyncExternalStore } from 'react';
import { snap, type Sketch, type SketchElement, type SketchLink, type SketchSummary } from '@jigbench/core';

export type PaletteTool = 'box' | 'text' | 'button' | 'input' | 'image' | 'list';

export const DEFAULT_GRID = 4; // the surveyed 4px space gauge, or the app's smallest one (caller may override)

export interface SketchWorkspaceState {
  /** Has `GET /api/sketches` answered at least once — honest-empty needs this to distinguish
   * "still loading" from "there really are none". */
  loaded: boolean;
  sketches: SketchSummary[];
  /** The sketch currently open on the sheet, WITH any unsaved edits already applied. */
  activeSketch: Sketch | null;
  /** The last-saved snapshot of `activeSketch` — what `printed` reverts back to. */
  savedSketch: Sketch | null;
  selectedElementId: string | null;
  tool: PaletteTool;
  /** Elements removed from `activeSketch.elements` by Delete, kept here so they can be
   * restored — Law II applied to a single element inside an editing session. Cleared on
   * `save`/`printed`/opening a different sketch. */
  scrapBin: SketchElement[];
  message: string | null;
}

let state: SketchWorkspaceState = {
  loaded: false,
  sketches: [],
  activeSketch: null,
  savedSketch: null,
  selectedElementId: null,
  tool: 'box',
  scrapBin: [],
  message: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<SketchWorkspaceState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSketchWorkspaceState(): SketchWorkspaceState {
  return state;
}

/** Test-only escape hatch — mirrors `Pairing`'s `resetPairingsForTests`. Production code
 * never resets a live editing session mid-flight. */
export function resetSketchWorkspaceForTests(): void {
  state = {
    loaded: false,
    sketches: [],
    activeSketch: null,
    savedSketch: null,
    selectedElementId: null,
    tool: 'box',
    scrapBin: [],
    message: null,
  };
}

function deepCloneSketch(sketch: Sketch): Sketch {
  return { ...sketch, size: { ...sketch.size }, elements: sketch.elements.map((e) => ({ ...e })), links: sketch.links.map((l) => ({ ...l })) };
}

const DEFAULT_SIZE: Record<PaletteTool, { w: number; h: number }> = {
  box: { w: 160, h: 96 },
  text: { w: 160, h: 24 },
  button: { w: 96, h: 32 },
  input: { w: 200, h: 32 },
  image: { w: 160, h: 120 },
  list: { w: 240, h: 120 },
};

function newElement(id: string, kind: PaletteTool, x: number, y: number, grid: number): SketchElement {
  const size = DEFAULT_SIZE[kind];
  const base = { id, x: snap(x, grid), y: snap(y, grid), w: size.w, h: size.h, gauges: {} };
  switch (kind) {
    case 'text':
      return { ...base, kind, content: '', sizeStep: 0 };
    case 'list':
      return { ...base, kind, rows: 3 };
    case 'input':
      return { ...base, kind };
    case 'image':
      return { ...base, kind, label: 'image' };
    case 'button':
      return { ...base, kind, label: 'button' };
    case 'box':
    default:
      return { ...base, kind: 'box' };
  }
}

let elementSeq = 0;
function nextElementId(): string {
  elementSeq += 1;
  return `e${elementSeq}`;
}

export async function loadSketches(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchImpl('/api/sketches');
    const data = (await res.json()) as { sketches?: SketchSummary[] };
    setState({ sketches: data.sketches ?? [], loaded: true });
  } catch {
    setState({ message: 'could not reach the sketches API', loaded: true });
  }
}

export async function newSketch(
  name: string,
  size: { w: number; h: number },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const res = await fetchImpl('/api/sketches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: trimmed, size }),
  });
  const body = (await res.json()) as Sketch & { error?: string };
  if (body.error) {
    setState({ message: body.error });
    return;
  }
  setState({ activeSketch: body, savedSketch: deepCloneSketch(body), selectedElementId: null, scrapBin: [], message: null });
  await loadSketches(fetchImpl);
}

export async function openSketch(id: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`/api/sketches/${id}`);
  const body = (await res.json()) as Sketch & { error?: string };
  if (body.error) {
    setState({ message: body.error });
    return;
  }
  setState({ activeSketch: body, savedSketch: deepCloneSketch(body), selectedElementId: null, scrapBin: [], message: null });
}

export function setPaletteTool(tool: PaletteTool): void {
  setState({ tool });
}

/** Drops a new element of the current palette tool at (x, y), SNAPPED to `grid` (the
 * surveyed 4px space gauge, or whatever the app's smallest one measures). */
export function addElement(x: number, y: number, grid: number = DEFAULT_GRID): SketchElement | undefined {
  const sketch = state.activeSketch;
  if (!sketch) return undefined;
  const element = newElement(nextElementId(), state.tool, x, y, grid);
  setState({
    activeSketch: { ...sketch, elements: [...sketch.elements, element] },
    selectedElementId: element.id,
  });
  return element;
}

export function selectElement(id: string | null): void {
  setState({ selectedElementId: id });
}

export function moveElement(id: string, x: number, y: number, grid: number = DEFAULT_GRID): void {
  const sketch = state.activeSketch;
  if (!sketch) return;
  setState({
    activeSketch: {
      ...sketch,
      elements: sketch.elements.map((e) => (e.id === id ? { ...e, x: snap(x, grid), y: snap(y, grid) } : e)),
    },
  });
}

export function resizeElement(id: string, w: number, h: number, grid: number = DEFAULT_GRID): void {
  const sketch = state.activeSketch;
  if (!sketch) return;
  setState({
    activeSketch: {
      ...sketch,
      elements: sketch.elements.map((e) =>
        e.id === id ? { ...e, w: Math.max(grid, snap(w, grid)), h: Math.max(grid, snap(h, grid)) } : e,
      ),
    },
  });
}

/** Sets one gauge slot on an element — always to a surveyed gauge NAME (the properties
 * column's picker only ever offers names it read off the Gauges panel; nothing here accepts
 * a raw value). */
export function setElementGauge(id: string, slot: string, gaugeName: string): void {
  const sketch = state.activeSketch;
  if (!sketch) return;
  setState({
    activeSketch: {
      ...sketch,
      elements: sketch.elements.map((e) => (e.id === id ? { ...e, gauges: { ...e.gauges, [slot]: gaugeName } } : e)),
    },
  });
}

export function setElementText(id: string, patch: Partial<Pick<SketchElement, 'label' | 'content'>>): void {
  const sketch = state.activeSketch;
  if (!sketch) return;
  setState({
    activeSketch: {
      ...sketch,
      elements: sketch.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as SketchElement) : e)),
    },
  });
}

/** `Delete` — scraps the selected element into this session's own scrap list (Law II applied
 * to one element), rather than discarding it outright. */
export function scrapSelected(): void {
  const sketch = state.activeSketch;
  const id = state.selectedElementId;
  if (!sketch || !id) return;
  const element = sketch.elements.find((e) => e.id === id);
  if (!element) return;
  setState({
    activeSketch: { ...sketch, elements: sketch.elements.filter((e) => e.id !== id), links: sketch.links.filter((l) => l.fromElementId !== id) },
    scrapBin: [...state.scrapBin, element],
    selectedElementId: null,
  });
}

export function restoreScrapped(elementId: string): void {
  const sketch = state.activeSketch;
  const element = state.scrapBin.find((e) => e.id === elementId);
  if (!sketch || !element) return;
  setState({
    activeSketch: { ...sketch, elements: [...sketch.elements, element] },
    scrapBin: state.scrapBin.filter((e) => e.id !== elementId),
  });
}

/** The link affordance (S9 brief): pick a hotspot element, then a target sketch OR a
 * surveyed route — never both. Replaces any existing link FROM this element (an element is
 * one hotspot, one destination). */
export function setElementLink(fromElementId: string, target: { toSketchId: string } | { toRoute: string }): void {
  const sketch = state.activeSketch;
  if (!sketch) return;
  const link: SketchLink = { fromElementId, ...target };
  setState({
    activeSketch: { ...sketch, links: [...sketch.links.filter((l) => l.fromElementId !== fromElementId), link] },
  });
}

export function clearElementLink(fromElementId: string): void {
  const sketch = state.activeSketch;
  if (!sketch) return;
  setState({ activeSketch: { ...sketch, links: sketch.links.filter((l) => l.fromElementId !== fromElementId) } });
}

export async function save(fetchImpl: typeof fetch = fetch): Promise<void> {
  const sketch = state.activeSketch;
  if (!sketch) return;
  const res = await fetchImpl(`/api/sketches/${sketch.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: sketch.name, size: sketch.size, elements: sketch.elements, links: sketch.links }),
  });
  const body = (await res.json()) as Sketch & { error?: string };
  if (body.error) {
    setState({ message: body.error });
    return;
  }
  setState({ activeSketch: body, savedSketch: deepCloneSketch(body), scrapBin: [], message: null });
  await loadSketches(fetchImpl);
}

/** "`printed` returns the sheet to its saved state" (S9 brief) — discards every unsaved
 * edit (moves, resizes, gauge picks, adds, scraps) by reverting to the last-saved snapshot. */
export function printed(): void {
  if (!state.savedSketch) return;
  setState({ activeSketch: deepCloneSketch(state.savedSketch), scrapBin: [], selectedElementId: null });
}

export async function scrapSketch(id: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`/api/sketches/${id}/scrap`, { method: 'POST' });
  if (state.activeSketch?.id === id) setState({ activeSketch: null, savedSketch: null, selectedElementId: null, scrapBin: [] });
  await loadSketches(fetchImpl);
}

export async function restoreSketch(id: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`/api/sketches/${id}/restore`, { method: 'POST' });
  await loadSketches(fetchImpl);
}

export function useSketchWorkspace(): SketchWorkspaceState {
  return useSyncExternalStore(subscribe, getSketchWorkspaceState, getSketchWorkspaceState);
}
