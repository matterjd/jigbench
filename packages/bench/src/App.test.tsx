import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('integration seam (S8): selecting the Toolpath tool from the rail shows the Toolpath panel', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Toolpath —/ }));

    expect(screen.getByRole('tab', { name: /Toolpath/ }).getAttribute('aria-selected')).toBe('true');
    // ToolpathBar resolves its GET /api/toolpaths call (the App-level fetch stub degrades to
    // the shared `{ wiring }` shape, which has no `toolpaths` key) and renders its own honest
    // empty state — proof the real S8 component is mounted, not a placeholder.
    expect(await screen.findByText(/no toolpaths yet/i)).toBeTruthy();
  });

  it('integration seam (S8): the plate stays PlateBench (never the trial-fit mirror) when no order is at trial-fit', () => {
    render(<App />);
    // Same assertion the first test in this file already makes — restated here to name WHY
    // it matters post-S8: TrialFitMirror must never take over the plate slot by default.
    expect(screen.getByText(/Plate — where the app renders/)).toBeTruthy();
    expect(screen.queryByText(/trial fit · not yet/i)).toBeNull();
  });

  it('integration seam (S8): the plate slot swaps to the trial-fit mirror once a real order reaches trial-fit', () => {
    render(<App />);
    const workOrder = {
      jigFormat: 1,
      id: '0007',
      slug: 'rename-the-total-column',
      state: 'trial-fit',
      draftedBy: 'model',
      marks: [],
      human: { what: 'x', why: 'y', where: 'z', acceptance: [] },
      shop: { files: [], patterns: [], tests: [], brief: 'x', trialFit: { summary: 'renamed it', files: [] } },
      log: [],
    };
    const state = {
      survey: { jigFormat: 1, stack: [], components: [], routes: [], endpoints: [], schemas: [], docs: [], generatedAt: 'now' },
      gauges: { jigFormat: 1, gauges: [], generatedAt: 'now' },
      marks: [],
      workOrders: [workOrder],
      wiring,
    };

    act(() => {
      FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'state', state }) });
    });

    // PlateBench's own "no target" text is gone — the mirror's own frame region took over
    // the exact same layout slot.
    expect(screen.queryByText(/Plate — where the app renders/)).toBeNull();
    expect(screen.getByText(/renamed it/i)).toBeTruthy();
  });

  it('integration seam (S8): printed dismissing order A\'s mirror does not suppress a LATER order B reaching trial-fit (found live-driving the real bench, exactly the N=2 case)', () => {
    render(<App />);
    const orderA = {
      jigFormat: 1,
      id: '0001',
      slug: 'a',
      state: 'trial-fit',
      draftedBy: 'person',
      marks: [],
      human: { what: 'x', why: 'y', where: 'z', acceptance: [] },
      shop: { files: [], patterns: [], tests: [], brief: 'x', trialFit: { summary: 'A done', files: [] } },
      log: [],
    };
    const stateWithA = {
      survey: { jigFormat: 1, stack: [], components: [], routes: [], endpoints: [], schemas: [], docs: [], generatedAt: 'now' },
      gauges: { jigFormat: 1, gauges: [], generatedAt: 'now' },
      marks: [],
      workOrders: [orderA],
      wiring,
    };
    act(() => {
      FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'state', state: stateWithA }) });
    });
    expect(screen.getByText(/A done/i)).toBeTruthy(); // mirror showing order A

    fireEvent.click(screen.getByRole('button', { name: /printed/i }));
    expect(screen.getByText(/Plate — where the app renders/)).toBeTruthy(); // back to single frame

    const orderB = { ...orderA, id: '0002', shop: { ...orderA.shop, trialFit: { summary: 'B done', files: [] } } };
    const stateWithBoth = { ...stateWithA, workOrders: [orderA, orderB] };
    act(() => {
      FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'state', state: stateWithBoth }) });
    });

    // Order B is new — its trial-fit must surface even though A's mirror was dismissed.
    expect(screen.getByText(/B done/i)).toBeTruthy();
  });

  it('integration seam (S8): captures the release-moment snapshot once the plate is up and an order is released', async () => {
    // Reconfigures the shared fetch stub so /api/plate reports the primary plate "up" (every
    // other test in this file leaves it "none" on purpose, since they don't need
    // plateOrigin) — useAutoSnapshot only ever fires once plateOrigin is known.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/docs')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) } as Response);
        if (url.includes('/api/plate')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ wiring }) } as Response);
      }),
    );

    render(<App />);
    const iframe = await waitFor(() => {
      const el = document.querySelector('iframe');
      if (!el) throw new Error('no iframe yet');
      return el as HTMLIFrameElement;
    });
    const posted: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: (msg: unknown) => posted.push(msg) } });

    const released = {
      jigFormat: 1,
      id: '0007',
      slug: 'x',
      state: 'released',
      draftedBy: 'person',
      marks: [],
      human: { what: 'x', why: 'y', where: 'z', acceptance: [] },
      log: [],
    };
    const state = {
      survey: { jigFormat: 1, stack: [], components: [], routes: [], endpoints: [], schemas: [], docs: [], generatedAt: 'now' },
      gauges: { jigFormat: 1, gauges: [], generatedAt: 'now' },
      marks: [],
      workOrders: [released],
      wiring,
    };
    act(() => {
      FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'state', state }) });
    });

    await waitFor(() => expect(posted).toContainEqual({ type: 'jig:snapshot' }));
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
