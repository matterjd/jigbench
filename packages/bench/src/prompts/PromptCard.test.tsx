import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PromptCard } from './PromptCard.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mockRect(el: Element, rect: Partial<DOMRect>): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

function baseProps(overrides: Partial<React.ComponentProps<typeof PromptCard>> = {}) {
  return {
    open: true,
    title: 'InvoiceListComponent',
    file: 'src/app/invoices/invoice-list/invoice-list.component.ts',
    anchorEl: null,
    plateEl: null,
    state: 'none' as const,
    text: '',
    acceptance: [] as string[],
    drafterWired: false,
    polishing: false,
    buildStream: [],
    onTextChange: vi.fn(),
    onAcceptanceChange: vi.fn(),
    onPolish: vi.fn(),
    onReadyComplete: vi.fn(),
    onBuild: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('PromptCard', () => {
  it('renders the target title and file, and an empty-draft foot message', () => {
    render(<PromptCard {...baseProps()} />);
    expect(screen.getByText('InvoiceListComponent')).toBeTruthy();
    expect(screen.getByText('src/app/invoices/invoice-list/invoice-list.component.ts')).toBeTruthy();
    expect(screen.getByText(/a draft is not saved until it has words/i)).toBeTruthy();
  });

  it('calls onTextChange as the requirement textarea is typed', () => {
    const onTextChange = vi.fn();
    render(<PromptCard {...baseProps({ onTextChange })} />);
    fireEvent.change(screen.getByPlaceholderText(/what should change here/i), { target: { value: 'show days overdue' } });
    expect(onTextChange).toHaveBeenCalledWith('show days overdue');
  });

  it('Ready is not the ember act while the draft has no words', () => {
    render(<PromptCard {...baseProps({ text: '' })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    expect(ready.className).not.toMatch(/ember/);
    expect(ready.hasAttribute('disabled')).toBe(true);
  });

  it('Ready becomes the ember act once the draft has words', () => {
    render(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue' })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    expect(ready.className).toMatch(/ember/);
    expect(ready.hasAttribute('disabled')).toBe(false);
  });

  it('holding Ready through the full oath duration calls onReadyComplete', () => {
    vi.useFakeTimers();
    const onReadyComplete = vi.fn();
    render(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue', onReadyComplete })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    act(() => {
      fireEvent.pointerDown(ready);
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(onReadyComplete).toHaveBeenCalledTimes(1);
  });

  it('releasing Ready early shows "let go early — still a draft" and never calls onReadyComplete', () => {
    vi.useFakeTimers();
    const onReadyComplete = vi.fn();
    render(<PromptCard {...baseProps({ state: 'draft', text: 'show days overdue', onReadyComplete })} />);
    const ready = screen.getByRole('button', { name: /Ready/ });
    act(() => fireEvent.pointerDown(ready));
    act(() => vi.advanceTimersByTime(300));
    act(() => fireEvent.pointerUp(ready));
    expect(screen.getByText(/let go early — still a draft/i)).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(onReadyComplete).not.toHaveBeenCalled();
  });

  it('Build is hidden until the prompt is ready, then becomes the ember act (never alongside Ready)', () => {
    const { rerender } = render(<PromptCard {...baseProps({ state: 'draft', text: 'x' })} />);
    expect(screen.queryByRole('button', { name: /^Build/ })).toBeNull();

    rerender(<PromptCard {...baseProps({ state: 'ready', text: 'x' })} />);
    const build = screen.getByRole('button', { name: /^Build/ });
    expect(build.className).toMatch(/ember/);
    const ready = screen.getByRole('button', { name: /Ready/ });
    expect(ready.className).not.toMatch(/ember/); // only one ember act on the card at a time
  });

  it('clicking Build calls onBuild', () => {
    const onBuild = vi.fn();
    render(<PromptCard {...baseProps({ state: 'ready', text: 'x', onBuild })} />);
    fireEvent.click(screen.getByRole('button', { name: /^Build/ }));
    expect(onBuild).toHaveBeenCalled();
  });

  it('Polish is absent when the drafter is not wired', () => {
    render(<PromptCard {...baseProps({ text: 'x', drafterWired: false })} />);
    expect(screen.queryByRole('button', { name: /Polish/ })).toBeNull();
  });

  it('Polish appears (and is clickable) once the drafter is wired and there are words', () => {
    const onPolish = vi.fn();
    render(<PromptCard {...baseProps({ text: 'x', drafterWired: true, onPolish })} />);
    const polish = screen.getByRole('button', { name: /Polish/ });
    fireEvent.click(polish);
    expect(onPolish).toHaveBeenCalled();
  });

  it('the requirement field is read-only while building or built', () => {
    const { rerender } = render(<PromptCard {...baseProps({ state: 'building', text: 'x' })} />);
    expect((screen.getByPlaceholderText(/what should change here/i) as HTMLTextAreaElement).readOnly).toBe(true);
    rerender(<PromptCard {...baseProps({ state: 'built', text: 'x' })} />);
    expect((screen.getByPlaceholderText(/what should change here/i) as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it('shows the live Claude stream while building', () => {
    render(
      <PromptCard
        {...baseProps({
          state: 'building',
          text: 'x',
          buildStream: [{ kind: 'text', text: 'editing invoice-list.component.html' }],
        })}
      />,
    );
    expect(screen.getByText(/editing invoice-list.component.html/)).toBeTruthy();
  });

  it('the close button calls onClose', () => {
    const onClose = vi.fn();
    render(<PromptCard {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /close the card/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when not open', () => {
    const { container } = render(<PromptCard {...baseProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('anchors beside the selection when there is room, using the anchor/plate rects', () => {
    render(<PromptCard {...baseProps()} />);
    const anchor = document.createElement('div');
    const plate = document.createElement('div');
    document.body.append(anchor, plate);
    mockRect(anchor, { left: 100, top: 100, width: 100, height: 40 });
    mockRect(plate, { left: 0, top: 0, width: 1044, height: 872 });
    cleanup();
    const { container } = render(<PromptCard {...baseProps({ anchorEl: anchor, plateEl: plate })} />);
    const card = container.querySelector('.jig-prompt-card') as HTMLElement;
    expect(card.style.left).toBe((100 + 100 + 12) + 'px'); // r.x + r.w + 12
    expect(card.dataset.where).toBe('beside');
  });

  it('places itself from a precomputed anchorRect + plateSize when given — the real plate is a cross-origin iframe, so there is no live DOM element to measure for a Point-tool pick', () => {
    const { container } = render(
      <PromptCard {...baseProps({ anchorRect: { x: 100, y: 100, w: 100, h: 40 }, plateSize: { w: 1044, h: 872 } })} />,
    );
    const card = container.querySelector('.jig-prompt-card') as HTMLElement;
    expect(card.style.left).toBe((100 + 100 + 12) + 'px');
    expect(card.dataset.where).toBe('beside');
  });

  it('sits over the corner and says so when the selection leaves no room anywhere', () => {
    const anchor = document.createElement('div');
    const plate = document.createElement('div');
    document.body.append(anchor, plate);
    mockRect(anchor, { left: 0, top: 0, width: 1044, height: 872 });
    mockRect(plate, { left: 0, top: 0, width: 1044, height: 872 });
    render(<PromptCard {...baseProps({ anchorEl: anchor, plateEl: plate })} />);
    expect(screen.getByText(/the selection is larger than the room around it/i)).toBeTruthy();
  });
});
