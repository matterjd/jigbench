import { describe, expect, it } from 'vitest';
import { detectFrameworks, guessDevServer } from './dev-server.js';

describe('guessDevServer', () => {
  it('guesses 5173 for a Vite dev script', () => {
    expect(guessDevServer({ scripts: { dev: 'vite' } })).toBe('http://localhost:5173');
  });

  it('guesses 3000 for a Next dev script', () => {
    expect(guessDevServer({ scripts: { dev: 'next dev' } })).toBe('http://localhost:3000');
  });

  it('guesses 4200 for an Angular ng serve script', () => {
    expect(guessDevServer({ scripts: { start: 'ng serve' } })).toBe('http://localhost:4200');
  });

  it('reads an explicit --port flag literally (worldloom chart-harness shape)', () => {
    expect(
      guessDevServer({ scripts: { serve: 'node serve.mjs --root . --port 8174' } }),
    ).toBe('http://localhost:8174');
  });

  it('an explicit --port flag wins even over a recognizable framework name in the same command', () => {
    expect(guessDevServer({ scripts: { dev: 'vite --port 4321' } })).toBe('http://localhost:4321');
  });

  it('returns undefined when no script matches any known shape', () => {
    expect(guessDevServer({ scripts: { dev: 'node server.js' } })).toBeUndefined();
  });

  it('returns undefined when there are no scripts at all', () => {
    expect(guessDevServer({})).toBeUndefined();
  });

  it('checks dev before start before serve, in that priority order', () => {
    expect(
      guessDevServer({ scripts: { dev: 'vite', start: 'next dev', serve: 'ng serve' } }),
    ).toBe('http://localhost:5173');
  });

  it('falls through to the next script key when an earlier one exists but matches nothing', () => {
    expect(
      guessDevServer({ scripts: { dev: 'node watch.js', start: 'next dev' } }),
    ).toBe('http://localhost:3000');
  });
});

describe('detectFrameworks', () => {
  it('detects react and vite is not itself a framework hint', () => {
    expect(
      detectFrameworks({ dependencies: { react: '^18.3.1' }, devDependencies: { vite: '^5.4.0' } }),
    ).toEqual(['react']);
  });

  it('detects multiple frameworks from dependencies and devDependencies combined', () => {
    expect(
      detectFrameworks({
        dependencies: { next: '^15.0.0', '@angular/core': '^20.0.0' },
        devDependencies: { vue: '^3.5.0' },
      }).sort(),
    ).toEqual(['angular', 'next', 'vue'].sort());
  });

  it('returns an empty array when nothing recognized is present', () => {
    expect(detectFrameworks({ dependencies: { lodash: '^4.0.0' } })).toEqual([]);
  });

  it('recognizes expo and svelte too', () => {
    expect(detectFrameworks({ dependencies: { expo: '~52.0.0', svelte: '^5.0.0' } }).sort()).toEqual(
      ['expo', 'svelte'].sort(),
    );
  });
});
