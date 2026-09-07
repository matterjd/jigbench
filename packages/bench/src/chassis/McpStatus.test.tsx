import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { McpStatus } from './McpStatus.js';

afterEach(() => cleanup());

describe('McpStatus — the secondary door (AMENDMENT-1 A1, Advanced only)', () => {
  it('says none connected honestly when nothing has attached', () => {
    render(<McpStatus shop={null} />);
    expect(screen.getByText(/none connected/i)).toBeTruthy();
  });

  it('names the connected client when the shop reports one', () => {
    render(<McpStatus shop={{ client: 'Claude Desktop', connectedAt: '2026-09-07T00:00:00.000Z' }} />);
    expect(screen.getByText(/connected · Claude Desktop/i)).toBeTruthy();
  });

  it('says Build runs Claude Code itself; MCP stays the secondary door', () => {
    render(<McpStatus shop={null} />);
    expect(screen.getByText((_, el) => !!el?.textContent?.match(/Build runs Claude Code itself/i) && el.tagName === 'P')).toBeTruthy();
  });
});
