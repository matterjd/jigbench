import type { Mark, WorkOrderHuman } from '@jigbench/core';
import type { DrafterContext } from '../../seams.js';
import type { OllamaLike } from './ollama.js';

/**
 * A deterministic, network-free stand-in for `OllamaDrafter` (wave-3 council: `http.test.ts`
 * and `http.orders.test.ts` used to boot a real server with no override hook, so every HTTP
 * test that marked/drafted/released a work order genuinely depended on the desk's actual
 * Ollama process — fast when its model was warm, a 20s+ timeout when cold). `createJigServer`'s
 * `drafters.ollama` option accepts anything shaped like `OllamaLike`; this is what tests pass.
 *
 * `available` defaults to `false` — the safest default, matching a desk with no Ollama
 * installed at all: `select-drafter.ts` falls straight to `shop`/`HumanDrafter`, exactly the
 * ladder's normal behaviour, just instantly and with zero network calls. Pass
 * `{ available: true }` when a test specifically wants the `model` driver exercised (still
 * with THIS fake answering, never the real endpoint).
 */
export interface FakeOllamaCall {
  kind: 'available' | 'draft' | 'rewrite';
}

export interface FakeOllamaDrafterOptions {
  available?: boolean;
  /** The fixed human face `draft()` resolves to when selected. Distinctive default values
   * (not the empty strings `HumanDrafter` uses) so a test — or a persisted work order's log
   * — can tell at a glance that THIS stand-in answered, not a real model and not the human
   * fallback either. */
  face?: WorkOrderHuman;
}

export class FakeOllamaDrafter implements OllamaLike {
  /** Unmistakably fake — never the real `qwen2.5-coder:7b` default, so a work order's
   * `draftedBy`/log note naming this model is proof the real Ollama was never consulted. */
  readonly model = 'fake-model';
  /** Every `available()`/`draft()`/`rewrite()` call this stand-in received, oldest first —
   * the spy a test uses to prove it (not the real Ollama) answered, and how many times. */
  readonly calls: FakeOllamaCall[] = [];
  private readonly availableValue: boolean;
  private readonly face: WorkOrderHuman;

  constructor(opts: FakeOllamaDrafterOptions = {}) {
    this.availableValue = opts.available ?? false;
    this.face = opts.face ?? {
      what: 'fake draft',
      why: 'fake reason',
      where: 'fake target',
      acceptance: ['fake acceptance'],
    };
  }

  async available(): Promise<boolean> {
    this.calls.push({ kind: 'available' });
    return this.availableValue;
  }

  async draft(_mark: Mark, _context: DrafterContext): Promise<WorkOrderHuman> {
    this.calls.push({ kind: 'draft' });
    return this.face;
  }

  /** Echoes `text` back unmodified — `service.ts`'s release-time polish pass treats
   * whatever comes back as advisory prose; there is nothing to polish here. */
  async rewrite(text: string, _instruction: string): Promise<string> {
    this.calls.push({ kind: 'rewrite' });
    return text;
  }
}
