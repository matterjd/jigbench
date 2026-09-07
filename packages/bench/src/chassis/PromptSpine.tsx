import type { Prompt, PromptState } from '@jigbench/core';
import './PromptSpine.css';

export interface PromptSpineProps {
  prompts: Prompt[];
}

const RUNGS: PromptState[] = ['draft', 'ready', 'building', 'built'];

/** "The spine: every prompt on the four-rung ladder, the ready rung ringed in gold" (concept D,
 * Advanced). The Advanced drawer's own record of every live prompt, separate from the Prompts
 * tab's grouped list. */
export function PromptSpine({ prompts }: PromptSpineProps) {
  const live = prompts.filter((p) => p.state !== 'scrapped');
  if (live.length === 0) {
    return <p className="jig-prompt-spine__empty">no prompts yet</p>;
  }
  return (
    <div className="jig-prompt-spine">
      {live.map((p) => {
        const currentIndex = RUNGS.indexOf(p.state);
        return (
          <div key={p.id} className="jig-prompt-spine__card">
            <span className="jig-prompt-spine__id">{p.id}</span>
            <span className="jig-prompt-spine__slug">{p.slug}</span>
            <div className="jig-prompt-spine__ladder">
              {RUNGS.map((rung, i) => {
                const classes = ['jig-prompt-spine__rung'];
                if (i < currentIndex) classes.push('jig-prompt-spine__rung--done');
                if (i === currentIndex) classes.push('jig-prompt-spine__rung--now', `jig-prompt-spine__rung--${rung}`);
                if (rung === 'ready' && currentIndex >= 1) classes.push('jig-prompt-spine__rung--oath');
                return (
                  <div key={rung} className={classes.join(' ')}>
                    <span className="jig-prompt-spine__pip" aria-hidden="true" />
                    <span className="jig-prompt-spine__label">{rung}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
