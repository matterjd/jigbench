import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Express } from 'express';
import { clampDocs } from '../docs/clamp.js';
import type { Bench } from '../bench/bench.js';
import type { TargetState } from '../target/runner.js';
import { claudeDesktopConfigPath, formatClaudeDesktopConfigDiff, mergeClaudeDesktopConfig } from './desktop-config.js';
import { formatMcpJsonDiff, mergeMcpJson } from './mcp-json.js';
import { ensureGitignoreEntry } from './gitignore.js';

/**
 * S17a (AMENDMENT-1 §7, A6): "A setup checklist lives one click from the status line" plus
 * the three actions it drives — register with Claude Code (`.mcp.json` and, optionally, the
 * Claude Desktop config) and clamp a docs folder. Every write is diff-first: the POST routes
 * always return the diff; they only write with `{apply: true}` in the body, mirroring the
 * CLI's own `init`/`mcp install` "print the diff, --yes to write" contract.
 */

export interface SetupRouteContext {
  getBench: () => Bench | null;
  getTargetState: () => TargetState;
  /** Test-only override — defaults to the real `claudeDesktopConfigPath()`. */
  getDesktopConfigPath?: () => string | undefined;
}

async function readJsonIfPresent(path: string): Promise<unknown> {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
}

export function attachSetupRoute(app: Express, ctx: SetupRouteContext): void {
  const resolveDesktopConfigPath = ctx.getDesktopConfigPath ?? (() => claudeDesktopConfigPath());

  app.get('/api/setup', async (_req, res, next) => {
    try {
      const bench = ctx.getBench();
      if (!bench) {
        res.json({
          survey: false,
          docs: false,
          target: ctx.getTargetState(),
          mcp: { written: false, path: undefined },
          desktop: { written: false, path: undefined },
          claude: 'none',
        });
        return;
      }

      const state = bench.store.getState();
      const mcpJsonPath = join(bench.repoRoot, '.mcp.json');
      const mcpExisting = await readJsonIfPresent(mcpJsonPath);
      const mcpWritten = !mergeMcpJson(mcpExisting, bench.repoRoot).changed;

      const desktopPath = resolveDesktopConfigPath();
      let desktopWritten = false;
      if (desktopPath && existsSync(desktopPath)) {
        const desktopExisting = await readJsonIfPresent(desktopPath);
        desktopWritten = !mergeClaudeDesktopConfig(desktopExisting, bench.repoRoot).changed;
      }

      res.json({
        survey: !state.survey.stub,
        docs: state.wiring.docs === 'wired',
        target: ctx.getTargetState(),
        mcp: { written: mcpWritten, path: mcpJsonPath },
        desktop: { written: desktopWritten, path: desktopPath },
        claude: bench.claudeInstalled ? 'installed' : 'none',
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/setup/mcp', async (req, res, next) => {
    try {
      const bench = ctx.getBench();
      if (!bench) {
        res.status(409).json({ error: 'no repo is clamped' });
        return;
      }

      const mcpJsonPath = join(bench.repoRoot, '.mcp.json');
      const existing = await readJsonIfPresent(mcpJsonPath);
      const { merged, changed } = mergeMcpJson(existing, bench.repoRoot);
      const diff = formatMcpJsonDiff(existing, merged);

      if (!changed) {
        res.json({ diff, changed: false, wrote: false });
        return;
      }
      if (req.body?.apply !== true) {
        res.json({ diff, changed: true, wrote: false });
        return;
      }

      await writeFile(mcpJsonPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

      const gitignorePath = join(bench.repoRoot, '.gitignore');
      const existingGitignore = existsSync(gitignorePath) ? await readFile(gitignorePath, 'utf8') : undefined;
      const { updated, changed: gitignoreChanged } = ensureGitignoreEntry(existingGitignore, '.jig/cache/');
      if (gitignoreChanged) await writeFile(gitignorePath, updated, 'utf8');

      res.json({ diff, changed: true, wrote: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/setup/desktop', async (req, res, next) => {
    try {
      const bench = ctx.getBench();
      if (!bench) {
        res.status(409).json({ error: 'no repo is clamped' });
        return;
      }

      const desktopPath = resolveDesktopConfigPath();
      if (!desktopPath) {
        res.status(404).json({ error: 'claude_desktop_config.json location not found — is Claude Desktop installed?' });
        return;
      }

      const existing = await readJsonIfPresent(desktopPath);
      const { merged, changed } = mergeClaudeDesktopConfig(existing, bench.repoRoot);
      const diff = formatClaudeDesktopConfigDiff(existing, merged);

      if (!changed) {
        res.json({ diff, changed: false, wrote: false });
        return;
      }
      if (req.body?.apply !== true) {
        res.json({ diff, changed: true, wrote: false });
        return;
      }

      await mkdir(dirname(desktopPath), { recursive: true });
      await writeFile(desktopPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
      res.json({ diff, changed: true, wrote: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/docs/clamp', async (req, res, next) => {
    try {
      const bench = ctx.getBench();
      if (!bench) {
        res.status(409).json({ error: 'no repo is clamped' });
        return;
      }
      const folder = req.body?.folder;
      if (typeof folder !== 'string' || folder.trim().length === 0) {
        res.status(400).json({ error: 'folder is required' });
        return;
      }

      const result = await clampDocs({ repoRoot: bench.repoRoot, folder });
      await bench.store.reload();

      res.json({
        files: result.index.files.length,
        chunks: result.index.chunks.length,
        ignoredExtensions: result.ignoredExtensions,
        file: result.file,
      });
    } catch (err) {
      next(err);
    }
  });
}
