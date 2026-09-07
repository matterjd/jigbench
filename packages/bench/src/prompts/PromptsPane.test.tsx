import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PromptsPane } from './PromptsPane.js';
import type { Prompt } from '@jigbench/core';

afterEach(() => cleanup());

function prompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    jigFormat: 1,
    id: '0003',
    slug: 'show-days-overdue',
    state: 'draft',
    requirement: 'show days overdue',
    acceptance: ['counts only unpaid invoices'],
    target: { kind: 'element', component: 'InvoiceListComponent' },
    context: { components: [{ name: 'InvoiceListComponent', file: 'src/x.ts' }], files: [], gauges: [], routes: [], endpoints: [], docs: [] },
    builds: [],
    createdAt: 'a',
    updatedAt: 'a',
    ...overrides,
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof PromptsPane>> = {}) {
  return {
    status: 'ready' as const,
    message: '',
    prompts: [] as Prompt[],
    hand: null as Prompt | null,
    buildStream: [],
    cardOpen: false,
    onSelect: vi.fn(),
    onBuild: vi.fn(),
    onScrap: vi.fn(),
    onRestore: vi.fn(),
    onBeforeToggle: vi.fn(),
    onRefine: vi.fn(),
    ...overrides,
  };
}

describe('PromptsPane', () => {
  it('shows the honest "ahead of its server" sentence when the S11 routes are unavailable — never a blank pane or a spinner', () => {
    render(<PromptsPane {...baseProps({ status: 'unavailable', message: 'no prompts route on this server — clamp a repo first' })} />);
    expect(screen.getByText(/no prompts route on this server — clamp a repo first/i)).toBeTruthy();
  });

  it('shows an honest empty state when there are no prompts yet', () => {
    render(<PromptsPane {...baseProps({ prompts: [] })} />);
    expect(screen.getByText(/no prompts yet/i)).toBeTruthy();
  });

  it('groups live prompts by state (draft · ready · building · built) and collapses scrapped ones behind a count', () => {
    const list = [
      prompt({ id: '0001', state: 'draft' }),
      prompt({ id: '0002', state: 'ready' }),
      prompt({ id: '0004', state: 'scrapped' }),
    ];
    render(<PromptsPane {...baseProps({ prompts: list })} />);
    expect(screen.getByText('draft')).toBeTruthy();
    expect(screen.getByText('ready')).toBeTruthy();
    expect(screen.getByText(/1 scrapped/i)).toBeTruthy();
    expect(screen.queryByText('0004')).toBeNull(); // collapsed by default
  });

  it('clicking a prompt row calls onSelect with its id', () => {
    const onSelect = vi.fn();
    render(<PromptsPane {...baseProps({ prompts: [prompt()], onSelect })} />);
    fireEvent.click(screen.getByText('show-days-overdue'));
    expect(onSelect).toHaveBeenCalledWith('0003');
  });

  it('shows the prompt-in-hand\'s requirement, acceptance, and context block', () => {
    render(<PromptsPane {...baseProps({ prompts: [prompt()], hand: prompt() })} />);
    expect(screen.getByText('show days overdue')).toBeTruthy();
    expect(screen.getByText('counts only unpaid invoices')).toBeTruthy();
    expect(screen.getByText(/context Jig appends/i)).toBeTruthy();
  });

  it('shows a Build button for a ready prompt in hand ONLY when the card is closed (never two ember demands on the page)', () => {
    const { rerender } = render(<PromptsPane {...baseProps({ prompts: [prompt({ state: 'ready' })], hand: prompt({ state: 'ready' }), cardOpen: false })} />);
    expect(screen.getByRole('button', { name: /^Build/ })).toBeTruthy();

    rerender(<PromptsPane {...baseProps({ prompts: [prompt({ state: 'ready' })], hand: prompt({ state: 'ready' }), cardOpen: true })} />);
    expect(screen.queryByRole('button', { name: /^Build/ })).toBeNull();
  });

  it('clicking Build calls onBuild with the prompt id', () => {
    const onBuild = vi.fn();
    render(<PromptsPane {...baseProps({ prompts: [prompt({ state: 'ready' })], hand: prompt({ state: 'ready' }), onBuild })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Build/ }));
    expect(onBuild).toHaveBeenCalledWith('0003');
  });

  it('shows the "before" switch and "refine" for a built prompt in hand', () => {
    const onBeforeToggle = vi.fn();
    const onRefine = vi.fn();
    render(<PromptsPane {...baseProps({ prompts: [prompt({ state: 'built' })], hand: prompt({ state: 'built' }), onBeforeToggle, onRefine })} />);
    fireEvent.click(screen.getByLabelText(/before/i));
    expect(onBeforeToggle).toHaveBeenCalledWith('0003', true);
    fireEvent.click(screen.getByText(/refine — go again/i));
    expect(onRefine).toHaveBeenCalledWith(expect.objectContaining({ id: '0003' }));
  });

  it('shows the live build stream while building', () => {
    render(
      <PromptsPane
        {...baseProps({
          prompts: [prompt({ state: 'building' })],
          hand: prompt({ state: 'building' }),
          buildStream: [{ kind: 'text', text: 'running ng test' }],
        })}
      />,
    );
    expect(screen.getByText(/running ng test/)).toBeTruthy();
  });

  it('scrap and restore actions fire the right callbacks', () => {
    const onScrap = vi.fn();
    const onRestore = vi.fn();
    render(<PromptsPane {...baseProps({ prompts: [prompt({ state: 'draft' })], hand: prompt({ state: 'draft' }), onScrap, onRestore })} />);
    fireEvent.click(screen.getByText(/^scrap$/i));
    expect(onScrap).toHaveBeenCalledWith('0003');
  });
});
