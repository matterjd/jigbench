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
