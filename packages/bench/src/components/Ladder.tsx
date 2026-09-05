import type { LadderState } from '@jigbench/core';
import { Chip } from './Chip.js';
import './Ladder.css';

// Mirrors the order in packages/core/src/ladder.ts's LADDER_STATES — but that is a VALUE
// export, and bench may only import core's TYPES, so the display order is declared here,
// independently. If core's ladder ever reorders, this needs a matching, deliberate edit.
const STEPS: readonly Exclude<LadderState, 'scrapped'>[] = [
  'marked',
  'drafted',
  'released',
  'in-the-shop',
  'trial-fit',
];

export interface LadderProps {
  current: LadderState;
}

export function Ladder({ current }: LadderProps) {
  return (
    <ol className="jig-ladder" aria-label="work-order state ladder">
      {STEPS.map((step) => (
        <li key={step} className={'jig-ladder__step' + (step === current ? ' jig-ladder__step--lit' : '')}>
          {step}
        </li>
      ))}
      {current === 'scrapped' && (
        <li className="jig-ladder__step jig-ladder__step--scrapped">
          <Chip tone="alert" glyph="x">
            scrapped
          </Chip>
        </li>
      )}
    </ol>
  );
}
