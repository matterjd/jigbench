// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlateFrame } from './PlateFrame.js';

afterEach(() => cleanup());

describe('PlateFrame', () => {
  it('says plainly that no target is set, in words — never a spinner', () => {
    render(<PlateFrame status={{ target: null, port: 0, status: 'none', changes: [] }} />);
    expect(screen.getByText(/no target is set/i)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says plainly that the target is unreachable, naming it', () => {
    render(
      <PlateFrame status={{ target: 'http://localhost:4200', port: 4601, status: 'down', changes: [] }} />,
    );
    expect(screen.getByText(/not answering|unreachable/i)).toBeTruthy();
    expect(screen.getByText(/http:\/\/localhost:4200/)).toBeTruthy();
  });

  it('renders the iframe pointed at the plate port when up', () => {
    render(
      <PlateFrame status={{ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }} />,
    );
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toBe('http://localhost:4601/');
  });

  it('forwards a ref to the underlying iframe element', () => {
    const ref = createRef<HTMLIFrameElement>();
    render(
      <PlateFrame ref={ref} status={{ target: 'http://localhost:4200', port: 4601, status: 'up', changes: [] }} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLIFrameElement);
  });
});
