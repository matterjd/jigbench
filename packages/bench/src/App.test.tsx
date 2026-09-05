import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './App.js';

// A minimal fake — App composes AppFrame, Panel, SimStrip, Ladder, and Logbook with no
// injection point of its own (unlike SimStrip's `fetchImpl` prop), so this is the one place
// exercising them together needs to stub the two things App reaches for globally: the
// WebSocket useJigState opens, and the fetch SimStrip issues.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const wiring = {
  survey: 'stub' as const,
  proxy: 'none' as const,
  drafter: 'stub' as const,
  shop: 'none' as const,
  fixtures: 'none' as const,
  toolpath: 'none' as const,
  sketch: 'none' as const,
};

describe('App', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ wiring }) } as Response),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders every AppFrame region with a fixture state', () => {
    render(<App />);

    expect(screen.getByText('JIG')).toBeTruthy(); // rail
    expect(screen.getByText(/Plate — where the app renders and is clicked/)).toBeTruthy(); // plate
    expect(screen.getByLabelText('sim: what is wired')).toBeTruthy(); // side: SimStrip
    expect(screen.getByText(/bench socket:/)).toBeTruthy(); // side: connection line
    expect(screen.getByText(/No marks yet/)).toBeTruthy(); // tray (no work orders yet)
    expect(screen.getByText(/logbook — the record of everything/i)).toBeTruthy(); // logbook
  });

  it('renders the connection line with the design-floor-required non-text signal', () => {
    // Floor items 2/3/6 (DESIGN-TEAM.md §6 FLOOR A): load-bearing state is never rendered in
    // --faint alone, and color never carries meaning without a paired glyph.
    render(<App />);
    const connection = screen.getByText(/bench socket:/);
    expect(connection.className).toContain('jig-side__connection--warn'); // not connected yet
    expect(connection.querySelector('.jig-side__connection-dot')).toBeTruthy();
  });
});
