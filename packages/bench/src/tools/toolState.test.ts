import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { getTool, setTool, useTool } from './toolState.js';

afterEach(() => {
  cleanup();
  setTool('point');
});

describe('toolState', () => {
  it('defaults to point (concept D: Point is the rail\'s first, initially-active tool)', () => {
    expect(getTool()).toBe('point');
  });

  it('setTool updates the module-level current tool and every subscriber sees it', () => {
    const { result } = renderHook(() => useTool());
    expect(result.current.tool).toBe('point');

    act(() => setTool('hand'));

    expect(getTool()).toBe('hand');
    expect(result.current.tool).toBe('hand');
  });

  it('setTool to the same tool is a no-op — no listener notification fires', () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useTool();
    });
    const before = renders;

    act(() => setTool('point')); // already 'point' — must not notify

    expect(renders).toBe(before);
  });

  it("the hook's setTool is the same module function — calling it moves every hook instance", () => {
    const a = renderHook(() => useTool());
    const b = renderHook(() => useTool());

    act(() => a.result.current.setTool('sketch'));

    expect(getTool()).toBe('sketch');
    expect(a.result.current.tool).toBe('sketch');
    expect(b.result.current.tool).toBe('sketch');
  });

  it('every declared tool is assignable and readable back — exactly point, sketch, hand (S12: Loupe/Mark folded into Point; Fixture/Toolpath are Advanced-drawer panels, not rail tools)', () => {
    const tools = ['point', 'sketch', 'hand'] as const;
    for (const t of tools) {
      act(() => setTool(t));
      expect(getTool()).toBe(t);
    }
  });
});
