import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { dotnetAdapter } from './index.js';

const LEDGER_API_ROOT = fileURLToPath(new URL('../../../../examples/ledger-api', import.meta.url));
const EXAMPLES_ROOT = fileURLToPath(new URL('../../../../examples', import.meta.url));

/** Binds a throwaway server on an OS-assigned port and immediately releases it, returning
 * that port — good enough to call "unused" for a synchronous rewrite that happens a moment
 * later (the same assumption `port: 0` tests already make all over this monorepo). Used to
 * repoint a COPY of the fixture's `Properties/launchSettings.json` at a port nothing is
 * plausibly listening on, instead of the checked-in fixture's fixed 5210 — see "integration
 * seam 4" below for why 5210 itself is never safe to assume free. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      probe.close(() => (port ? resolve(port) : reject(new Error('could not allocate a free port'))));
    });
  });
}

/** Rewrites a copied fixture's `applicationUrl` (every profile) to `port` — tier (b)'s live
 * probe then has nothing to reach unless something happens to be on THAT exact OS-assigned
 * port, rather than the fixture's well-known 5210. */
async function pointLaunchSettingsAtFreePort(copiedAppRoot: string, port: number): Promise<void> {
  const file = join(copiedAppRoot, 'Properties', 'launchSettings.json');
  const settings = JSON.parse(await readFile(file, 'utf8')) as { profiles?: Record<string, { applicationUrl?: string }> };
  for (const profile of Object.values(settings.profiles ?? {})) {
    if (profile.applicationUrl) profile.applicationUrl = `http://localhost:${port}`;
  }
  await writeFile(file, JSON.stringify(settings, null, 2));
}

describe('dotnetAdapter.detect', () => {
  it('is true when a *.csproj exists at the repo root', async () => {
    expect(await dotnetAdapter.detect(LEDGER_API_ROOT)).toBe(true);
  });

  it('is true when the project is one level down (--repo pointed at examples/)', async () => {
    expect(await dotnetAdapter.detect(EXAMPLES_ROOT)).toBe(true);
  });

  it('is false on a temp dir with no .NET project in it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-detect-'));
    expect(await dotnetAdapter.detect(dir)).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('dotnetAdapter.survey — tier (a): the recorded openapi.v1.json', () => {
  it('reads the real fixture via the openapi-file tier, not stub', async () => {
    const survey = await dotnetAdapter.survey(LEDGER_API_ROOT);

    expect(survey.stack).toEqual(['dotnet']);
    expect(survey.stub).toBe(false);
    expect(survey.endpoints).toHaveLength(7);
    expect(survey.schemas).toHaveLength(8);
    expect(survey.endpoints.every((e) => e.stub !== true)).toBe(true);
    expect(survey.adapters).toEqual([
      {
        adapter: 'dotnet',
        appRoot: LEDGER_API_ROOT.replace(/\\/g, '/').replace(/\/+$/, ''),
        source: 'openapi-file',
        stub: false,
      },
    ]);
  });
});

describe('dotnetAdapter.survey — tier (c): recorded doc removed, no server running', () => {
  it('falls all the way to the regex-lite fallback and badges everything stub:true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-copy-'));
    await cp(LEDGER_API_ROOT, dir, {
      recursive: true,
      filter: (source) => !/[\\/](bin|obj)(?:[\\/]|$)/.test(source),
    });
    await unlink(join(dir, 'openapi.v1.json'));
    // Integration seam 4: repoint the COPY's launchSettings.json at an OS-assigned free
    // port rather than trusting the checked-in fixture's fixed 5210 to be free — S4 and S5
    // both saw this test flake whenever the real Ledger API dev server happened to be up on
    // 5210 at the same time. No test may depend on a port another process might hold.
    await pointLaunchSettingsAtFreePort(dir, await freePort());

    const survey = await dotnetAdapter.survey(dir);

    expect(survey.stub).toBe(true);
    expect(survey.endpoints.length).toBeGreaterThan(0);
    expect(survey.endpoints.every((e) => e.stub === true)).toBe(true);
    expect(survey.adapters).toEqual([
      { adapter: 'dotnet', appRoot: dir.replace(/\\/g, '/').replace(/\/+$/, ''), source: 'regex-stub', stub: true },
    ]);

    // Same paths+methods as tier (a) found from the untouched fixture.
    const tierAKeys = (await dotnetAdapter.survey(LEDGER_API_ROOT)).endpoints
      .map((e) => `${e.method} ${e.path}`)
      .sort();
    const tierCKeys = survey.endpoints.map((e) => `${e.method} ${e.path}`).sort();
    expect(tierCKeys).toEqual(tierAKeys);

    await rm(dir, { recursive: true, force: true });
  }, 15000);
});

describe('integration seam 4: tier (c) must not depend on port 5210 being free', () => {
  let interferer: Server | undefined;

  afterEach(async () => {
    if (interferer) {
      await new Promise<void>((resolve) => interferer!.close(() => resolve()));
      interferer = undefined;
    }
  });

  /**
   * The checked-in fixture's `Properties/launchSettings.json` names `http://localhost:5210`
   * (a fixed, well-known port from the recorded dev-server profile) — a *test copy* of that
   * file inherits the same literal port. S4 and S5 both saw this test flake whenever the
   * real Ledger API dev server happened to be up on 5210 at the same time: tier (b)'s live
   * probe would then genuinely succeed against that unrelated server, landing the survey on
   * `'openapi-live'`/`stub:false` instead of the `'regex-stub'`/`stub:true` this test expects.
   *
   * The fix (below, in the "falls all the way to the regex-lite fallback" test): the COPY's
   * launchSettings.json is rewritten to an OS-assigned free port before `survey()` runs, so
   * tier (b) has nothing to reach regardless of what else is running on this desk. This test
   * proves that fix by reproducing the exact flake condition on demand — binding a real
   * server on port 5210 itself — and confirming the survey is unaffected.
   */
  it('a real server on port 5210 does not change tier (c)\'s result for the copied fixture', async () => {
    try {
      interferer = await new Promise<Server>((resolve, reject) => {
        const srv = createServer((_req, res) => res.end('{}'));
        srv.once('error', reject);
        srv.listen(5210, '127.0.0.1', () => resolve(srv));
      });
    } catch {
      // Port 5210 is already held by something else on this desk for an unrelated reason —
      // there is nothing this test can prove either way; skip it rather than fail on noise.
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-copy-'));
    await cp(LEDGER_API_ROOT, dir, {
      recursive: true,
      filter: (source) => !/[\\/](bin|obj)(?:[\\/]|$)/.test(source),
    });
    await unlink(join(dir, 'openapi.v1.json'));
    // The fix under test: point the copy's launchSettings.json at a free port INSTEAD of
    // the fixture's fixed 5210 — the interferer above is bound to 5210 specifically to prove
    // this defeats it (without this rewrite, this assertion fails — see this commit's
    // red-first run against the unmodified tier (c) test, which hit exactly this failure).
    await pointLaunchSettingsAtFreePort(dir, await freePort());

    const survey = await dotnetAdapter.survey(dir);

    expect(survey.stub).toBe(true);
    expect(survey.adapters?.[0]).toMatchObject({ source: 'regex-stub', stub: true });

    await rm(dir, { recursive: true, force: true });
  });
});
