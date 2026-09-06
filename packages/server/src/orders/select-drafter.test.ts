import { describe, expect, it, vi } from 'vitest';
import { OllamaDrafter } from './drafters/ollama.js';
import { AgentDrafter } from './drafters/shop.js';
import { HumanDrafter } from './drafters/human.js';
import { selectDrafter } from './select-drafter.js';

function ollamaThatIs(available: boolean): OllamaDrafter {
  const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
  vi.spyOn(drafter, 'available').mockResolvedValue(available);
  return drafter;
}

describe('selectDrafter', () => {
  it('picks the model first when Ollama is reachable, regardless of the shop', async () => {
    const selection = await selectDrafter({ ollama: ollamaThatIs(true), shop: new AgentDrafter(), shopWired: true });
    expect(selection.driver).toBe('model');
    expect(selection.drafter).toBeInstanceOf(OllamaDrafter);
    expect(selection.model).toBe('qwen2.5-coder:7b');
    expect(selection.reason).toMatch(/qwen2\.5-coder:7b/);
  });

  it('falls to the shop when Ollama is down but an agent is connected', async () => {
    const shop = new AgentDrafter();
    const selection = await selectDrafter({ ollama: ollamaThatIs(false), shop, shopWired: true });
    expect(selection.driver).toBe('shop');
    expect(selection.drafter).toBe(shop);
    expect(selection.reason).toMatch(/agent/i);
  });

  it('falls all the way to human when neither a model nor a connected agent is present', async () => {
    const selection = await selectDrafter({ ollama: ollamaThatIs(false), shop: new AgentDrafter(), shopWired: false });
    expect(selection.driver).toBe('person');
    expect(selection.drafter).toBeInstanceOf(HumanDrafter);
    expect(selection.reason).toMatch(/no local model/i);
  });

  it('never leaves the caller with no drafter at all', async () => {
    const selection = await selectDrafter({ ollama: ollamaThatIs(false), shop: new AgentDrafter(), shopWired: false });
    expect(selection.drafter).toBeTruthy();
    expect(typeof selection.drafter.draft).toBe('function');
  });
});
