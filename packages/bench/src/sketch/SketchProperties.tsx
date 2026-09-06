import { useState } from 'react';
import type { Gauge, GaugeCategory, Sketch, SketchElement, SketchSummary } from '@jigbench/core';
import {
  clearElementLink,
  restoreScrapped,
  setElementLink,
  setElementGauge,
  setElementText,
  useSketchWorkspace,
} from './sketchWorkspace.js';
import './SketchProperties.css';

export interface SketchPropertiesProps {
  /** The survey's gauge set — the picker's only source of options; nothing here ever accepts
   * a raw value. */
  gauges?: readonly Gauge[];
  /** Override points for isolated tests — omit any of these in production and the component
   * reads the shared `sketchWorkspace` store instead (the same store `SketchSheet` reads),
   * since App.tsx mounts the sheet and this properties tab as two independent siblings with
   * no prop bridge between them. */
  sketches?: SketchSummary[];
  loaded?: boolean;
  activeSketch?: Sketch | null;
  selectedElementId?: string | null;
  scrapBin?: SketchElement[];
}

/** Which gauge CATEGORY a slot's picker is restricted to — "populated from the Gauges
 * panel's categories" (S9 brief): a fill/label colour, a radius, a shadow, a type. */
const SLOT_CATEGORY: Record<string, GaugeCategory> = {
  fill: 'colour',
  radius: 'radius',
  shadow: 'shadow',
  type: 'type',
};

function slotsForKind(kind: SketchElement['kind']): string[] {
  switch (kind) {
    case 'box':
      return ['fill', 'radius', 'shadow'];
    case 'button':
      return ['fill'];
    case 'text':
      return ['type'];
    default:
      return [];
  }
}

function GaugePicker({ slot, element, gauges }: { slot: string; element: SketchElement; gauges: readonly Gauge[] }) {
  const category = SLOT_CATEGORY[slot];
  const options = gauges.filter((g) => g.category === category);
  const current = element.gauges?.[slot] ?? '';
  return (
    <label className="jig-sketch-properties__field" key={`${element.id}-${slot}-${current}`}>
      {slot}
      <select
        aria-label={slot}
        defaultValue={current}
        onChange={(e) => setElementGauge(element.id, slot, e.target.value)}
      >
        <option value="">— pick a {category} gauge —</option>
        {options.map((g) => (
          <option key={g.name} value={g.name}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * F9 / CHASSIS.md's Sketch tool — the properties column's own tab (concept-a's
 * `renderSketchPane`): the selected element's gauge slots as pickers populated from the
 * surveyed gauges (never a raw value), the hotspot link affordance, and this session's
 * element-level scrap bin with restore. Honest-empty at every stage: no sketches, a sketch
 * but nothing open, a sketch open but nothing selected.
 */
export function SketchProperties(props: SketchPropertiesProps) {
  const live = useSketchWorkspace();
  const gauges = props.gauges ?? [];
  const sketches = props.sketches ?? live.sketches;
  const loaded = props.loaded ?? live.loaded;
  const activeSketch = props.activeSketch !== undefined ? props.activeSketch : live.activeSketch;
  const selectedElementId = props.selectedElementId !== undefined ? props.selectedElementId : live.selectedElementId;
  const scrapBin = props.scrapBin ?? live.scrapBin;

  const [route, setRoute] = useState('');
  const [targetSketchId, setTargetSketchId] = useState('');

  const selected = activeSketch?.elements.find((e) => e.id === selectedElementId) ?? null;
  const link = activeSketch?.links.find((l) => l.fromElementId === selectedElementId);

  return (
    <div className="jig-sketch-properties">
      {!activeSketch && loaded && sketches.length === 0 && <p className="jig-sketch-properties__empty">no sketches yet.</p>}
      {!activeSketch && sketches.length > 0 && (
        <p className="jig-sketch-properties__empty">pick a sketch on the plate to edit its elements.</p>
      )}

      {activeSketch && (
        <dl className="jig-sketch-properties__kv">
          <dt>sheet</dt>
          <dd className="jig-sketch-properties__mono">{activeSketch.name}</dd>
          <dt>drawn with</dt>
          <dd>the app&rsquo;s gauges — every element snaps to the surveyed grid</dd>
          <dt>hotspots</dt>
          <dd>{activeSketch.links.length}</dd>
          <dt>elements</dt>
          <dd>
            {activeSketch.elements.length} saved · {scrapBin.length} scrapped
          </dd>
        </dl>
      )}

      {activeSketch && !selected && <p className="jig-sketch-properties__empty">pick an element on the sheet to edit its gauges.</p>}

      {activeSketch && selected && (
        <div className="jig-sketch-properties__editor">
          {selected.kind === 'text' && (
            <label className="jig-sketch-properties__field">
              content
              <textarea
                aria-label="content"
                value={selected.content}
                onChange={(e) => setElementText(selected.id, { content: e.target.value })}
              />
            </label>
          )}
          {(selected.kind === 'button' || selected.kind === 'image' || selected.kind === 'input') && (
            <label className="jig-sketch-properties__field">
              label
              <input
                aria-label="label"
                value={selected.label ?? ''}
                placeholder={selected.kind === 'input' ? 'placeholder text' : undefined}
                onChange={(e) => setElementText(selected.id, { label: e.target.value })}
              />
            </label>
          )}

          {slotsForKind(selected.kind).map((slot) => (
            <GaugePicker key={slot} slot={slot} element={selected} gauges={gauges} />
          ))}

          <div className="jig-sketch-properties__links">
            {link ? (
              <p>
                links to {link.toRoute ?? `sketch ${link.toSketchId}`}
                <button type="button" onClick={() => clearElementLink(selected.id)}>
                  clear
                </button>
              </p>
            ) : (
              <p className="jig-sketch-properties__empty">not a hotspot yet.</p>
            )}
            <div className="jig-sketch-properties__link-form">
              <input placeholder="/route" value={route} onChange={(e) => setRoute(e.target.value)} />
              <button
                type="button"
                onClick={() => {
                  if (!route.trim()) return;
                  setElementLink(selected.id, { toRoute: route.trim() });
                  setRoute('');
                }}
              >
                link
              </button>
            </div>
            {sketches.length > 0 && (
              <div className="jig-sketch-properties__link-form">
                <select aria-label="link to sketch" value={targetSketchId} onChange={(e) => setTargetSketchId(e.target.value)}>
                  <option value="">— a sketch not yet built —</option>
                  {sketches
                    .filter((s) => s.id !== activeSketch.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!targetSketchId) return;
                    setElementLink(selected.id, { toSketchId: targetSketchId });
                    setTargetSketchId('');
                  }}
                >
                  link
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {scrapBin.length > 0 && (
        <div className="jig-sketch-properties__scrap-bin">
          <p className="jig-sketch-properties__scrap-bin-title">scrap bin</p>
          <ul aria-label="scrapped elements">
            {scrapBin.map((element) => (
              <li key={element.id}>
                <span>{element.kind}</span>
                <button type="button" onClick={() => restoreScrapped(element.id)}>
                  restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
