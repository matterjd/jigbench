import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RightColumn } from './RightColumn.js';

afterEach(() => cleanup());

describe('RightColumn', () => {
  it('renders exactly three tabs — Prompts, Inspect, Design system', () => {
    render(
      <RightColumn
        activeTab="prompts"
        onTabChange={vi.fn()}
        promptsCount={2}
        prompts={<div>prompts pane</div>}
        inspect={<div>inspect pane</div>}
        design={<div>design pane</div>}
      />,
    );
    expect(screen.getByRole('tab', { name: /Prompts/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Inspect/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Design system/ })).toBeTruthy();
  });

  it('shows the prompts count badge on the Prompts tab', () => {
    render(
      <RightColumn activeTab="prompts" onTabChange={vi.fn()} promptsCount={3} prompts={<div />} inspect={<div />} design={<div />} />,
    );
    expect(screen.getByRole('tab', { name: /Prompts/ }).textContent).toContain('3');
  });

  it('shows only the active tab\'s pane content, hiding the others via aria-hidden', () => {
    render(
      <RightColumn
        activeTab="inspect"
        onTabChange={vi.fn()}
        promptsCount={0}
        prompts={<div>PROMPTS-CONTENT</div>}
        inspect={<div>INSPECT-CONTENT</div>}
        design={<div>DESIGN-CONTENT</div>}
      />,
    );
    const inspectTab = screen.getByRole('tab', { name: /Inspect/ });
    expect(inspectTab.getAttribute('aria-selected')).toBe('true');
    const promptsPane = screen.getByText('PROMPTS-CONTENT').closest('[role="tabpanel"]');
    expect(promptsPane?.getAttribute('aria-hidden')).toBe('true');
    const inspectPane = screen.getByText('INSPECT-CONTENT').closest('[role="tabpanel"]');
    expect(inspectPane?.getAttribute('aria-hidden')).toBe('false');
  });

  it('clicking a tab calls onTabChange', () => {
    const onTabChange = vi.fn();
    render(
      <RightColumn activeTab="prompts" onTabChange={onTabChange} promptsCount={0} prompts={<div />} inspect={<div />} design={<div />} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /Design system/ }));
    expect(onTabChange).toHaveBeenCalledWith('design');
  });
});
