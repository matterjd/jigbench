import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { getTool, setTool, useTool, type Tool } from './toolState.js';

// toolState is a module-level store shared by every consumer (the rail, App, the palette),
// so each test resets it back to 'point' — the file's own documented default (concept D:
// Point is the rail's initially-active tool) — rather than letting one test's setTool leak
// into the next.
afterEach(() => {
  cleanup();
  setTool('point');
});

function Probe() {
  const { tool } = useTool();
  return <span data-testid="tool">{tool}</span>;
}

describe('toolState', () => {
  it('defaults to point', () => {
    expect(getTool()).toBe('point');
  });

  it('setTool updates the module-level current tool', () => {
    setTool('hand');
    expect(getTool()).toBe('hand');
  });

  it('setTool with the same value is a no-op (does not notify subscribers)', () => {
    const seen: Tool[] = [];
    // useSyncExternalStore only re-renders a subscriber when the snapshot actually changes,
    // so a same-value set should never appear as a second render in the probe below.
    function Watcher() {
      const { tool } = useTool();
      seen.push(tool);
      return null;
    }
    render(<Watcher />);
    expect(seen).toEqual(['point']);
    act(() => setTool('point'));
    expect(seen).toEqual(['point']); // no re-render logged
  });

  it('useTool re-renders every subscribed component when the tool changes', () => {
    render(<Probe />);
    expect(screen.getByTestId('tool').textContent).toBe('point');
    act(() => setTool('hand'));
    expect(screen.getByTestId('tool').textContent).toBe('hand');
  });

  it('useTool exposes a stable setTool function that changes the shared store', () => {
    let captured: ((t: Tool) => void) | undefined;
    function Capture() {
      const { setTool: st } = useTool();
      captured = st;
      return null;
    }
    render(<Capture />);
    act(() => captured?.('sketch'));
    expect(getTool()).toBe('sketch');
  });

  it('unsubscribes on unmount — a later setTool does not throw or leak', () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(() => setTool('sketch')).not.toThrow();
    expect(getTool()).toBe('sketch');
  });
});
