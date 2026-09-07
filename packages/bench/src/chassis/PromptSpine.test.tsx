import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PromptSpine } from './PromptSpine.js';
import type { Prompt } from '@jigbench/core';

afterEach(() => cleanup());

function prompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    jigFormat: 1,
    id: '0001',
    slug: 'show-days-overdue',
    state: 'ready',
    requirement: 'x',
    acceptance: [],
    target: { kind: 'element' },
    context: { components: [], files: [], gauges: [], routes: [], endpoints: [], docs: [] },
    builds: [],
    createdAt: 'a',
    updatedAt: 'a',
    ...overrides,
  };
}

describe('PromptSpine — every prompt on its 4-rung ladder (Advanced drawer)', () => {
  it('says so honestly when there are no prompts yet', () => {
    render(<PromptSpine prompts={[]} />);
    expect(screen.getByText(/no prompts yet/i)).toBeTruthy();
  });

  it('renders one card per live prompt with its slug and every rung, marking the current one', () => {
    render(<PromptSpine prompts={[prompt({ id: '0002', state: 'building' })]} />);
    expect(screen.getByText('show-days-overdue')).toBeTruthy();
    for (const rung of ['draft', 'ready', 'building', 'built']) {
      expect(screen.getByText(rung)).toBeTruthy();
    }
  });

  it('excludes scrapped prompts (the scrap bin is a separate, collapsed affordance elsewhere)', () => {
    render(<PromptSpine prompts={[prompt({ id: '0003', state: 'scrapped' })]} />);
    expect(screen.queryByText('show-days-overdue')).toBeNull();
  });
});
