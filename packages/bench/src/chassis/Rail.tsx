import { useEffect, useState, type ReactNode } from 'react';
import { setTool, useTool, type Tool } from '../tools/toolState.js';
import { Pairing } from '../components/Pairing.js';
import { useAdvanced } from './advancedState.js';
import './Rail.css';

/** One `jig:mode` message the rail may post to the plate (usePlateBridge's LoupeMode). */
export interface PlateModeMessage {
  type: 'jig:mode';
  mode: 'hand' | 'loupe';
}

export interface RailProps {
  /** Posts a message to the plate iframe — the app's own `usePlateBridge.postToPlate`, or a
   * test double. Point puts the plate in loupe mode (it carries the old loupe's hover and the
   * old mark's click, now opening the prompt card instead of a numbered pin); Hand returns it
   * to hand; Sketch leaves the plate's mode alone (docs/team/v0.2/CHASSIS.md §2). */
  postToPlate?: (message: PlateModeMessage) => void;
}

interface ToolDef {
  tool: Tool;
  word: string;
  pair: string;
  key: string;
  icon: ReactNode;
}

// Concept D's rail: Point · Sketch · Hand, in that order, plus the Advanced switch at the foot.
// Shortcuts are P/S/H (the built spec's own worked keyboard section, confirmed live by the floor
// pass at :1389 — see CHASSIS.md v0.2 §4 for why this overrides the slice header's "V/S/H").
const TOOLS: ToolDef[] = [
  {
    tool: 'point',
    word: 'Point',
    pair: 'click a component to open the prompt card',
    key: 'P',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3l14 8-6.2 1.6L9.6 19z" />
        <path d="M13.5 13.5L19 19" />
      </svg>
    ),
  },
  {
    tool: 'sketch',
    word: 'Sketch',
    pair: 'a screen that does not exist yet, drawn with the app\'s gauges; the sheet is a prompt target',
    key: 'S',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" strokeDasharray="3 2" />
        <path d="M7 9h6M7 12.5h10M7 16h4" />
      </svg>
    ),
  },
  {
    tool: 'hand',
    word: 'Hand',
    pair: 'the app takes your clicks; drag scrolls the plate',
    key: 'H',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 6a1.5 1.5 0 0 1 3 0v6M14 7.5a1.5 1.5 0 0 1 3 0V12M17 10a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-2.5a6 6 0 0 1-4.7-2.3L3.5 15a1.6 1.6 0 0 1 2.4-2.1L8 15" />
      </svg>
    ),
  },
];

const SHORTCUT_TO_TOOL: Record<string, Tool> = {
  p: 'point',
  s: 'sketch',
  h: 'hand',
};

function plateModeFor(tool: Tool): 'hand' | 'loupe' | null {
  if (tool === 'hand') return 'hand';
  if (tool === 'point') return 'loupe';
  return null; // Sketch leaves the plate's mode alone.
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

/** The tool rail — "Point · Sketch · Hand" (AMENDMENT-1 §4, A3). One active tool at a time
 * (module-level `toolState`, shared with the palette and anything else that needs to know),
 * `Esc` back to Hand from anywhere, and P/S/H shortcuts (ignored while a text field has focus).
 * Selecting Point puts the plate in loupe mode; selecting Hand returns it to hand — Sketch
 * doesn't touch it. The Advanced switch sits at the rail's foot, off by default, persisted for
 * the session (docs/team/v0.2/CHASSIS.md §1). */
export function Rail({ postToPlate }: RailProps) {
  const { tool, setTool: changeTool } = useTool();
  const { advanced, setAdvanced } = useAdvanced();
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);

  function selectTool(next: Tool): void {
    changeTool(next);
    const mode = plateModeFor(next);
    if (mode && postToPlate) postToPlate({ type: 'jig:mode', mode });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setTool('hand');
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const next = SHORTCUT_TO_TOOL[event.key.toLowerCase()];
      if (next) selectTool(next);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postToPlate]);

  return (
    <nav className="jig-rail" aria-label="tools">
      {TOOLS.map((def) => {
        const active = tool === def.tool;
        return (
          <button
            key={def.tool}
            type="button"
            className={'jig-rail__tool' + (active ? ' jig-rail__tool--active' : '')}
            aria-pressed={active}
            aria-label={`${def.word} — ${def.pair}`}
            onClick={() => selectTool(def.tool)}
            onMouseEnter={() => setHoveredWord(def.tool)}
            onMouseLeave={() => setHoveredWord((cur) => (cur === def.tool ? null : cur))}
            onFocus={() => setHoveredWord(def.tool)}
            onBlur={() => setHoveredWord((cur) => (cur === def.tool ? null : cur))}
          >
            {def.icon}
            <span className="jig-rail__key" aria-hidden="true">
              {def.key}
            </span>
            {hoveredWord === def.tool && (
              <span className="jig-rail__tip" role="tooltip">
                <Pairing word={def.word} plain={def.pair} sessionKey={`rail-${def.tool}`} />
              </span>
            )}
          </button>
        );
      })}
      <span className="jig-rail__gap" />
      <label className="jig-rail__advanced" title="rulers and guides, fixtures, toolpath, the mirror, MCP status, the spine, the scrap bin — kept, one switch away">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(event) => setAdvanced(event.target.checked)}
          aria-label="Advanced — everything that is not the loop"
        />
        <span className="jig-rail__sw" aria-hidden="true" />
        <span className="jig-rail__advanced-word">Advanced</span>
      </label>
    </nav>
  );
}
