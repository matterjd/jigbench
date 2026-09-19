import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdvancedDrawer } from './AdvancedDrawer.js';
import type { Prompt } from '@jigbench/core';

afterEach(() => cleanup());

function prompt(): Prompt {
  return {
    jigFormat: 1,
    id: '0001',
    slug: 'show-days-overdue',
    state: 'ready',
    requirement: 'x',
    acceptance: [],
    target: { kind: 'element' },
    context: { components: [], files: [], gauges: [], routes: [], endpoints: [], docs: [] },
    builds: [],
    createdAt: 'a',
    updatedAt: 'a',
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof AdvancedDrawer>> = {}) {
  return {
    wiring: null,
    connected: true,
    prompts: [prompt()],
    rulersOn: false,
    onRulersChange: vi.fn(),
    fixturePanel: <div>FIXTURE-PANEL-SLOT</div>,
    toolpathBar: <div>TOOLPATH-BAR-SLOT</div>,
    shop: null,
    scrapCount: 2,
    ...overrides,
  };
}

describe('AdvancedDrawer — everything v0.1 had that is not the loop (AMENDMENT-1 §4)', () => {
  it('houses every named instrument: the spine, rulers/guides switch, Fixtures, Toolpath, MCP status, and the scrap bin count', () => {
    render(<AdvancedDrawer {...baseProps()} />);
    expect(screen.getByText('show-days-overdue')).toBeTruthy(); // the spine
    expect(screen.getByLabelText(/rulers/i)).toBeTruthy();
    expect(screen.getByText('FIXTURE-PANEL-SLOT')).toBeTruthy();
    expect(screen.getByText('TOOLPATH-BAR-SLOT')).toBeTruthy();
    expect(screen.getByText(/none connected/i)).toBeTruthy(); // MCP status
    expect(screen.getByText((_, el) => !!el?.textContent?.match(/scrap bin.*2/i) && el.tagName === 'SPAN')).toBeTruthy();
  });

  it('toggling the rulers switch calls onRulersChange', () => {
    const onRulersChange = vi.fn();
    render(<AdvancedDrawer {...baseProps({ onRulersChange })} />);
    fireEvent.click(screen.getByLabelText(/rulers/i));
    expect(onRulersChange).toHaveBeenCalledWith(true);
  });

  // #8: the S12 mirror switch was a disclosed no-op — a switch that does nothing is a floor
  // item. It is gone until a built Prompt has a before/after to show; the drawer says where
  // the mirror went instead of offering a control that answers nothing.
  it('offers no mirror switch (a control that does nothing is a floor item — #8), and says why in words', () => {
    render(<AdvancedDrawer {...baseProps()} />);
    expect(screen.queryByLabelText(/mirror/i)).toBeNull();
    expect(screen.getByText(/the mirror — before \| after — returns once a built prompt keeps its before/i)).toBeTruthy();
  });
});

/**
 * #23 ruling 3 (Matter, 2026-09-14): "The before controls: ACCEPT PR #14's removal for 0.2.x;
 * a real before stays as roadmap slice S27 in its place."
 *
 * Nothing is BUILT for this ruling. The whole of it is that three durable records stop ruling
 * a control the build does not have: AMENDMENT-1 §3 ("with *before* one click away") and §4
 * ("the mirror" under Advanced), and CHASSIS.md §1 ("Built + before", "the mirror
 * (before|after two plates)"). An annotation no process reads is decoration, so this is the
 * barrier that keeps the pair together: the drawer above proves the control is absent, and
 * these three prove the books SAY it is absent and NAME the slice that returns it. When S27
 * lands, the test above goes red first and this block is the list of what to amend with it.
 */
describe('#23 ruling 3: the books record that the before control is out for 0.2.x, and name S27', () => {
  const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

  function section(relPath: string, from: string, to: string): string {
    const md = readFileSync(join(REPO_ROOT, relPath), 'utf8');
    const start = md.indexOf(from);
    // A heading that moved would otherwise slice an empty string and pass on every assertion
    // below for the wrong reason — an absence is only evidence once the read is proven.
    expect(start, `${relPath}: heading "${from}" not found`).toBeGreaterThanOrEqual(0);
    const rest = md.slice(start);
    const end = rest.indexOf(to, from.length);
    expect(end, `${relPath}: heading "${to}" not found after "${from}"`).toBeGreaterThan(0);
    return rest.slice(0, end);
  }

  const RULED: ReadonlyArray<readonly [string, string, string]> = [
    ['docs/design/AMENDMENT-1-the-simplification.md', '## 3. The tongue, amended', '## 4.'],
    ['docs/design/AMENDMENT-1-the-simplification.md', '## 4. The default view', '## 5.'],
    ['docs/team/v0.2/CHASSIS.md', '## 1. The regions', '## 2.'],
  ];

  it.each(RULED)('%s, section starting "%s", carries the ruling and names S27', (relPath, from, to) => {
    const text = section(relPath, from, to);
    // The control on the slice: every one of these three regions is here BECAUSE it talks
    // about the mirror. A slice that lost that word read the wrong region.
    expect(text.toLowerCase()).toContain('mirror');
    expect(text).toContain('#23 ruling 3');
    expect(text).toContain('S27');
  });
});
