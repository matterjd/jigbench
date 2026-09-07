import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runServeCommand, type ServeCommandResult } from './serve.js';

let result: ServeCommandResult | undefined;

afterEach(async () => {
  if (result) {
    await result.close();
    result = undefined;
  }
});

describe('runServeCommand', () => {
  it('ensures .jig/ exists and starts the server, reporting the url and clamped repo', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-'));

    result = await runServeCommand({ repo: repoRoot, port: 0, open: false });

    expect(result.message).toContain('Jig is on the bench');
    expect(result.message).toContain(repoRoot);
    expect(result.url).toMatch(/^http:\/\/localhost:\d+$/);

    const jigDir = await stat(join(repoRoot, '.jig'));
    expect(jigDir.isDirectory()).toBe(true);
  });

  it('says plainly that no target is set when none is given and no angular.json is found', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-'));
    result = await runServeCommand({ repo: repoRoot, port: 0, open: false });
    expect(result.message).toContain('no target set');
  });

  it('starts the plate proxy pointed at an explicit --target and reports its URL', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-'));
    result = await runServeCommand({
      repo: repoRoot,
      port: 0,
      open: false,
      target: 'http://localhost:4200',
      platePort: 0,
    });
    expect(result.message).toContain('http://localhost:4200');
    expect(result.message).toMatch(/Plate: http:\/\/localhost:\d+\//);
  });

  it('auto-detects an Angular target from angular.json when --target is not given', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-'));
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({
        defaultProject: 'demo',
        projects: { demo: { architect: { serve: { options: { port: 4300 } } } } },
      }),
    );
    result = await runServeCommand({ repo: repoRoot, port: 0, open: false, platePort: 0 });
    expect(result.message).toContain('http://localhost:4300');
  });

  it('falls back to port 4200 when angular.json has no explicit serve port', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-'));
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({ projects: { demo: { architect: { serve: {} } } } }),
    );
    result = await runServeCommand({ repo: repoRoot, port: 0, open: false, platePort: 0 });
    expect(result.message).toContain('http://localhost:4200');
  });

  it('S17a: with no --repo and no .git/.jig in cwd, serves with no bench clamped at all', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'jig-serve-nobench-'));
    result = await runServeCommand({ port: 0, open: false, cwd });

    expect(result.message).toContain('Jig is on the bench');
    expect(result.message).not.toContain('Clamped:');

    const state = await (await fetch(`${result.url}/api/state`)).json();
    expect(state.bench).toBeNull();
  });

  it('an explicit --target always wins over angular.json auto-detection', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-'));
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({ projects: { demo: { architect: { serve: { options: { port: 4300 } } } } } }),
    );
    result = await runServeCommand({
      repo: repoRoot,
      port: 0,
      open: false,
      target: 'http://localhost:9999',
      platePort: 0,
    });
    expect(result.message).toContain('http://localhost:9999');
    expect(result.message).not.toContain('4300');
  });

  // S16 (AMENDMENT-1 §6/A5): the generic web adapter's devServer guess (read off the survey)
  // is now the FIRST auto-detection tier — angular.json's own port stays the fallback for a
  // repo the web adapter doesn't also guess a port for.
  describe('S16: --target inference reads the survey\'s devServer guess first', () => {
    it('auto-detects a Vite dev-server target from package.json when no angular.json exists at all', async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-web-'));
      await writeFile(
        join(repoRoot, 'package.json'),
        JSON.stringify({ scripts: { dev: 'vite' } }),
      );
      result = await runServeCommand({ repo: repoRoot, port: 0, open: false, platePort: 0 });
      expect(result.message).toContain('http://localhost:5173');
    });

    it('reads an explicit --port flag literally (worldloom chart-harness shape)', async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-web-port-'));
      await writeFile(
        join(repoRoot, 'package.json'),
        JSON.stringify({ scripts: { serve: 'node serve.mjs --root . --port 8174' } }),
      );
      result = await runServeCommand({ repo: repoRoot, port: 0, open: false, platePort: 0 });
      expect(result.message).toContain('http://localhost:8174');
    });

    it('the survey\'s devServer guess wins over angular.json\'s own configured port when both are present', async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-both-'));
      await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
      await writeFile(
        join(repoRoot, 'angular.json'),
        JSON.stringify({ projects: { demo: { architect: { serve: { options: { port: 4300 } } } } } }),
      );
      result = await runServeCommand({ repo: repoRoot, port: 0, open: false, platePort: 0 });
      expect(result.message).toContain('http://localhost:5173');
      expect(result.message).not.toContain('4300');
    });

    it('falls back to angular.json\'s port when the survey carries no devServer guess at all', async () => {
      // Same fixture as the pre-existing "auto-detects an Angular target" test above — no
      // package.json, so the web adapter never even detects this repo, let alone guesses a
      // devServer — proving the fallback tier is unaffected by S16's new first tier.
      const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-fallback-'));
      await writeFile(
        join(repoRoot, 'angular.json'),
        JSON.stringify({
          defaultProject: 'demo',
          projects: { demo: { architect: { serve: { options: { port: 4300 } } } } },
        }),
      );
      result = await runServeCommand({ repo: repoRoot, port: 0, open: false, platePort: 0 });
      expect(result.message).toContain('http://localhost:4300');
    });

    it('an explicit --target still wins over the survey\'s devServer guess', async () => {
      const repoRoot = await mkdtemp(join(tmpdir(), 'jig-serve-web-explicit-'));
      await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
      result = await runServeCommand({
        repo: repoRoot,
        port: 0,
        open: false,
        target: 'http://localhost:9999',
        platePort: 0,
      });
      expect(result.message).toContain('http://localhost:9999');
      expect(result.message).not.toContain('5173');
    });
  });
});
