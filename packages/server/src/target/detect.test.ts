import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectDevScript, isRunnableScriptName, packageJsonScriptNames } from './detect.js';
import { isValidPort } from '../valid-port.js';

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
    // #37: the hint names a script; the REPO is what says that script may run. `dev` has to be
    // a key of this package.json for the survey tier to fire at all (see the tier's own tests
    // below) — before #37 this case passed with no package.json in the directory at all.
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }), 'utf8');
    const result = detectDevScript(repoRoot, { devServer: { script: 'dev', port: 5173 } });
    expect(result).toEqual({
      ...expectedInvocation('npm', ['run', 'dev']),
      cwd: repoRoot,
      port: 5173,
      script: 'dev',
      source: 'survey',
    });
  });

  // #37: the survey-hint tier built `npm run <hint.script>` straight from the hint and returned,
  // never consulting `packageJsonScriptNames` — the allowlist every other path through this
  // module goes through (#17: on win32 these args reach cmd.exe, which re-parses them, so the
  // name must come from the repo and never from data). It was unreachable only because
  // `SurveySchema` strips a top-level `devServer` today; the first adapter to emit one would
  // have made it live, which is the wrong moment to find this out.
  describe('#37: the survey hint goes through the repo\'s own script allowlist', () => {
    it('refuses a hint naming a script the repo does not have, and falls through to the repo\'s own', async () => {
      const repoRoot = await freshDir();
      await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');

      const result = detectDevScript(repoRoot, { devServer: { script: 'dev', port: 5173 } });

      expect(result?.script).toBe('start'); // the repo's own, not the hint's
      expect(result?.source).toBe('package.json'); // and it is no longer the survey tier that answered
      expect(result?.args).toEqual(expectedInvocation('npm', ['run', 'start']).args);
      expect(result?.args.join(' ')).not.toContain('dev');
    });

    it('refuses a hint carrying cmd.exe metacharacters, whatever else is in the repo', async () => {
      const repoRoot = await freshDir();
      await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');

      const result = detectDevScript(repoRoot, { devServer: { script: 'start&calc.exe', port: 5173 } });

      expect(result?.script).toBe('start');
      expect(result?.args.join(' ')).not.toContain('calc');
    });

    it('returns null when the hint is all there was and the repo does not name it', async () => {
      const repoRoot = await freshDir();
      expect(detectDevScript(repoRoot, { devServer: { script: 'dev', port: 5173 } })).toBeNull();
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

  // #81 item 4 of the issue's list (item 3 of this slice): #70 bounded a `port` that arrives in a
  // REQUEST body, and stopped there. Two more ports reach the runner without ever meeting
  // `valid-port.ts` — one read out of the clamped repo's `angular.json`, one out of a survey
  // hint — and both are data from outside, exactly like the request body. JSON has no Infinity
  // literal but no exponent ceiling either, so a parser reads `1e999` as `Infinity`: a value
  // that IS a number, is not a port, and used to spawn the app and then burn the whole
  // 120-second availability probe waiting for a port that cannot exist. `0`, `-1`, `65536` and
  // `4200.5` are the same class, quieter.
  //
  // `1e999` has to be written as raw text, not through `JSON.stringify`, because
  // `JSON.stringify(Infinity)` is the string `null` — the one shape that would hide the very
  // value under test.
  describe('#81: a port that comes out of the repo or a survey is bounded like one from a request', () => {
    // The last one is a numeric STRING, written raw so it reaches the parser as `"4200"`:
    // `AngularJsonShape` types `options.port` as `number`, so a string in the file is invisible
    // to the type checker and only the runtime guard catches it.
    const OUT_OF_RANGE = ['1e999', '0', '-1', '65536', '4200.5', '"4200"'];

    it('an angular.json port outside the range reads as no configured port, not as a port', async () => {
      for (const raw of OUT_OF_RANGE) {
        const repoRoot = await freshDir();
        await writeFile(
          join(repoRoot, 'angular.json'),
          `{"defaultProject":"app","projects":{"app":{"architect":{"serve":{"options":{"port":${raw}}}}}}}`,
          'utf8',
        );
        // The same #81-item-8 gate as the tier walk below: planted so this case tests the port
        // rule rather than the tier's own availability, with or without PR #99.
        await mkdir(join(repoRoot, 'node_modules', '.bin'), { recursive: true });
        await writeFile(join(repoRoot, 'node_modules', '.bin', 'ng'), '#!/usr/bin/env node\n', 'utf8');
        await writeFile(join(repoRoot, 'node_modules', '.bin', 'ng.cmd'), '@echo off\n', 'utf8');

        const result = detectDevScript(repoRoot);
        expect(result, raw).not.toBeNull();
        expect(isValidPort(result?.port), `angular.json port ${raw} -> ${String(result?.port)}`).toBe(true);
        // Still the angular.json tier — an unusable port is not a missing angular.json.
        expect(result?.source, raw).toBe('angular.json');
      }
    });

    it('a survey hint port outside the range falls through to the tier below', async () => {
      for (const raw of [Infinity, 0, -1, 65536, 4200.5, Number.NaN, '4200' as unknown as number]) {
        const repoRoot = await freshDir();
        await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
        const result = detectDevScript(repoRoot, { devServer: { script: 'start', port: raw } });
        expect(result, String(raw)).not.toBeNull();
        expect(isValidPort(result?.port), `hint port ${String(raw)} -> ${String(result?.port)}`).toBe(true);
        // The SCRIPT half of the hint is untouched — only its port fell through.
        expect(result?.source, String(raw)).toBe('survey');
        expect(result?.script, String(raw)).toBe('start');
      }
    });

    // The acceptance: no path out of `detectDevScript` answers with a port `isValidPort`
    // rejects. One walk of every tier, each with the worst port its source can carry.
    it('every tier answers with a port valid-port.ts accepts', async () => {
      const badAngular = '{"defaultProject":"app","projects":{"app":{"architect":{"serve":{"options":{"port":1e999}}}}}}';
      const pkg = JSON.stringify({ scripts: { start: 'ng serve' } });

      // tier 1 — the survey hint, with a poisoned port AND a poisoned angular.json under it.
      const survey = await freshDir();
      await writeFile(join(survey, 'package.json'), pkg, 'utf8');
      await writeFile(join(survey, 'angular.json'), badAngular, 'utf8');
      const tier1 = detectDevScript(survey, { devServer: { script: 'start', port: Infinity } });
      expect(tier1?.source).toBe('survey');
      expect(isValidPort(tier1?.port), `survey -> ${String(tier1?.port)}`).toBe(true);

      // tier 2 — package.json's own script, port read from the poisoned angular.json.
      const pkgTier = await freshDir();
      await writeFile(join(pkgTier, 'package.json'), pkg, 'utf8');
      await writeFile(join(pkgTier, 'angular.json'), badAngular, 'utf8');
      const tier2 = detectDevScript(pkgTier);
      expect(tier2?.source).toBe('package.json');
      expect(isValidPort(tier2?.port), `package.json -> ${String(tier2?.port)}`).toBe(true);

      // tier 3 — angular.json alone, which also puts the port on the command line.
      //
      // The local `ng` is planted deliberately: #81 item 8 (PR #99) gates this tier on the
      // repo having its own `node_modules/.bin/ng`, because `npx ng serve` downloads one from
      // the registry otherwise. Planting it here makes this case exercise tier 3 whether or not
      // that PR has landed — without it, tier 3 declines once it does and this walk silently
      // stops walking the tier it is named for.
      const ngTier = await freshDir();
      await writeFile(join(ngTier, 'angular.json'), badAngular, 'utf8');
      await mkdir(join(ngTier, 'node_modules', '.bin'), { recursive: true });
      await writeFile(join(ngTier, 'node_modules', '.bin', 'ng'), '#!/usr/bin/env node\n', 'utf8');
      await writeFile(join(ngTier, 'node_modules', '.bin', 'ng.cmd'), '@echo off\n', 'utf8');
      const tier3 = detectDevScript(ngTier);
      expect(tier3?.source).toBe('angular.json');
      expect(isValidPort(tier3?.port), `angular.json -> ${String(tier3?.port)}`).toBe(true);
      expect(tier3?.args.join(' ')).not.toMatch(/Infinity|null|NaN/);

      // tier 4 — nothing detectable at all is still the honest null, not a bad port.
      expect(detectDevScript(await freshDir())).toBeNull();
    });
  });

  // #81: `npx ng serve` fetches `ng` FROM THE REGISTRY when the repo has no local install —
  // a network download and then an execution, on nothing but the presence of an `angular.json`.
  // The tier now requires the repo's own `node_modules/.bin/ng` (planted here) and passes
  // `--no-install` so npx can never reach the registry even if the two disagree. The assertion
  // that used to stand here expected no `--no-install` and no local binary at all.
  async function plantLocalNg(repoRoot: string): Promise<void> {
    const bin = join(repoRoot, 'node_modules', '.bin');
    await mkdir(bin, { recursive: true });
    // Both spellings, so the case runs identically on either CI leg: npm writes `ng` and
    // `ng.cmd` side by side on Windows.
    await writeFile(join(bin, 'ng'), '#!/usr/bin/env node\n', 'utf8');
    await writeFile(join(bin, 'ng.cmd'), '@echo off\n', 'utf8');
  }

  it('falls back to `npx --no-install ng serve --port <n>` when angular.json exists, no npm script does, and ng is installed locally', async () => {
    const repoRoot = await freshDir();
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({ defaultProject: 'app', projects: { app: {} } }),
      'utf8',
    );
    await plantLocalNg(repoRoot);

    const result = detectDevScript(repoRoot);
    expect(result).toEqual({
      ...expectedInvocation('npx', ['--no-install', 'ng', 'serve', '--port', '4200']),
      cwd: repoRoot,
      port: 4200,
      source: 'angular.json',
    });
  });

  it('#81: declines the angular.json tier unless the repo has an ng of its own', async () => {
    const repoRoot = await freshDir();
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({ defaultProject: 'app', projects: { app: { architect: { serve: { options: { port: 4300 } } } } } }),
      'utf8',
    );
    // No node_modules/.bin/ng anywhere. `npx ng serve` would have DOWNLOADED `ng` from the
    // registry here and run it, on nothing but the presence of an angular.json in a folder the
    // human pointed at. The honest answer is the one the module already has words for: nothing
    // to start, so the checklist asks for a URL instead.
    expect(detectDevScript(repoRoot)).toBeNull();
  });

  it('#81: a package.json script still wins, local ng or not — only the bare angular.json tier is gated', async () => {
    const repoRoot = await freshDir();
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ scripts: { start: 'ng serve' } }), 'utf8');
    await writeFile(
      join(repoRoot, 'angular.json'),
      JSON.stringify({ defaultProject: 'app', projects: { app: { architect: { serve: { options: { port: 4300 } } } } } }),
      'utf8',
    );
    const result = detectDevScript(repoRoot);
    expect(result?.source).toBe('package.json');
    expect(result?.port).toBe(4300); // still reads the real configured port
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

  // #37: being a key of package.json was the whole test, and a repo's own key can carry
  // metacharacters. `"start&calc": "..."` in a hostile (or merely odd) clone was a name Jig would
  // hand to cmd.exe, which re-parses the command line — and libuv only quotes an argument
  // containing a space, a tab or a quote, so `&` alone is passed through unquoted and splits.
  // The platform is a parameter so the win32 rule is provable on any OS, the same reason
  // `fs/win32-hidden.ts` splits `parseAttribOutput` out of its spawn.
  it('#37: drops a name that would split under cmd.exe on win32, and keeps every one of them off it', async () => {
    const repoRoot = await freshDir();
    await writeFile(
      join(repoRoot, 'package.json'),
      JSON.stringify({
        scripts: {
          start: 'ng serve',
          'start&calc.exe': 'echo pwned',
          'build|more': 'x',
          'a^b': 'x',
          'pct%temp%': 'x',
          'with space': 'x',
          'test:unit': 'vitest',
          'build.prod': 'x',
          'lint-all': 'x',
          under_score: 'x',
        },
      }),
      'utf8',
    );

    expect(packageJsonScriptNames(repoRoot, 'win32')).toEqual([
      'start',
      'test:unit',
      'build.prod',
      'lint-all',
      'under_score',
    ]);

    // POSIX spawns npm as a real executable with a real argv — nothing re-parses it, so a name
    // the repo chose is the repo's business there.
    expect(packageJsonScriptNames(repoRoot, 'linux')).toContain('start&calc.exe');
    expect(packageJsonScriptNames(repoRoot, 'linux')).toContain('with space');
  });
});

// #37: the charset itself, pure, so both branches are proved on whichever leg runs.
describe('isRunnableScriptName', () => {
  const SPLITS_UNDER_CMD = ['start&calc.exe', 'a|b', 'a^b', '%TEMP%', 'a>b', 'a<b', 'a"b', 'with space', "a'b", 'a\tb', 'a(b)', 'a;b', 'a,b', 'a=b'];
  const ORDINARY = ['start', 'dev', 'serve', 'test:unit', 'build.prod', 'lint-all', 'under_score', 'ng', 'a', '0'];

  it('refuses, on win32, every name that cmd.exe would not keep whole', () => {
    for (const name of SPLITS_UNDER_CMD) {
      expect(isRunnableScriptName(name, 'win32'), name).toBe(false);
    }
  });

  it('accepts, on win32, the shapes real package.json scripts actually use', () => {
    for (const name of ORDINARY) {
      expect(isRunnableScriptName(name, 'win32'), name).toBe(true);
    }
  });

  it('accepts everything else off win32 — npm is an ordinary executable there and nothing re-parses its argv', () => {
    for (const name of [...SPLITS_UNDER_CMD, ...ORDINARY]) {
      expect(isRunnableScriptName(name, 'linux'), name).toBe(true);
      expect(isRunnableScriptName(name, 'darwin'), name).toBe(true);
    }
  });

  it('refuses an empty name on win32, and defaults to this platform when none is named', () => {
    expect(isRunnableScriptName('', 'win32')).toBe(false);
    expect(isRunnableScriptName('start')).toBe(true); // every platform agrees about `start`
  });

  // #81: two shapes the win32 charset happens to cover and no platform should accept, because
  // neither is about cmd.exe re-parsing a line.
  //
  // A leading `-` is read as an OPTION by whatever the argv reaches. `npm run -x` is npm being
  // handed a flag, not a script name, on every platform — and `-` passes the win32 charset
  // (`[A-Za-z0-9._:-]`), so even the strict leg let it through. There is no legitimate npm
  // script whose name starts with one.
  //
  // Length is the other: a name is a key of the repo's own package.json, which means it is
  // whatever a hostile clone wrote there. 214 is `npm run`'s own practical ceiling by a wide
  // margin and well under every platform's argument limit.
  describe('#81: the two rules that are not about cmd.exe, so they hold on every platform', () => {
    const PLATFORMS = ['win32', 'linux', 'darwin'] as const;

    it('refuses a name beginning with `-`, which every argv reads as an option', () => {
      for (const platform of PLATFORMS) {
        for (const name of ['-x', '--force', '-', '--', '-rf']) {
          expect(isRunnableScriptName(name, platform), `${name} on ${platform}`).toBe(false);
        }
      }
    });

    it('refuses a name past the cap, and keeps the longest one under it', () => {
      for (const platform of PLATFORMS) {
        expect(isRunnableScriptName('a'.repeat(214), platform), `214 on ${platform}`).toBe(true);
        expect(isRunnableScriptName('a'.repeat(215), platform), `215 on ${platform}`).toBe(false);
        expect(isRunnableScriptName('a'.repeat(100_000), platform), `100k on ${platform}`).toBe(false);
      }
    });

    it('refuses an empty name everywhere, not only on win32', () => {
      for (const platform of PLATFORMS) {
        expect(isRunnableScriptName('', platform), platform).toBe(false);
      }
    });

    // The detector control: neither rule may cost an ordinary name on any platform, and the
    // off-win32 leniency about metacharacters is untouched.
    it('leaves every ordinary name, and every off-win32 metacharacter name, alone', () => {
      for (const platform of PLATFORMS) {
        for (const name of ORDINARY) expect(isRunnableScriptName(name, platform), `${name} on ${platform}`).toBe(true);
      }
      for (const name of SPLITS_UNDER_CMD) {
        expect(isRunnableScriptName(name, 'linux'), name).toBe(true);
      }
      // A `-` that is not leading is a perfectly good npm script name and stays one.
      expect(isRunnableScriptName('lint-all', 'linux')).toBe(true);
      expect(isRunnableScriptName('lint-all', 'win32')).toBe(true);
    });
  });
});
