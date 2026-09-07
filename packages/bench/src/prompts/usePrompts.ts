// packages/bench/src/prompts/usePrompts.ts — client state for the Prompts tab and the prompt
// card: the list, the prompt in hand, live build-stream accumulation, and the mutators.
//
// Prompts are NOT part of the `/api/state` WS broadcast (S11's `JigStateSchema` carries no
// `prompts` field — only `status.claude`/`wiring.claude` ride along) — so this hook fetches the
// list over REST and reconciles it itself: an optimistic local edit on every action, then a full
// refetch once `claudeStatus` (the caller's `state.status.claude`, from useJigState) reports the
// build this hook is watching has finished, which is the authoritative moment a build's final
// `builds[]` record and `state:'built'` exist. `buildEvent` (useJigState's `lastBuildEvent`) is
// accumulated per prompt id purely for the live stream ribbon — never trusted for prompt state.
import { useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import type { BuildStreamEvent, ClaudeStatus, Prompt } from '@jigbench/core';
import type { CreatePromptInput, PolishResult, PromptEditInput } from './api.js';

export type PromptsStatus = 'loading' | 'unavailable' | 'ready';

export interface BuildEventFrameLike {
  id: string;
  event: unknown;
  elapsedMs: number;
}

export interface UsePromptsOptions {
  fetchImpl?: typeof fetch;
  /** useJigState().lastBuildEvent — the most recent `{type:'build',...}` WS frame. */
  buildEvent?: BuildEventFrameLike | null;
  /** state?.status?.claude from `/api/state` — the authoritative "a build just finished" signal. */
  claudeStatus?: ClaudeStatus;
  /** The clamped repo root (`state.bench.repoRoot`, S17b) — the list is refetched whenever it
   * changes, since a re-clamp swaps the whole `.jig/prompts/` tree underneath the bench. */
  benchKey?: string | null;
}

export interface UsePromptsResult {
  status: PromptsStatus;
  prompts: Prompt[];
  hand: Prompt | null;
  /** message is set only when status === 'unavailable' — the honest sentence for the tab. */
  message: string;
  buildStreams: Record<string, BuildStreamEvent[]>;
  selectHand: (id: string | null) => void;
  refresh: () => Promise<void>;
  create: (input: CreatePromptInput) => Promise<Prompt | null>;
  edit: (id: string, input: PromptEditInput) => Promise<void>;
  ready: (id: string) => Promise<void>;
  polish: (id: string) => Promise<PolishResult | null>;
  build: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  scrap: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
}

const UNAVAILABLE_MESSAGE = 'no prompts route on this server — clamp a repo first';

export function usePrompts(options: UsePromptsOptions = {}): UsePromptsResult {
  const { fetchImpl = fetch, buildEvent, claudeStatus, benchKey } = options;
  const [status, setStatus] = useState<PromptsStatus>('loading');
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [handId, setHandId] = useState<string | null>(null);
  const [buildStreams, setBuildStreams] = useState<Record<string, BuildStreamEvent[]>>({});
  const lastFrameRef = useRef<BuildEventFrameLike | null>(null);
  const settledBuildRef = useRef<string | null>(null); // the last claudeStatus id we already reconciled

  async function refresh(): Promise<void> {
    const result = await api.listPrompts(fetchImpl);
    if (result.ok) {
      setPrompts(result.data);
      setStatus('ready');
    } else {
      setStatus('unavailable');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchKey]);

  // Accumulate a NEW build-event frame (identity-compared, since useJigState hands back the
  // same object reference until the next message arrives) into that prompt's live stream.
  useEffect(() => {
    if (!buildEvent || buildEvent === lastFrameRef.current) return;
    lastFrameRef.current = buildEvent;
    setBuildStreams((prev) => ({
      ...prev,
      [buildEvent.id]: [...(prev[buildEvent.id] ?? []), buildEvent.event as BuildStreamEvent],
    }));
  }, [buildEvent]);

  // Once the server reports THIS build finished (built or reverted to ready on failure),
  // refetch to pick up the authoritative state + builds[] record, and clear the live stream —
  // it has served its purpose once the real record exists.
  useEffect(() => {
    if (!claudeStatus || claudeStatus.state === 'idle') return;
    if (claudeStatus.state !== 'built') return;
    if (settledBuildRef.current === claudeStatus.id) return;
    settledBuildRef.current = claudeStatus.id;
    void refresh().then(() => {
      setBuildStreams((prev) => {
        const next = { ...prev };
        delete next[claudeStatus.id];
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claudeStatus]);

  function patchLocal(id: string, patch: Partial<Prompt>): void {
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  return {
    status,
    prompts,
    hand: prompts.find((p) => p.id === handId) ?? null,
    message: status === 'unavailable' ? UNAVAILABLE_MESSAGE : '',
    buildStreams,
    selectHand: setHandId,
    refresh,
    async create(input) {
      const result = await api.createPrompt(input, fetchImpl);
      if (!result.ok) return null;
      setPrompts((prev) => [...prev, result.data]);
      setHandId(result.data.id);
      return result.data;
    },
    async edit(id, input) {
      const result = await api.patchPrompt(id, input, fetchImpl);
      if (result.ok) patchLocal(id, result.data);
    },
    async ready(id) {
      const result = await api.readyPrompt(id, fetchImpl);
      if (result.ok) patchLocal(id, result.data);
    },
    async polish(id) {
      const result = await api.polishPrompt(id, fetchImpl);
      if (!result.ok) return null;
      patchLocal(id, { requirement: result.data.requirement, acceptance: result.data.acceptance });
      return result.data;
    },
    async build(id) {
      const result = await api.buildPrompt(id, fetchImpl);
      if (result.ok) patchLocal(id, { state: 'building' });
    },
    async cancel(id) {
      const result = await api.cancelBuild(id, fetchImpl);
      if (result.ok) patchLocal(id, { state: 'ready' });
    },
    async scrap(id) {
      const result = await api.scrapPrompt(id, fetchImpl);
      if (result.ok) patchLocal(id, result.data);
    },
    async restore(id) {
      const result = await api.restorePrompt(id, fetchImpl);
      if (result.ok) patchLocal(id, result.data);
    },
  };
}
