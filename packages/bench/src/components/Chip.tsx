import type { ReactNode } from 'react';
import './Chip.css';

export type ChipTone = 'neutral' | 'ok' | 'warn' | 'alert' | 'wyrd';

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
