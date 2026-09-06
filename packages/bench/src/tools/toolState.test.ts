import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { getTool, setTool, useTool } from './toolState.js';

afterEach(() => {
  cleanup();
  setTool('hand');
});

describe('toolState', () => {
  it('defaults to hand', () => {
    expect(getTool()).toBe('hand');
  });

  it('setTool updates the module-level current tool and every subscriber sees it', () => {
    const { result } = renderHook(() => useTool());
    expect(result.current.tool).toBe('hand');

    act(() => setTool('mark'));

    expect(getTool()).toBe('mark');
    expect(result.current.tool).toBe('mark');
  });

  it('setTool to the same tool is a no-op — no listener notification fires', () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useTool();
    });
    const before = renders;

    act(() => setTool('hand')); // already 'hand' — must not notify

    expect(renders).toBe(before);
  });

  it("the hook's setTool is the same module function — calling it moves every hook instance", () => {
    const a = renderHook(() => useTool());
    const b = renderHook(() => useTool());

    act(() => a.result.current.setTool('loupe'));

    expect(getTool()).toBe('loupe');
    expect(a.result.current.tool).toBe('loupe');
    expect(b.result.current.tool).toBe('loupe');
  });

  it('every declared tool is assignable and readable back', () => {
    const tools = ['hand', 'loupe', 'mark', 'fixture', 'toolpath', 'sketch'] as const;
    for (const t of tools) {
      act(() => setTool(t));
      expect(getTool()).toBe(t);
    }
  });
});
