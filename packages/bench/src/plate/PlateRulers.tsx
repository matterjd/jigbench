import { useEffect, useRef } from 'react';
import './PlateRulers.css';

export interface RulerCursor {
  x: number;
  y: number;
}

export interface PlateRulersProps {
  /** The pointer's position over the plate, in the app's own CSS px, or null when the pointer
   * isn't over the plate (or a mode that doesn't track it). Drives the moving cursor tick and
   * its numeric readout on each ruler. */
  cursor: RulerCursor | null;
}

const MINOR_STEP = 8; // app px between minor ticks — the grid's own 2x (4px would smear)
const LABEL_EVERY = 64;
const MID_EVERY = 32;

function drawRuler(canvas: HTMLCanvasElement | null, horizontal: boolean): void {
  if (!canvas) return;
  const box = canvas.parentElement?.getBoundingClientRect();
  if (!box) return;
  const width = Math.round(box.width);
  const height = Math.round(box.height);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  // jsdom (used by the component's own tests) has no real canvas 2D context — getContext
  // returns null there. Every real browser (the live check included) returns one, so drawing
  // is skipped rather than faked in tests; this function's only job under test is "never throw."
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Design floor item 7: colours come from the token file, never a hand-rolled literal at
  // the call site — canvas can't read `var(--line)` directly, so this reads the computed
  // custom property instead of hardcoding a fallback hex. An empty read (no stylesheet
  // loaded yet, or a non-browser test environment) leaves the 2D context's own default
  // rather than substituting a literal.
  const cs = getComputedStyle(document.documentElement);
  const line = cs.getPropertyValue('--line').trim();
  const dim = cs.getPropertyValue('--dim').trim();
  const mono = cs.getPropertyValue('--mono').trim();
  ctx.clearRect(0, 0, width, height);
  if (line) ctx.strokeStyle = line;
  if (dim) ctx.fillStyle = dim;
  ctx.font = `11px ${mono || 'monospace'}`;
  ctx.textBaseline = 'top';

  const len = horizontal ? width : height;
  for (let v = 0; v <= len; v += MINOR_STEP) {
    const major = v % LABEL_EVERY === 0;
    const mid = v % MID_EVERY === 0;
    const tickLen = major ? 10 : mid ? 6 : 3;
    const p = v + 0.5;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(p, height);
      ctx.lineTo(p, height - tickLen);
    } else {
      ctx.moveTo(width, p);
      ctx.lineTo(width - tickLen, p);
    }
    ctx.stroke();
    if (major) {
      if (horizontal) {
        ctx.fillText(String(v), p + 3, 2);
      } else {
        ctx.save();
        ctx.translate(2, p + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.fillText(String(v), 0, 0);
        ctx.restore();
      }
    }
  }
}

/** Top and left rulers reading the plate in the APP's own CSS pixels — "rulers ... in the
 * app's CSS px, reading the iframe's size" (S4 brief; CHASSIS.md's "rulers + guides that snap
 * to the app's own gauge grid"). Storm hairlines only; static except the cursor tick, which
 * tracks the pointer and is gated behind `prefers-reduced-motion` like every other travel. */
export function PlateRulers({ cursor }: PlateRulersProps) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    drawRuler(topRef.current, true);
    drawRuler(leftRef.current, false);
    const onResize = () => {
      drawRuler(topRef.current, true);
      drawRuler(leftRef.current, false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="jig-plate-rulers">
      <div className="jig-plate-rulers__corner" aria-hidden="true">
        px
      </div>
      <div className="jig-plate-rulers__top" aria-hidden="true">
        <canvas ref={topRef} />
        {cursor && (
          <span className="jig-plate-rulers__readout" data-testid="ruler-cursor-x">
            {Math.round(cursor.x)}
          </span>
        )}
      </div>
      <div className="jig-plate-rulers__left" aria-hidden="true">
        <canvas ref={leftRef} />
        {cursor && (
          <span className="jig-plate-rulers__readout" data-testid="ruler-cursor-y">
            {Math.round(cursor.y)}
          </span>
        )}
      </div>
    </div>
  );
}
