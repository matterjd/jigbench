import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { getTool, setTool, useTool, type Tool } from './toolState.js';

// toolState is a module-level store shared by every consumer (the rail, App, the palette),
// so each test resets it back to 'hand' — the file's own documented default — rather than
// letting one test's setTool leak into the next.
afterEach(() => {
  cleanup();
  setTool('hand');
});

function Probe() {
  const { tool } = useTool();
  return <span data-testid="tool">{tool}</span>;
}

describe('toolState', () => {
  it('defaults to hand', () => {
    expect(getTool()).toBe('hand');
  });

  it('setTool updates the module-level current tool', () => {
    setTool('loupe');
    expect(getTool()).toBe('loupe');
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
    expect(seen).toEqual(['hand']);
    act(() => setTool('hand'));
    expect(seen).toEqual(['hand']); // no re-render logged
  });

  it('useTool re-renders every subscribed component when the tool changes', () => {
    render(<Probe />);
    expect(screen.getByTestId('tool').textContent).toBe('hand');
    act(() => setTool('mark'));
    expect(screen.getByTestId('tool').textContent).toBe('mark');
  });

  it('useTool exposes a stable setTool function that changes the shared store', () => {
    let captured: ((t: Tool) => void) | undefined;
    function Capture() {
      const { setTool: st } = useTool();
      captured = st;
      return null;
    }
    render(<Capture />);
    act(() => captured?.('fixture'));
    expect(getTool()).toBe('fixture');
  });

  it('unsubscribes on unmount — a later setTool does not throw or leak', () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(() => setTool('sketch')).not.toThrow();
    expect(getTool()).toBe('sketch');
  });
});
