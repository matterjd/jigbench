// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useJigState } from './useJigState.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send() {}

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  // test helpers
  triggerOpen() {
    this.onopen?.();
  }
  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  triggerClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

const state = {
  survey: { jigFormat: 1 as const, stack: [], components: [], routes: [], endpoints: [], schemas: [], docs: [], generatedAt: 'now', stub: true },
  gauges: { jigFormat: 1 as const, gauges: [], generatedAt: 'now' },
  marks: [],
  workOrders: [],
  wiring: {
    survey: 'stub' as const,
    proxy: 'none' as const,
    drafter: 'stub' as const,
    shop: 'none' as const,
    fixtures: 'none' as const,
    toolpath: 'none' as const,
    sketch: 'none' as const,
  },
};

describe('useJigState', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects on mount and reports state once a state message arrives', async () => {
    const { result } = renderHook(() => useJigState());

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current.state).toBeNull();

    act(() => {
      FakeWebSocket.instances[0]!.triggerOpen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      FakeWebSocket.instances[0]!.triggerMessage({ type: 'state', state });
    });
    expect(result.current.state).toEqual(state);
  });

  it('reconnects after the socket closes', async () => {
    renderHook(() => useJigState());
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => {
      FakeWebSocket.instances[0]!.triggerClose();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2);
  });

  it('closes its socket on unmount and stops retrying', async () => {
    const { unmount } = renderHook(() => useJigState());
    const first = FakeWebSocket.instances[0]!;

    unmount();
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
