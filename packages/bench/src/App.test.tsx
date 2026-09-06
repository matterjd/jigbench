import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App.js';
import { setTool } from './tools/toolState.js';

// A minimal fake — App composes the whole chassis with no injection point of its own (unlike
// SimStrip's `fetchImpl` prop), so this is the one place exercising them together needs to
// stub the two things App reaches for globally: the WebSocket useJigState opens, and the
// fetch calls SimStrip/the docs count/the plate poll issue.
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
  docs: 'none' as const,
};

describe('App', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/docs')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) } as Response);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ wiring }) } as Response);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setTool('hand');
  });

  it('renders the rail, the plate, the properties column, the tray, and the bottom bar', () => {
    render(<App />);

    // rail
    expect(screen.getByRole('button', { name: /Hand — move the plate/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Loupe —/ })).toBeTruthy();

    // plate: no /api/plate shape in this fixture's fetch mock, so it degrades to the honest
    // "no target" state rather than an iframe.
    expect(screen.getByText(/Plate — where the app renders/)).toBeTruthy();
    expect(screen.getByText(/No target is set/)).toBeTruthy();

    // properties column: three tabs
    expect(screen.getByRole('tab', { name: /Loupe/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Gauges/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Survey/ })).toBeTruthy();

    // tray: S5's real TrayRegion, mounted with the (empty) work-order list from state — the
    // wave-3 merge replaced S4's "arrives with S5" placeholder with the real component.
    expect(screen.getByText(/No marks yet\./)).toBeTruthy();

    // bottom bar: SimStrip + S5's real ShopLane, also mounted with the (empty) work-order list.
    expect(screen.getByLabelText('sim: what is wired')).toBeTruthy();
    expect(screen.getByLabelText('the shop — connected agents')).toBeTruthy();
    expect(screen.getByText(/none connected/)).toBeTruthy();
  });

  it('the command palette opens on Ctrl+K and lists the rail\'s tools', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('Loupe').length).toBeGreaterThan(0);
  });

  it('integration seam 1: selecting the Fixture tool from the rail shows the Fixture panel', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Fixture —/ }));

    expect(screen.getByRole('tab', { name: /Fixture/ }).getAttribute('aria-selected')).toBe('true');
    // FixturePanel resolves its GET /api/fixtures call (the App-level fetch stub degrades to
    // the shared `{ wiring }` shape, which has no `fixtures`/`active` keys) and renders its
    // own empty state — proof the real S7 component is mounted, not a placeholder.
    expect(await screen.findByText('no fixtures yet.')).toBeTruthy();
  });

  it('switching the tool via the rail is reflected in the Loupe tab\'s mode toggle', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Loupe —/ }));
    // The Properties column defaults to the Loupe tab, whose mode toggle should now read
    // "loupe" as pressed — the rail and the properties column share one source of truth
    // (toolState), not two independent copies.
    const loupeModeButtons = screen.getAllByRole('button', { name: /^Loupe$/ });
    const pressedOne = loupeModeButtons.find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressedOne).toBeTruthy();
  });
});
