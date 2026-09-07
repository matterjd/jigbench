import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { buildStreamLine } from '@jigbench/core';
import { useLogbook } from './useLogbook.js';

afterEach(() => cleanup());

describe('useLogbook', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useLogbook());
    expect(result.current.entries).toEqual([]);
  });

  it('add() appends a row with an ISO `at`, the actor, the event, the ref and the note', () => {
    const { result } = renderHook(() => useLogbook());
    act(() => result.current.add('human', 'clamped ledger-angular', '/repos/ledger-angular', 'a note'));
    expect(result.current.entries).toHaveLength(1);
    const row = result.current.entries[0]!;
    expect(row).toMatchObject({ actor: 'human', event: 'clamped ledger-angular', ref: '/repos/ledger-angular', note: 'a note' });
    expect(row.at).toBe(new Date(row.at).toISOString()); // an ISO string, round-trippable
  });

  it('add() (and the two note* callbacks) are referentially stable across renders — safe in an effect dep list', () => {
    const { result, rerender } = renderHook(() => useLogbook());
    const { add, noteBuildFrame, noteTargetLog } = result.current;
    act(() => add('bench', 'x', 'y'));
    rerender();
    expect(result.current.add).toBe(add);
    expect(result.current.noteBuildFrame).toBe(noteBuildFrame);
    expect(result.current.noteTargetLog).toBe(noteTargetLog);
  });

  it('noteTargetLog: two identical lines with seq 1 and 2 are two "app" rows, ref "the app"', () => {
    const { result } = renderHook(() => useLogbook());
    act(() => result.current.noteTargetLog({ line: 'ng serve · compiled', seq: 1 }));
    act(() => result.current.noteTargetLog({ line: 'ng serve · compiled', seq: 2 }));
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]).toMatchObject({ actor: 'app', event: 'ng serve · compiled', ref: 'the app' });
    expect(result.current.entries[1]).toMatchObject({ actor: 'app', event: 'ng serve · compiled', ref: 'the app' });
    expect(result.current.entries[0]!.note).toBeUndefined();
  });

  it('noteTargetLog: the same frame passed twice is one row; null adds nothing', () => {
    const { result } = renderHook(() => useLogbook());
    const frame = { line: 'ng serve · compiled', seq: 1 };
    act(() => result.current.noteTargetLog(null));
    act(() => result.current.noteTargetLog(frame));
    act(() => result.current.noteTargetLog(frame));
    act(() => result.current.noteTargetLog(null));
    expect(result.current.entries).toHaveLength(1);
  });

  it('noteBuildFrame: the same frame object passed twice is one row', () => {
    const { result } = renderHook(() => useLogbook());
    const frame = { id: '0003', event: { kind: 'text', text: 'editing invoice-list.component.html' }, elapsedMs: 1200 };
    act(() => result.current.noteBuildFrame(null));
    act(() => result.current.noteBuildFrame(frame));
    act(() => result.current.noteBuildFrame(frame));
    expect(result.current.entries).toHaveLength(1);
  });

  it('noteBuildFrame: a new frame object with the same content is a second row', () => {
    const { result } = renderHook(() => useLogbook());
    act(() => result.current.noteBuildFrame({ id: '0003', event: { kind: 'tool_result', ok: true }, elapsedMs: 1000 }));
    act(() => result.current.noteBuildFrame({ id: '0003', event: { kind: 'tool_result', ok: true }, elapsedMs: 1000 }));
    expect(result.current.entries).toHaveLength(2);
  });

  it('noteBuildFrame: the Claude row says buildStreamLine(event), ref is the prompt id, note is mm:ss (1200ms → "00:01")', () => {
    const { result } = renderHook(() => useLogbook());
    const event = { kind: 'tool' as const, name: 'Edit', target: 'invoice-list.component.html' };
    act(() => result.current.noteBuildFrame({ id: '0003', event, elapsedMs: 1200 }));
    expect(result.current.entries[0]).toMatchObject({
      actor: 'Claude',
      event: buildStreamLine(event),
      ref: '0003',
      note: '00:01',
    });
    expect(result.current.entries[0]!.event).toBe('Edit · invoice-list.component.html');
  });

  it('noteBuildFrame: mm:ss pads minutes and seconds (62_000ms → "01:02")', () => {
    const { result } = renderHook(() => useLogbook());
    act(() => result.current.noteBuildFrame({ id: '0004', event: { kind: 'text', text: 'done' }, elapsedMs: 62_000 }));
    expect(result.current.entries[0]!.note).toBe('01:02');
  });

  it('noteBuildFrame: an event without a string `kind` is logged as its JSON, never thrown on', () => {
    const { result } = renderHook(() => useLogbook());
    act(() => result.current.noteBuildFrame({ id: '0003', event: { odd: 'shape', n: 1 }, elapsedMs: 0 }));
    act(() => result.current.noteBuildFrame({ id: '0003', event: 'just a string', elapsedMs: 0 }));
    expect(result.current.entries[0]!.event).toBe(JSON.stringify({ odd: 'shape', n: 1 }));
    expect(result.current.entries[1]!.event).toBe(JSON.stringify('just a string'));
  });

  it('keeps the last 500 rows — the 501st add drops the oldest', () => {
    const { result } = renderHook(() => useLogbook());
    act(() => {
      for (let i = 0; i < 501; i++) result.current.add('bench', `row ${i}`, 'r');
    });
    expect(result.current.entries).toHaveLength(500);
    expect(result.current.entries[0]!.event).toBe('row 1');
    expect(result.current.entries[499]!.event).toBe('row 500');
  });
});
