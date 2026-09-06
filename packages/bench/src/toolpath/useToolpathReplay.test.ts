// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useToolpathReplay } from './useToolpathReplay.js';
import type { Toolpath } from '@jigbench/core';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

/**
 * F11 / CHASSIS.md's toolpath scrubber: "replay is paced by the recorded offsets with a
 * speed control (0.5x / 1x / 2x)". Uses fake timers throughout — real setTimeout delays would
 * make this suite slow and flaky for no reason.
 */

const toolpath: Toolpath = {
  jigFormat: 1,
  id: '0001',
  name: 'open-and-edit',
  createdAt: '2026-09-05T12:00:00.000Z',
  startUrl: '/invoices',
  steps: [
    { kind: 'click', path: 'app-invoice-list:nth-of-type(1)', at: 0 },
    { kind: 'input', path: 'input:nth-of-type(1)', value: 'INV-1042', at: 500 },
    { kind: 'navigate', path: '/invoices/1042', at: 1000 },
  ],
};

describe('useToolpathReplay', () => {
  it('starts idle, at 1x speed, no current step', () => {
    const { result } = renderHook(() => useToolpathReplay());
    expect(result.current.playing).toBe(false);
    expect(result.current.speed).toBe(1);
    expect(result.current.currentStepIndex).toBe(-1);
  });

  it('play() posts startUrl as jig:navigate immediately, then paces the steps at 1x', () => {
    const { result } = renderHook(() => useToolpathReplay());
    const post = vi.fn();

    act(() => result.current.play(toolpath, post));
    expect(post).toHaveBeenCalledWith({ type: 'jig:navigate', path: '/invoices' });
    expect(result.current.playing).toBe(true);

    act(() => vi.advanceTimersByTime(0));
    expect(post).toHaveBeenCalledWith({ type: 'jig:click', path: 'app-invoice-list:nth-of-type(1)' });
    expect(result.current.currentStepIndex).toBe(0);

    act(() => vi.advanceTimersByTime(500));
    expect(post).toHaveBeenCalledWith({ type: 'jig:fill', fields: [{ path: 'input:nth-of-type(1)', value: 'INV-1042' }] });
    expect(result.current.currentStepIndex).toBe(1);

    act(() => vi.advanceTimersByTime(500));
    expect(post).toHaveBeenCalledWith({ type: 'jig:navigate', path: '/invoices/1042' });
    expect(result.current.currentStepIndex).toBe(2);
    expect(result.current.playing).toBe(false); // last step reached
  });

  it('at 2x speed, every step lands in half the recorded time', () => {
    const { result } = renderHook(() => useToolpathReplay());
    const post = vi.fn();

    act(() => result.current.setSpeed(2));
    act(() => result.current.play(toolpath, post));
    post.mockClear();

    act(() => vi.advanceTimersByTime(250)); // 500ms / 2
    expect(post).toHaveBeenCalledWith({ type: 'jig:fill', fields: [{ path: 'input:nth-of-type(1)', value: 'INV-1042' }] });
  });

  it('at 0.5x speed, every step lands in double the recorded time', () => {
    const { result } = renderHook(() => useToolpathReplay());
    const post = vi.fn();

    act(() => result.current.setSpeed(0.5));
    act(() => result.current.play(toolpath, post));
    post.mockClear();

    act(() => vi.advanceTimersByTime(999)); // just under 1000ms (500 * 2) — the click step (offset 0) has already fired by now
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'jig:fill' }));
    act(() => vi.advanceTimersByTime(1));
    expect(post).toHaveBeenCalledWith({ type: 'jig:fill', fields: [{ path: 'input:nth-of-type(1)', value: 'INV-1042' }] });
  });

  it('stop() ("printed") cancels pending steps and resets to idle', () => {
    const { result } = renderHook(() => useToolpathReplay());
    const post = vi.fn();

    act(() => result.current.play(toolpath, post));
    act(() => vi.advanceTimersByTime(0));
    post.mockClear();

    act(() => result.current.stop());
    expect(result.current.playing).toBe(false);
    expect(result.current.currentStepIndex).toBe(-1);

    act(() => vi.advanceTimersByTime(10_000));
    expect(post).not.toHaveBeenCalled(); // the input/navigate steps never fire
  });

  it('a toolpath with no steps finishes immediately without posting anything but startUrl', () => {
    const { result } = renderHook(() => useToolpathReplay());
    const post = vi.fn();
    const empty: Toolpath = { ...toolpath, steps: [] };

    act(() => result.current.play(empty, post));
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.playing).toBe(false);
  });

  it('a toolpath with no startUrl never posts jig:navigate for it', () => {
    const { result } = renderHook(() => useToolpathReplay());
    const post = vi.fn();
    const { startUrl: _startUrl, ...withoutStartUrl } = toolpath;

    act(() => result.current.play(withoutStartUrl, post));
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'jig:navigate', path: '/invoices' }));
  });
});
