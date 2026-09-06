import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tool } from '../tools/toolState.js';
import './CommandPalette.css';

export interface PaletteComponentRef {
  name: string;
  file: string;
  selector: string;
}
export interface PaletteRouteRef {
  path: string;
  component: string;
}
export interface PaletteGaugeRef {
  name: string;
  pair: string;
}
export interface PaletteWorkOrderRef {
  id: string;
  slug: string;
  state: string;
}
export interface PaletteDocsResult {
  file: string;
  heading?: string;
  snippet: string;
}

export interface CommandPaletteProps {
  tools: Array<{ tool: Tool; word: string; pair: string }>;
  components: PaletteComponentRef[];
  routes: PaletteRouteRef[];
  gauges: PaletteGaugeRef[];
  workOrders: PaletteWorkOrderRef[];
  onSelectTool: (tool: Tool) => void;
  onSelectComponent: (component: PaletteComponentRef) => void;
  onSelectRoute: (path: string) => void;
  onSelectGauge: (name: string) => void;
  onSelectWorkOrder: (id: string) => void;
  onPrinted: () => void;
  onDocsQuery: (query: string) => Promise<PaletteDocsResult[]> | PaletteDocsResult[];
}

type ItemKind = 'tool' | 'component' | 'route' | 'gauge' | 'workorder' | 'printed' | 'docs';

interface Item {
  kind: ItemKind;
  key: string;
  label: string;
  pair: string;
  run: () => void;
}

/**
 * "The Halls on Ctrl/⌘+K" (concept-a F14) — the command palette: two moves (Law II.2 / the
 * design floor's two-move rule) — invoke, then type to name a thing. Lists tools, surveyed
 * components, routes, gauges, and work orders; a `docs: <query>` prefix searches the clamped
 * docs (`GET /api/docs?q=`); `printed` resets the bench. A scrim closes on click outside, but
 * the input itself is never blocked — Law III: "nothing blocks a surface it doesn't own."
 */
export function CommandPalette(props: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [docsResults, setDocsResults] = useState<PaletteDocsResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) {
          setOpen(false);
        } else {
          setQuery('');
          setSelected(0);
          setDocsResults([]);
          setOpen(true);
        }
        return;
      }
      if (event.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const trimmed = query.trim();
  const isDocsQuery = trimmed.toLowerCase().startsWith('docs:');
  const docsQueryText = isDocsQuery ? trimmed.slice('docs:'.length).trim() : '';

  useEffect(() => {
    if (!isDocsQuery) {
      setDocsResults([]);
      return;
    }
    let cancelled = false;
    Promise.resolve(props.onDocsQuery(docsQueryText)).then((results) => {
      if (!cancelled) setDocsResults(results);
    });
    return () => {
      cancelled = true;
    };
    // onDocsQuery is expected stable enough for a palette lifetime; re-running on every parent
    // render would refire the search on each keystroke of an unrelated state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocsQuery, docsQueryText]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const items: Item[] = useMemo(() => {
    if (isDocsQuery) {
      return docsResults.map((r, i) => ({
        kind: 'docs' as const,
        key: `docs-${i}`,
        label: r.file + (r.heading ? ' · ' + r.heading : ''),
        pair: r.snippet,
        run: () => {},
      }));
    }
    const list: Item[] = [];
    for (const t of props.tools) {
      list.push({ kind: 'tool', key: `tool-${t.tool}`, label: t.word, pair: t.pair, run: () => props.onSelectTool(t.tool) });
    }
    for (const c of props.components) {
      list.push({ kind: 'component', key: `component-${c.file}`, label: c.name, pair: c.file, run: () => props.onSelectComponent(c) });
    }
    for (const r of props.routes) {
      list.push({ kind: 'route', key: `route-${r.path}`, label: r.path, pair: r.component, run: () => props.onSelectRoute(r.path) });
    }
    for (const g of props.gauges) {
      list.push({ kind: 'gauge', key: `gauge-${g.name}`, label: g.name, pair: g.pair, run: () => props.onSelectGauge(g.name) });
    }
    for (const w of props.workOrders) {
      list.push({
        kind: 'workorder',
        key: `wo-${w.id}`,
        label: `work order ${w.id} · ${w.slug}`,
        pair: w.state,
        run: () => props.onSelectWorkOrder(w.id),
      });
    }
    list.push({ kind: 'printed', key: 'printed', label: 'printed', pair: 'reset the bench to its default view', run: () => props.onPrinted() });
    return list;
    // props is a fresh object every render in the normal case (callbacks + arrays), but the
    // palette only needs the CURRENT values whenever the query/docs results change — recomputing
    // on every parent render is cheap for a list this size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocsQuery, docsResults, props.tools, props.components, props.routes, props.gauges, props.workOrders]);

  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = isDocsQuery
    ? items
    : items.filter((item) => {
        const hay = `${item.label} ${item.pair} ${item.kind}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });

  function close(): void {
    setOpen(false);
  }

  function runItem(item: Item): void {
    item.run();
    close();
  }

  if (!open) return null;

  return (
    <div className="jig-palette-veil" onClick={close}>
      <div
        className="jig-palette"
        role="dialog"
        aria-modal="true"
        aria-label="the Halls"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls="jig-palette-list"
          aria-label="the Halls — search tools, components, routes, gauges, work orders"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelected((s) => Math.min(filtered.length - 1, s + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected((s) => Math.max(0, s - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const item = filtered[selected];
              if (item) runItem(item);
            }
          }}
          placeholder="tools, components, routes, gauges, work orders, docs: <query>"
        />
        <ul id="jig-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="jig-palette__empty">nothing on the shelves for &ldquo;{query}&rdquo;</li>
          ) : (
            filtered.map((item, i) => (
              <li
                key={item.key}
                role="option"
                data-kind={item.kind}
                aria-selected={i === selected}
                className={'jig-palette__item' + (i === selected ? ' jig-palette__item--selected' : '')}
                onMouseEnter={() => setSelected(i)}
                onClick={() => runItem(item)}
              >
                <span className="jig-palette__label">{item.label}</span>
                <span className="jig-palette__pair">{item.pair}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
