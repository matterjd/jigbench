import { useEffect, useRef, useState } from 'react';
import { buildStreamLine, type BuildStreamEvent, type PromptState } from '@jigbench/core';
import { placeCardPosition, type CardPlacementSide, type PlateLocalRect } from './placeCardPosition.js';
import { useReadyHold } from './useReadyHold.js';
import './PromptCard.css';

export interface PromptCardProps {
  open: boolean;
  title: string;
  file?: string;
  /** The selected element the card anchors to — its live rect (relative to `plateEl`) drives
   * placement. Used for a Sketch-tool selection, which lives in the SAME document (no iframe).
   * Ignored when `anchorRect` is given. */
  anchorEl: HTMLElement | null;
  plateEl: HTMLElement | null;
  /** A precomputed plate-local rect + the plate's own size — the path a Point-tool pick uses,
   * since the real plate is a CROSS-ORIGIN iframe: the picked element's rect arrives over
   * postMessage (`PlatePick.rect`, already plate-local per the bridge's contract) and there is
   * no live DOM element in this document to call `getBoundingClientRect` on. Takes priority
   * over `anchorEl`/`plateEl` when present. */
  anchorRect?: PlateLocalRect | null;
  plateSize?: { w: number; h: number };
  /** 'none' — no Prompt exists yet for this target (the card is still a bare draft in memory). */
  state: PromptState | 'none';
  text: string;
  acceptance: string[];
  drafterWired: boolean;
  polishing: boolean;
  buildStream: BuildStreamEvent[];
  builtSummary?: { files: number; durationMs: number };
  onTextChange: (text: string) => void;
  onAcceptanceChange: (lines: string[]) => void;
  onPolish: () => void;
  onReadyComplete: () => void;
  onBuild: () => void;
  onClose: () => void;
}

/**
 * "The prompt card — the loop's one control surface" (AMENDMENT-1 §4). Anchored beside → below →
 * above → the plate's corner (never covering the selection), the only place ember appears, and
 * only one of its two acts is ember at a time: Ready while the draft has words, Build once it's
 * ready. Deliberately decoupled from `usePrompts.ts` — every field is a prop, every action a
 * callback — so the state machine (ember rules, the held gesture, the corner disclosure) is
 * testable without a fetch mock or a live DOM layout engine.
 */
export function PromptCard({
  open,
  title,
  file,
  anchorEl,
  plateEl,
  anchorRect,
  plateSize,
  state,
  text,
  acceptance,
  drafterWired,
  polishing,
  buildStream,
  builtSummary,
  onTextChange,
  onAcceptanceChange,
  onPolish,
  onReadyComplete,
  onBuild,
  onClose,
}: PromptCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ x: number; y: number; where: CardPlacementSide }>({
    x: 8,
    y: 8,
    where: 'beside',
  });
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  useEffect(() => {
    function place(): void {
      if (!cardRef.current) return;
      if (anchorRect && plateSize) {
        // The Point-tool path: a plate-local rect that already arrived over postMessage
        // (there is no live DOM element in THIS document for a cross-origin plate iframe).
        setPlacement(placeCardPosition(anchorRect, plateSize.w, plateSize.h, 340, cardRef.current.offsetHeight));
        return;
      }
      if (!anchorEl || !plateEl) return;
      // The Sketch-tool path: same-document, so a live measurement is meaningful.
      const anchorBox = anchorEl.getBoundingClientRect();
      const plateBox = plateEl.getBoundingClientRect();
      const local = { x: anchorBox.left - plateBox.left, y: anchorBox.top - plateBox.top, w: anchorBox.width, h: anchorBox.height };
      setPlacement(placeCardPosition(local, plateBox.width, plateBox.height, 340, cardRef.current.offsetHeight));
    }
    place();
    if (typeof ResizeObserver !== 'undefined' && cardRef.current) {
      const observer = new ResizeObserver(place);
      observer.observe(cardRef.current);
      window.addEventListener('resize', place);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', place);
      };
    }
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchorEl, plateEl, anchorRect, plateSize, text, acceptance.length, buildStream.length]);

  const draftHasWords = text.trim().length > 0;
  const readyEnabled = state === 'draft' && draftHasWords && !polishing;
  const { holding, handlers } = useReadyHold({
    enabled: readyEnabled,
    onStart: () => setCancelMessage(null),
    onComplete: () => {
      setCancelMessage(null);
      onReadyComplete();
    },
    onCancel: (elapsedMs, totalMs) => {
      setCancelMessage(`let go early — still a draft · ${Math.round(elapsedMs)} ms of ${Math.round(totalMs)}`);
    },
  });

  if (!open) return null;

  const isBuildingOrBuilt = state === 'building' || state === 'built';
  const readyClass =
    'jig-prompt-card__oath' +
    (readyEnabled ? ' jig-prompt-card__oath--ember' : '') +
    (holding ? ' jig-prompt-card__oath--holding' : '');
  const showBuild = state === 'ready';
  const showPolish = drafterWired && !isBuildingOrBuilt;

  let say: string | null = cancelMessage;
  if (!say) {
    if (holding) say = 'hold — the ring fills; let go early and it stays a draft';
    else if (state === 'building') say = 'Claude is building — the words are locked while it runs';
    else if (state === 'built' && builtSummary)
      say = `built · ${builtSummary.files} files · ${(builtSummary.durationMs / 1000).toFixed(0)}s — look at the plate, flip before, or refine`;
    else if (placement.where === 'corner')
      say = 'the selection is larger than the room around it — the card sits over its corner; Esc closes it';
  }

  return (
    <div
      ref={cardRef}
      className="jig-prompt-card"
      role="dialog"
      aria-label="prompt card"
      data-where={placement.where}
      style={{ left: placement.x, top: placement.y }}
    >
      <div className="jig-prompt-card__head">
        <span className="jig-prompt-card__title">{title}</span>
        <button type="button" className="jig-prompt-card__close" aria-label="close the card — the draft stays in Prompts" onClick={onClose}>
          ×
        </button>
      </div>
      {file && <div className="jig-prompt-card__file">{file}</div>}
      <textarea
        placeholder="what should change here?"
        rows={3}
        value={text}
        readOnly={isBuildingOrBuilt}
        onChange={(e) => onTextChange(e.target.value)}
      />
      <div>
        <span className="jig-prompt-card__acc-title">acceptance · optional</span>
        <ul className="jig-prompt-card__acc-list">
          {acceptance.map((line, i) => (
            <li key={i}>
              <input
                type="text"
                value={line}
                readOnly={isBuildingOrBuilt}
                onChange={(e) => {
                  const next = acceptance.slice();
                  next[i] = e.target.value;
                  onAcceptanceChange(next);
                }}
              />
            </li>
          ))}
        </ul>
        {!isBuildingOrBuilt && (
          <button type="button" className="jig-prompt-card__acc-add" onClick={() => onAcceptanceChange([...acceptance, ''])}>
            + add a line
          </button>
        )}
      </div>
      <div className="jig-prompt-card__acts">
        {showPolish && (
          <button
            type="button"
            className="jig-prompt-card__hair"
            disabled={!draftHasWords || polishing}
            onClick={onPolish}
            title="Polish — tighten the words and add acceptance lines · local model"
          >
            Polish
          </button>
        )}
        {!isBuildingOrBuilt && (
          <button
            type="button"
            className={readyClass}
            disabled={!readyEnabled}
            aria-label="Ready — hold to make the draft the prompt Claude will get"
            {...handlers}
          >
            <svg className="jig-prompt-card__ring" viewBox="0 0 18 18" aria-hidden="true">
              <circle className="track" cx="9" cy="9" r="7" />
              <circle className="fill" cx="9" cy="9" r="7" />
            </svg>
            <span>Ready</span>
            <span className="jig-prompt-card__pair">{state === 'ready' ? '· held' : draftHasWords ? '· hold' : '· write the requirement first'}</span>
          </button>
        )}
        {showBuild && (
          <button type="button" className="jig-prompt-card__build jig-prompt-card__build--ember" onClick={onBuild} aria-label="Build — run Claude Code in the repo with this prompt">
            <span>Build</span>
            <span className="jig-prompt-card__pair">· runs Claude Code</span>
          </button>
        )}
      </div>
      {say && <div className="jig-prompt-card__say">{say}</div>}
      {(state === 'building' || state === 'built') && buildStream.length > 0 && (
        <div className="jig-prompt-card__stream">
          <div className="jig-prompt-card__stream-head">
            <span>Claude</span>
          </div>
          <ol>
            {buildStream.map((event, i) => (
              <li key={i}>{buildStreamLine(event)}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="jig-prompt-card__foot">
        {draftHasWords ? `${state === 'none' ? 'draft' : state}` : 'a draft is not saved until it has words'}
      </div>
    </div>
  );
}
