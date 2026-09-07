import { buildStreamLine, type BuildStreamEvent, type Prompt, type PromptState } from '@jigbench/core';
import type { PromptsStatus } from './usePrompts.js';
import './PromptsPane.css';

export interface PromptsPaneProps {
  status: PromptsStatus;
  message: string;
  prompts: Prompt[];
  hand: Prompt | null;
  buildStream: BuildStreamEvent[];
  /** Hides the Prompts tab's own Build button while the card is open (AMENDMENT-1 §4: the card
   * is the only place ember appears — never a second demand on the page). */
  cardOpen: boolean;
  onSelect: (id: string) => void;
  onBuild: (id: string) => void;
  onScrap: (id: string) => void;
  onRestore: (id: string) => void;
  onRefine: (prompt: Prompt) => void;
}

const GROUPS: PromptState[] = ['draft', 'ready', 'building', 'built'];

function pipClass(state: PromptState): string {
  if (state === 'ready') return 'jig-prompts-pane__pip jig-prompts-pane__pip--ready';
  if (state === 'building') return 'jig-prompts-pane__pip jig-prompts-pane__pip--building';
  if (state === 'built') return 'jig-prompts-pane__pip jig-prompts-pane__pip--built';
  return 'jig-prompts-pane__pip';
}

function contextText(prompt: Prompt): string {
  const c = prompt.context;
  const lines = [
    `component    ${c.components.map((x) => x.name).join(' · ') || '—'}`,
    `file         ${c.components.map((x) => x.file).join(' · ') || '—'}`,
    `gauges       ${c.gauges.map((g) => g.name).join(' · ') || '—'}`,
    `routes       ${c.routes.map((r) => r.path).join(' · ') || '—'}`,
    `endpoints    ${c.endpoints.map((e) => `${e.method} ${e.path}`).join(' · ') || '—'}`,
    `docs         ${c.docs.map((d) => d.provenance).join(' · ') || '— none matched'}`,
  ];
  return lines.join('\n');
}

function lastBuild(prompt: Prompt) {
  return prompt.builds.length > 0 ? prompt.builds[prompt.builds.length - 1] : undefined;
}

/** The built line's one sentence — the last build's file count, in words. */
function builtWords(prompt: Prompt): string {
  const files = lastBuild(prompt)?.filesTouched.length ?? 0;
  if (files === 0) return 'built · no files touched';
  return `built · ${files} ${files === 1 ? 'file' : 'files'}`;
}

/** "Prompts — the list grouped draft · ready · building · built (+ a collapsed scrapped count
 * with restore), the prompt in hand" (S12 brief). The right column's default tab. */
export function PromptsPane({
  status,
  message,
  prompts,
  hand,
  buildStream,
  cardOpen,
  onSelect,
  onBuild,
  onScrap,
  onRestore,
  onRefine,
}: PromptsPaneProps) {
  if (status === 'loading') {
    return <p className="jig-prompts-pane__empty">reading prompts…</p>;
  }
  if (status === 'unavailable') {
    return <p className="jig-prompts-pane__empty">{message}</p>;
  }

  const live = prompts.filter((p) => p.state !== 'scrapped');
  const scrapped = prompts.filter((p) => p.state === 'scrapped');

  return (
    <div className="jig-prompts-pane">
      {live.length === 0 ? (
        <p className="jig-prompts-pane__empty">
          <b>No prompts yet</b> — Point at the plate and click a component, or Sketch a screen.
        </p>
      ) : (
        GROUPS.map((groupState) => {
          const rows = live.filter((p) => p.state === groupState);
          if (rows.length === 0) return null;
          return (
            <div key={groupState}>
              <div className="jig-prompts-pane__group-head">
                <span>{groupState}</span>
                <span>{rows.length}</span>
              </div>
              {rows.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={'jig-prompts-pane__row' + (hand?.id === p.id ? ' jig-prompts-pane__row--selected' : '')}
                  aria-pressed={hand?.id === p.id}
                  onClick={() => onSelect(p.id)}
                >
                  <span className={pipClass(p.state)} aria-hidden="true" />
                  <span className="jig-prompts-pane__slug">{p.slug || '— no words yet'}</span>
                  <span className="jig-prompts-pane__id">{p.id}</span>
                </button>
              ))}
            </div>
          );
        })
      )}

      {scrapped.length > 0 && (
        <details className="jig-prompts-pane__scrap">
          <summary>{scrapped.length} scrapped · the scrap bin — nothing is deleted</summary>
          {scrapped.map((p) => (
            <div key={p.id} className="jig-prompts-pane__row">
              <span className={pipClass(p.state)} aria-hidden="true" />
              <span className="jig-prompts-pane__slug">{p.slug}</span>
              <button type="button" className="jig-prompts-pane__link" onClick={() => onRestore(p.id)}>
                put back
              </button>
            </div>
          ))}
        </details>
      )}

      {hand && (
        <div className="jig-prompts-pane__hand">
          <div className="jig-prompts-pane__hand-head">
            <span className="jig-prompts-pane__id">{hand.id}</span>
            <span>{hand.state}</span>
          </div>
          <p className="jig-prompts-pane__req">{hand.requirement || <span className="jig-inspect__empty-inline">— no words yet; the card is waiting</span>}</p>
          {hand.acceptance.length > 0 && (
            <ul className="jig-prompts-pane__acc-list">
              {hand.acceptance.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          <div className="jig-prompts-pane__ctx">
            <span className="jig-prompts-pane__ctx-title">context Jig appends</span>
            <pre>{contextText(hand)}</pre>
          </div>
          {(hand.state === 'building' || hand.state === 'built') && buildStream.length > 0 && (
            <div className="jig-prompts-pane__stream">
              {buildStream.map((event, i) => (
                <div key={i}>{buildStreamLine(event)}</div>
              ))}
            </div>
          )}
          {hand.state === 'built' && (
            <div className="jig-prompts-pane__built-line">
              {/* #8: the "before" switch S12 shipped here was a no-op (no snapshot is kept at
                  Ready for a Prompt yet). What IS known about the build — the files Claude
                  touched — is said instead; a control that answers nothing is a floor item. */}
              <span className="jig-prompts-pane__built-word">{builtWords(hand)}</span>
              {lastBuild(hand)?.filesTouched.length ? (
                <ul className="jig-prompts-pane__files">
                  {lastBuild(hand)!.filesTouched.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              ) : null}
              <button type="button" className="jig-prompts-pane__link" onClick={() => onRefine(hand)}>
                refine — go again
              </button>
            </div>
          )}
          <div className="jig-prompts-pane__actions">
            {(hand.state === 'draft' || hand.state === 'ready') && (
              <button type="button" className="jig-prompts-pane__link" onClick={() => onScrap(hand.id)}>
                scrap
              </button>
            )}
            {hand.state === 'ready' && !cardOpen && (
              <button type="button" className="jig-prompts-pane__build" onClick={() => onBuild(hand.id)}>
                Build · runs Claude Code
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
