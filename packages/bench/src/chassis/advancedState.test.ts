import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { getAdvanced, setAdvanced, useAdvanced, ADVANCED_SESSION_KEY } from './advancedState.js';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  setAdvanced(false);
  sessionStorage.clear();
});

describe('advancedState', () => {
  it('defaults to off', () => {
    expect(getAdvanced()).toBe(false);
  });

  it('setAdvanced(true) flips the module store and every subscriber sees it', () => {
    const { result } = renderHook(() => useAdvanced());
    expect(result.current.advanced).toBe(false);

    act(() => setAdvanced(true));

    expect(getAdvanced()).toBe(true);
    expect(result.current.advanced).toBe(true);
  });

  it('setAdvanced to the same value is a no-op — no listener notification fires', () => {
    let renders = 0;
    renderHook(() => {
      renders++;
      return useAdvanced();
    });
    const before = renders;
    act(() => setAdvanced(false)); // already false
    expect(renders).toBe(before);
  });

  it('persists the choice to sessionStorage under a named key', () => {
    setAdvanced(true);
    expect(sessionStorage.getItem(ADVANCED_SESSION_KEY)).toBe('true');
    setAdvanced(false);
    expect(sessionStorage.getItem(ADVANCED_SESSION_KEY)).toBe('false');
  });

  it("the hook's setAdvanced is the same module function — calling it moves every hook instance", () => {
    const a = renderHook(() => useAdvanced());
    const b = renderHook(() => useAdvanced());
    act(() => a.result.current.setAdvanced(true));
    expect(a.result.current.advanced).toBe(true);
    expect(b.result.current.advanced).toBe(true);
  });
});
