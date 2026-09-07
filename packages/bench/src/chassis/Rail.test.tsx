import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Rail } from './Rail.js';
import { getTool, setTool } from '../tools/toolState.js';
import { getAdvanced, setAdvanced } from './advancedState.js';

afterEach(() => {
  cleanup();
  setTool('point');
  setAdvanced(false);
});

describe('Rail', () => {
  it('renders exactly three tools — Point, Sketch, Hand — as buttons with the plain word in an aria-label', () => {
    render(<Rail />);
    for (const label of [/Point/, /Sketch/, /Hand/]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // Loupe/Mark/Fixture/Toolpath are gone from the rail (folded into Point / moved to Advanced).
    expect(screen.queryByRole('button', { name: /Loupe/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mark/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Fixture/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Toolpath/ })).toBeNull();
  });

  it('Point is active at rest (concept D default)', () => {
    render(<Rail />);
    const point = screen.getByRole('button', { name: /Point/ });
    expect(point.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking a tool sets it active (aria-pressed) and clears the previous one', () => {
    render(<Rail />);
    const sketch = screen.getByRole('button', { name: /Sketch/ });
    const point = screen.getByRole('button', { name: /Point/ });
    fireEvent.click(sketch);
    expect(sketch.getAttribute('aria-pressed')).toBe('true');
    expect(point.getAttribute('aria-pressed')).toBe('false');
    expect(getTool()).toBe('sketch');
  });

  it('shows the plain word pairing on hover', () => {
    render(<Rail />);
    const point = screen.getByRole('button', { name: /Point — click a component to open the prompt card/ });
    fireEvent.mouseEnter(point);
    expect(screen.getByText(/click a component to open the prompt card/)).toBeTruthy();
  });

  it('Esc returns the tool to Hand from anywhere', () => {
    render(<Rail />);
    setTool('sketch');
    expect(getTool()).toBe('sketch');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(getTool()).toBe('hand');
  });

  it('keyboard shortcuts P/S/H switch tools', () => {
    render(<Rail />);
    fireEvent.keyDown(window, { key: 's' });
    expect(getTool()).toBe('sketch');
    fireEvent.keyDown(window, { key: 'H' });
    expect(getTool()).toBe('hand');
    fireEvent.keyDown(window, { key: 'p' });
    expect(getTool()).toBe('point');
  });

  it('shortcuts are ignored while a text field has focus', () => {
    render(
      <div>
        <Rail />
        <input aria-label="somewhere else" />
      </div>,
    );
    const input = screen.getByLabelText('somewhere else');
    input.focus();
    fireEvent.keyDown(input, { key: 's' });
    expect(getTool()).toBe('point');
  });

  it('selecting Point posts jig:mode "loupe" to the plate (Point replaces the old loupe+mark hover/click)', () => {
    const postToPlate = vi.fn();
    setTool('hand');
    render(<Rail postToPlate={postToPlate} />);
    fireEvent.click(screen.getByRole('button', { name: /Point/ }));
    expect(postToPlate).toHaveBeenCalledWith({ type: 'jig:mode', mode: 'loupe' });
  });

  it('selecting Hand posts jig:mode "hand"', () => {
    const postToPlate = vi.fn();
    render(<Rail postToPlate={postToPlate} />);
    fireEvent.click(screen.getByRole('button', { name: /Hand/ }));
    expect(postToPlate).toHaveBeenCalledWith({ type: 'jig:mode', mode: 'hand' });
  });

  it('selecting Sketch does not post a jig:mode message', () => {
    const postToPlate = vi.fn();
    render(<Rail postToPlate={postToPlate} />);
    fireEvent.click(screen.getByRole('button', { name: /Sketch/ }));
    expect(postToPlate).not.toHaveBeenCalled();
  });

  it('renders the Advanced switch at the rail\'s foot, off by default, labelled with the word "Advanced"', () => {
    render(<Rail />);
    const toggle = screen.getByLabelText(/Advanced/);
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Advanced')).toBeTruthy();
  });

  it('flipping the Advanced switch updates the shared advancedState store', () => {
    render(<Rail />);
    const toggle = screen.getByLabelText(/Advanced/) as HTMLInputElement;
    fireEvent.click(toggle);
    expect(getAdvanced()).toBe(true);
    expect(toggle.checked).toBe(true);
  });
});
