import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectDevScript, packageJsonScriptNames } from './detect.js';

// Windows cannot CreateProcess a `.cmd` file directly — `spawn('npm.cmd', ..., {shell:
// false})` throws a SYNCHRONOUS `EINVAL` on current Node (reproduced live on this desk, Node
// v24.17.0) — cmd.exe is the actual OS-level loader `.cmd`/`.bat` scripts need. `detect.ts`
// routes every npm/npx invocation through it there. That argv array is NOT what keeps shell
// metacharacters out (#17 — cmd.exe re-parses the joined command line): the script name in it
// is always a key of the repo's own package.json, checked by `target/route.ts` for an explicit
// {script} (`packageJsonScriptNames`, tested below) and by detection's own tiers here.
function expectedInvocation(bin: 'npm' | 'npx', args: string[]): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', bin, ...args] };
  }
  return { command: bin, args };
}

let dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function freshDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'jig-detect-'));
  dirs.push(d);
  return d;
}

describe('detectDevScript', () => {
  it('returns null when nothing at all is detectable', async () => {
    const repoRoot = await freshDir();
    expect(detectDevScript(repoRoot)).toBeNull();
  });

  it('prefers survey.devServer.script (S16 seam) when present, using its own port', async () => {
    const repoRoot = await freshDir();
    const result = detectDevScript(repoRoot, { devServer: { script: 'dev', port: 5173 } });
    expect(result).toEqual({
      ...expectedInvocation('npm', ['run', 'dev']),
      cwd: repoRoot,
      port: 5173,
      script: 'dev',
      source: 'survey',
    });
  });

  it('falls back to package.json scripts.start when no survey hint exists', async () => {
    const repoRoot = await freshDir();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
    const result = detectDevScript(repoRoot);
    expect(result).toEqual({
      ...expectedInvocation('npm', ['run', 'start']),
      cwd: repoRoot,
      port: 4200, // no angular.json to read a real port from — the last-resort default
      script: 'start',
      source: 'package.json',
    });
  });

  it('prefers scripts.start over scripts.dev over scripts.serve, in that order', async () => {
    const repoRoot = await freshDir();
    await writeFile(
      join(repoRoot, 'package.json'),
      JSON.stringify({ scripts: { serve: 'x', dev: 'y', start: 'z' } }),
      'utf8',
    );
    expect(detectDevScript(repoRoot)?.script).toBe('start');
  });

  it('reads the real configured port from angular.json when package.json also has a script', async () => {
    const repoRoot = await freshDir();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({
        defaultProject: 'app',
        projects: { app: { architect: { serve: { options: { port: 4300 } } } } },
      }),
      'utf8',
    );
    const result = detectDevScript(repoRoot);
    expect(result?.port).toBe(4300);
    expect(result?.source).toBe('package.json');
  });

  it('falls back to `npx ng serve --port <n>` when angular.json exists but no npm script does', async () => {
    const repoRoot = await freshDir();
    await mkdir(repoRoot, { recursive: true });
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({ defaultProject: 'app', projects: { app: {} } }),
      'utf8',
    );
    const result = detectDevScript(repoRoot);
    expect(result).toEqual({
      ...expectedInvocation('npx', ['ng', 'serve', '--port', '4200']),
      cwd: repoRoot,
      port: 4200,
      source: 'angular.json',
    });
  });
});

// #17: the allowlist `POST /api/target/start` checks an explicit {script} against.
describe('packageJsonScriptNames', () => {
  it('lists exactly the string-valued script names package.json defines, in its own order', async () => {
    const repoRoot = await freshDir();
    await writeFile(
      join(repoRoot, 'package.json'),
      JSON.stringify({ scripts: { start: 'ng serve', dev: 'vite', broken: 42, test: 'vitest' } }),
      'utf8',
    );
    expect(packageJsonScriptNames(repoRoot)).toEqual(['start', 'dev', 'test']);
  });

  it('is empty with no package.json, with no scripts field, and with a package.json that will not parse', async () => {
    expect(packageJsonScriptNames(await freshDir())).toEqual([]);

    const noScripts = await freshDir();
    await writeFile(join(noScripts, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');
    expect(packageJsonScriptNames(noScripts)).toEqual([]);

    const corrupt = await freshDir();
    await writeFile(join(corrupt, 'package.json'), '{ not json', 'utf8');
    expect(packageJsonScriptNames(corrupt)).toEqual([]);
  });
});
