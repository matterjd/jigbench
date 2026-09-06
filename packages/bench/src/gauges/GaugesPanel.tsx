import { useEffect, useRef, useState } from 'react';
import type { Component, Gauge, GaugeCategory, Survey } from '@jigbench/core';
import { gaugesForComponent, selectorsForGauge } from './resolveGaugeUsage.js';
import './GaugesPanel.css';

const CATEGORIES: readonly GaugeCategory[] = ['colour', 'type', 'space', 'radius', 'shadow', 'motion', 'z'];
const COLLAPSED_STORAGE_KEY = 'jig-gauges-collapsed';

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(COLLAPSED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveCollapsed(next: Record<string, boolean>): void {
  try {
    sessionStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage can throw (private browsing, quota) — the collapse state just won't
    // survive a remount, which is not worth failing the panel over.
  }
}

function totalUsageCount(gauge: Gauge): number {
  return (gauge.usages ?? []).reduce((sum, u) => sum + u.count, 0);
}

function matchesFilter(gauge: Gauge, needle: string): boolean {
  if (!needle) return true;
  const hay = `${gauge.name} ${String(gauge.$value)}`.toLowerCase();
  return hay.includes(needle.toLowerCase());
}

export interface GaugesPanelProps {
  gauges: readonly Gauge[];
  survey?: Survey;
  /** The component under the loupe right now (resolved by the caller from the last pick) —
   * lights the gauges it uses, visually, without touching the plate (the plate already shows
   * its own outline for the pick itself). */
  pickedComponent?: Component;
  /** Posts `jig:highlight` with the selectors of every component using the clicked gauge. */
  onHighlight: (selectors: string[]) => void;
  /** Posts `jig:clear` — called when a lit gauge is unlit, by click or by `printed`. */
  onClearHighlight: () => void;
}

/** "Gauges are two-way lit" (concept-a F12 / S4 brief): categories · colour · type · space ·
 * radius · shadow · motion · z, collapsible and remembered per session, each gauge showing its
 * value, its token name, and its usage count. Clicking a gauge lights every component that
 * uses it on the plate; clicking a component lights its gauges here. Lit = a storm hairline,
 * never a fill (design floor item 26) — nothing here is ember. */
export function GaugesPanel({ gauges, survey, pickedComponent, onHighlight, onClearHighlight }: GaugesPanelProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadCollapsed());
  const [litGauge, setLitGauge] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => saveCollapsed(collapsed), [collapsed]);

  const pickLit = new Set(gaugesForComponent(pickedComponent, gauges).map((g) => g.name));

  function toggleCategory(category: GaugeCategory): void {
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
  }

  function toggleGauge(gauge: Gauge): void {
    if (litGauge === gauge.name) {
      setLitGauge(null);
      onClearHighlight();
      return;
    }
    setLitGauge(gauge.name);
    onHighlight(selectorsForGauge(gauge, survey?.components ?? []));
  }

  // Finding 7 (wave-3 council, spec medium): CHASSIS.md's floor list is explicit — "every
  // filtered or resized surface has one `printed` affordance" — singular. This panel is ONE
  // surface with two independently-resettable bits of state (the name/value filter, the lit
  // gauge); one `printed` clears both, rather than each bit growing its own.
  function clearAll(): void {
    setFilter('');
    setLitGauge(null);
    onClearHighlight();
    // Wave-4 fix (TEST-RUN.md's first live test, defect 4): "I did click on whats printed
    // and got stuck in that view." `printed` cleared the filter/lit-gauge state but never
    // touched scroll position — the actual scrolling box is the properties column's tab
    // body (PropertiesColumn.css's `.jig-properties__pane`, this panel's parent), not
    // anything inside GaugesPanel itself. Clearing the filter/lit gauge without also
    // scrolling back up left the pane wherever it happened to be scrolled to (often past
    // the now-shorter list, showing nothing) — `printed` has to return the whole surface to
    // its default, scroll position included, and it must never touch the active tab, the
    // tool, or the plate's route (those are the caller's concerns, not this panel's).
    rootRef.current?.closest('.jig-properties__pane')?.scrollTo({ top: 0 });
  }

  const filtered = gauges.filter((g) => matchesFilter(g, filter));
  const anyMatch = filtered.length > 0;

  return (
    <div className="jig-gauges" ref={rootRef}>
      <div className="jig-gauges__filter-row">
        <input
          type="search"
          role="searchbox"
          aria-label="filter gauges"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter by name or value"
        />
      </div>

      {!anyMatch && filter && <p className="jig-gauges__empty">no gauges match &ldquo;{filter}&rdquo;</p>}

      {CATEGORIES.map((category) => {
        const rows = filtered.filter((g) => g.category === category);
        if (rows.length === 0) return null;
        const isCollapsed = Boolean(collapsed[category]);
        return (
          <section key={category} className="jig-gauges__category">
            <button
              type="button"
              className="jig-gauges__category-head"
              aria-expanded={!isCollapsed}
              onClick={() => toggleCategory(category)}
            >
              <span className="jig-gauges__category-name">{category}</span>
              <span className="jig-gauges__category-count">{rows.length}</span>
            </button>
            {!isCollapsed && (
              <ul className="jig-gauges__list">
                {rows.map((gauge) => {
                  const lit = litGauge === gauge.name || pickLit.has(gauge.name);
                  return (
                    <li key={gauge.name}>
                      <button
                        type="button"
                        className={'jig-gauges__row' + (lit ? ' jig-gauges__row--lit' : '')}
                        aria-pressed={lit}
                        onClick={() => toggleGauge(gauge)}
                      >
                        <GaugeSwatch gauge={gauge} />
                        <span className="jig-gauges__name">{gauge.name}</span>
                        <span className="jig-gauges__value">{String(gauge.$value)}</span>
                        <span className="jig-gauges__uses">{totalUsageCount(gauge)}×</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {(filter || litGauge) && (
        <button
          type="button"
          className="jig-gauges__printed jig-gauges__printed--foot"
          onClick={clearAll}
          aria-label="printed — clear the filter and the lit gauge"
        >
          printed
        </button>
      )}
    </div>
  );
}

function GaugeSwatch({ gauge }: { gauge: Gauge }) {
  const value = String(gauge.$value);
  switch (gauge.category) {
    case 'colour':
      return <span className="jig-gauges__swatch" style={{ background: value }} aria-hidden="true" />;
    case 'radius':
      return (
        <span className="jig-gauges__swatch" style={{ borderRadius: value }} aria-hidden="true" />
      );
    case 'shadow':
      return <span className="jig-gauges__swatch" style={{ boxShadow: value }} aria-hidden="true" />;
    case 'space':
      return (
        <span className="jig-gauges__swatch jig-gauges__swatch--bar" style={{ width: value }} aria-hidden="true" />
      );
    case 'motion':
      return (
        <span className="jig-gauges__swatch jig-gauges__swatch--bar" style={{ width: value }} aria-hidden="true" />
      );
    case 'type':
      return (
        <span className="jig-gauges__swatch jig-gauges__swatch--type" aria-hidden="true">
          Aa
        </span>
      );
    case 'z':
    default:
      return (
        <span className="jig-gauges__swatch jig-gauges__swatch--z" aria-hidden="true">
          z
        </span>
      );
  }
}
