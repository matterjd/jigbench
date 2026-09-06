import { useEffect, useState } from 'react';
import { setTool, useTool, type Tool } from '../tools/toolState.js';
import { Pairing } from '../components/Pairing.js';
import './Rail.css';

/** One `jig:mode` message the rail may post to the plate (usePlateBridge's LoupeMode). */
export interface PlateModeMessage {
  type: 'jig:mode';
  mode: 'hand' | 'loupe';
}

export interface RailProps {
  /** Posts a message to the plate iframe — the app's own `usePlateBridge.postToPlate`, or a
   * test double. Loupe and Mark both put the plate in loupe mode (Mark is the loupe with a
   * click S5 turns into a mark); every other tool leaves the plate's mode alone except Hand,
   * which returns it to hand. */
  postToPlate?: (message: PlateModeMessage) => void;
}

interface ToolDef {
  tool: Tool;
  word: string;
  pair: string;
  key: string;
  icon: JSX.Element;
}

// Order mirrors CHASSIS.md: Hand · Loupe · Mark · Fixture · Toolpath · Sketch. Shortcuts are
// V/L/M/F/T/S (V for Hand — the palette documents this; it is not the concept's H).
const TOOLS: ToolDef[] = [
  {
    tool: 'hand',
    word: 'Hand',
    pair: 'move the plate — the app takes your clicks',
    key: 'V',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 6a1.5 1.5 0 0 1 3 0v6M14 7.5a1.5 1.5 0 0 1 3 0V12M17 10a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-2.5a6 6 0 0 1-4.7-2.3L3.5 15a1.6 1.6 0 0 1 2.4-2.1L8 15" />
      </svg>
    ),
  },
  {
    tool: 'loupe',
    word: 'Loupe',
    pair: 'point at anything and see what it is',
    key: 'L',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
      </svg>
    ),
  },
  {
    tool: 'mark',
    word: 'Mark',
    pair: 'a highlighted spot with a request attached',
    key: 'M',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20l3.5-1L19 7.5a2.1 2.1 0 0 0-3-3L4.5 16 4 20z" />
        <path d="M14 6l3 3" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
  {
    tool: 'fixture',
    word: 'Fixture',
    pair: 'a reproducible set of test data',
    key: 'F',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8h16M4 16h16M8 4v16M16 4v16" />
        <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    tool: 'toolpath',
    word: 'Toolpath',
    pair: 'a recorded click sequence, replayable',
    key: 'T',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18c4-10 6-10 8-4s4 6 8-6" />
        <circle cx="4" cy="18" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="20" cy="8" r="1.6" />
      </svg>
    ),
  },
  {
    tool: 'sketch',
    word: 'Sketch',
    pair: 'a screen that does not exist yet',
    key: 'S',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" strokeDasharray="3 2" />
        <path d="M7 9h6M7 12.5h10M7 16h4" />
      </svg>
    ),
  },
];

const SHORTCUT_TO_TOOL: Record<string, Tool> = {
  v: 'hand',
  l: 'loupe',
  m: 'mark',
  f: 'fixture',
  t: 'toolpath',
  s: 'sketch',
};

function plateModeFor(tool: Tool): 'hand' | 'loupe' | null {
  if (tool === 'hand') return 'hand';
  if (tool === 'loupe' || tool === 'mark') return 'loupe';
  return null; // Fixture/Toolpath/Sketch leave the plate's mode alone.
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

/** The tool rail — "Hand · Loupe · Mark · Fixture · Toolpath · Sketch" (CHASSIS.md). One
 * active tool at a time (module-level `toolState`, shared with the palette and anything else
 * that needs to know), `Esc` back to Hand from anywhere, and V/L/M/F/T/S shortcuts (ignored
 * while a text field has focus). Selecting Loupe or Mark puts the plate in loupe mode;
 * selecting Hand returns it to hand — Fixture/Toolpath/Sketch don't touch it (S4 brief). */
export function Rail({ postToPlate }: RailProps) {
  const { tool, setTool: changeTool } = useTool();
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
    </nav>
  );
}
