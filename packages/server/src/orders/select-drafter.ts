import type { Drafter } from '../seams.js';
import type { OllamaLike } from './drafters/ollama.js';
import type { AgentDrafter } from './drafters/shop.js';
import { HumanDrafter } from './drafters/human.js';

export type DrafterDriver = 'model' | 'shop' | 'person';

export interface DrafterSelection {
  drafter: Drafter;
  driver: DrafterDriver;
  /** Why THIS driver, not just which one — logged on the work order and returned to the
   * bench so it can badge the order honestly (commission F7). */
  reason: string;
  model?: string;
}

export interface SelectDrafterInput {
  /** `OllamaLike` (not the concrete `OllamaDrafter`) so a caller — chiefly a test, via
   * `createJigServer`'s `drafters.ollama` override — can inject a deterministic stand-in
   * (`FakeOllamaDrafter`) instead of a real Ollama client (wave-3 council: a unit/HTTP test
   * must never depend on a live model). */
  ollama: OllamaLike;
  shop: AgentDrafter;
  /** `store.getWiring().shop === 'wired'` — always false until S6 lands. */
  shopWired: boolean;
}

/**
 * The drafter order the commission rules (decision 6 / F7, EXECUTION-PLAN.md §4 S5):
 * a local model first, then a connected agent, then a human — always something, never a
 * hard stop. Every selection carries its own reason so `service.ts` can log exactly why
 * this driver was chosen, not just which one answered.
 */
export async function selectDrafter(input: SelectDrafterInput): Promise<DrafterSelection> {
  // `JIG_NO_MODEL=1` skips the probe outright, regardless of what `input.ollama.available()`
  // would have answered — a caller-side guarantee of zero network calls (CI, and the
  // wave-3-council RED/GREEN control), independent of which drafter object was even passed.
  const ollamaUp = process.env.JIG_NO_MODEL === '1' ? false : await input.ollama.available();
  if (ollamaUp) {
    return {
      drafter: input.ollama,
      driver: 'model',
      reason: `${input.ollama.model} is reachable on this desk`,
      model: input.ollama.model,
    };
  }

  if (input.shopWired) {
    return {
      drafter: input.shop,
      driver: 'shop',
      reason: 'a shop agent is connected; no local model reachable',
    };
  }

  return {
    drafter: new HumanDrafter(),
    driver: 'person',
    reason: 'no local model and no connected agent — fill the human face yourself',
  };
}
