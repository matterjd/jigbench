import type { ReactNode } from 'react';
import './Chip.css';

// 'storm' added by S7 for the fixtures panel's "loaded" chip — tokens.css's --storm is
// documented as exactly this signal ("live/right-now signals"); additive, no existing tone
// renamed or removed.
export type ChipTone = 'neutral' | 'ok' | 'warn' | 'alert' | 'wyrd' | 'storm';

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  /** A short glyph (single character/symbol) shown before the label. Required whenever the
   * chip's text renders under 11px — a sub-11px label must pair with a non-text signal, per
   * the design floor. */
  glyph?: string;
}

export function Chip({ children, tone = 'neutral', glyph }: ChipProps) {
  return (
    <span className={`jig-chip jig-chip--${tone}`}>
      {glyph && (
        <span aria-hidden="true" className="jig-chip__glyph">
          {glyph}
        </span>
      )}
      {children}
    </span>
  );
}
