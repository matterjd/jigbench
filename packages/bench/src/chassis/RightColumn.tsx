import type { ReactNode } from 'react';
import './RightColumn.css';

export type RightColumnTab = 'prompts' | 'inspect' | 'design';

export interface RightColumnProps {
  activeTab: RightColumnTab;
  onTabChange: (tab: RightColumnTab) => void;
  promptsCount: number;
  prompts: ReactNode;
  inspect: ReactNode;
  design: ReactNode;
}

/** The right column — "Prompts · Inspect · Design system" (AMENDMENT-1 §4, A3). Fixed 340px,
 * no resize handle (unlike v0.1's PropertiesColumn — the built spec gives this column one fixed
 * width at both measured viewports, not a user-resizable one). */
export function RightColumn({ activeTab, onTabChange, promptsCount, prompts, inspect, design }: RightColumnProps) {
  return (
    <aside className="jig-right-column" aria-label="the right column">
      <div className="jig-right-column__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-prompts"
          aria-selected={activeTab === 'prompts'}
          aria-controls="pane-prompts"
          onClick={() => onTabChange('prompts')}
        >
          Prompts <span className="jig-right-column__count">{promptsCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-inspect"
          aria-selected={activeTab === 'inspect'}
          aria-controls="pane-inspect"
          onClick={() => onTabChange('inspect')}
        >
          Inspect
        </button>
        <button
          type="button"
          role="tab"
          id="tab-design"
          aria-selected={activeTab === 'design'}
          aria-controls="pane-design"
          onClick={() => onTabChange('design')}
        >
          Design system
        </button>
      </div>
      <div id="pane-prompts" role="tabpanel" aria-labelledby="tab-prompts" aria-hidden={activeTab !== 'prompts'} className="jig-right-column__pane">
        {prompts}
      </div>
      <div id="pane-inspect" role="tabpanel" aria-labelledby="tab-inspect" aria-hidden={activeTab !== 'inspect'} className="jig-right-column__pane">
        {inspect}
      </div>
      <div id="pane-design" role="tabpanel" aria-labelledby="tab-design" aria-hidden={activeTab !== 'design'} className="jig-right-column__pane">
        {design}
      </div>
    </aside>
  );
}
