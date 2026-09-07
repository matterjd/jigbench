import type { ReactNode } from 'react';
import type { ShopInfo, Wiring } from '@jigbench/core';
import type { Prompt } from '../prompts/types.js';
import { SimStrip } from '../components/SimStrip.js';
import { PromptSpine } from './PromptSpine.js';
import { McpStatus } from './McpStatus.js';
import './AdvancedDrawer.css';

export interface AdvancedDrawerProps {
  wiring: Wiring | null;
  connected: boolean;
  prompts: Prompt[];
  rulersOn: boolean;
  onRulersChange: (on: boolean) => void;
  mirrorOn: boolean;
  onMirrorChange: (on: boolean) => void;
  /** Pre-built by the caller (App.tsx already holds the plate refs Fixture/Toolpath need) —
   * AdvancedDrawer only gives them a slot, keeping this component's own test surface about
   * layout and the switches, not the panels' own internals (already covered by their own
   * test files). */
  fixturePanel: ReactNode;
  toolpathBar: ReactNode;
  shop: ShopInfo | null;
  scrapCount: number;
}

/** "Advanced, switched on: the SIM strip; the spine; rulers & guides; the mirror; the scrap bin
 * count; fixtures; the toolpath; MCP status. Off, and the plate is whole again" (concept D). Kept
 * behind the rail's Advanced switch — everything v0.1 had that is not the loop, one toggle away
 * (AMENDMENT-1 §4). */
export function AdvancedDrawer({
  wiring,
  connected,
  prompts,
  rulersOn,
  onRulersChange,
  mirrorOn,
  onMirrorChange,
  fixturePanel,
  toolpathBar,
  shop,
  scrapCount,
}: AdvancedDrawerProps) {
  return (
    <div className="jig-advanced" aria-label="Advanced">
      <div className="jig-advanced__sim-strip">
        <SimStrip wiring={wiring} connected={connected} />
      </div>
      <div className="jig-advanced__body">
        <section className="jig-advanced__section">
          <span className="jig-advanced__title">the spine — every prompt on the ladder</span>
          <PromptSpine prompts={prompts} />
          <div className="jig-advanced__row">
            <label className="jig-advanced__switch">
              <input type="checkbox" checked={rulersOn} onChange={(e) => onRulersChange(e.target.checked)} aria-label="rulers & guides" />
              rulers &amp; guides
            </label>
            <label className="jig-advanced__switch">
              <input type="checkbox" checked={mirrorOn} onChange={(e) => onMirrorChange(e.target.checked)} aria-label="the mirror — before | after" />
              the mirror — before | after
            </label>
          </div>
          <span className="jig-advanced__say">
            scrap bin · <b>{scrapCount}</b>
            {scrapCount > 0 ? ' · counted, regenerable — nothing is deleted' : ''}
          </span>
        </section>
        <section className="jig-advanced__section">
          <span className="jig-advanced__title">fixtures</span>
          {fixturePanel}
        </section>
        <section className="jig-advanced__section">
          <span className="jig-advanced__title">toolpath</span>
          {toolpathBar}
        </section>
        <section className="jig-advanced__section">
          <span className="jig-advanced__title">MCP — the secondary door</span>
          <McpStatus shop={shop} />
        </section>
      </div>
    </div>
  );
}
