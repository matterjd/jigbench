import { afterEach, describe, expect, it, vi } from 'vitest';
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

// The env switch a caller that never touches SelectDrafterInput at all (a plain
// `npm test`/CI run, or the RED/GREEN control for the wave-3-council fix) can still use to
// guarantee zero network probes, regardless of what `ollama.available()` would have said.
describe('selectDrafter — JIG_NO_MODEL', () => {
  afterEach(() => {
    delete process.env.JIG_NO_MODEL;
  });

  it('skips the availability probe entirely and falls straight past the model, even if Ollama would say yes', async () => {
    process.env.JIG_NO_MODEL = '1';
    const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
    const availableSpy = vi.spyOn(drafter, 'available').mockResolvedValue(true);

    const selection = await selectDrafter({ ollama: drafter, shop: new AgentDrafter(), shopWired: false });

    expect(availableSpy).not.toHaveBeenCalled();
    expect(selection.driver).toBe('person');
  });

  it('leaves the probe untouched when unset (control)', async () => {
    delete process.env.JIG_NO_MODEL;
    const drafter = new OllamaDrafter({ model: 'qwen2.5-coder:7b' });
    const availableSpy = vi.spyOn(drafter, 'available').mockResolvedValue(true);

    const selection = await selectDrafter({ ollama: drafter, shop: new AgentDrafter(), shopWired: false });

    expect(availableSpy).toHaveBeenCalledTimes(1);
    expect(selection.driver).toBe('model');
  });
});
