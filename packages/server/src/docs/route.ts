import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from 'express';
import { DocsIndexSchema, buildIndex, jigPaths, retrieve, type DocsIndex } from '@jigbench/core';
import { pathExists } from '../fs-util.js';
import { logger } from '../logger.js';

const DEFAULT_K = 5;

async function loadDocsIndex(repoRoot: string): Promise<DocsIndex | null> {
  const file = join(jigPaths(repoRoot).survey, 'docs.json');
  if (!(await pathExists(file))) return null;
  try {
    return DocsIndexSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch (err) {
    logger.warn('docs.json failed to parse; reporting an empty docs index', String(err));
    return null;
  }
}

function parseK(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_K;
}

/**
 * `GET /api/docs` (EXECUTION-PLAN.md §4 S2b). With `?q=`, ranks the clamped docs against
 * the query (`?k=` caps the result count, default 5) and returns scored chunks. Without
 * `q`, returns just the index summary — files + kinds + chunk counts, never chunk text,
 * so the survey panel can list "what's clamped" without shipping every chunk body over
 * the wire. No docs.json yet (nothing clamped) is an honest empty answer, not a 404.
 */
export function createDocsRoute(repoRoot: string): RequestHandler {
  return async (req, res, next) => {
    try {
      const index = await loadDocsIndex(repoRoot);
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;

      if (q !== undefined) {
        const ranked = index ? retrieve(buildIndex(index.chunks), q, parseK(req.query.k)) : [];
        res.json({
          query: q,
          results: ranked.map(({ chunk, score }) => ({ ...chunk, score })),
        });
        return;
      }

      res.json({
        root: index?.root ?? null,
        clampedAt: index?.clampedAt ?? null,
        files: index?.files ?? [],
      });
    } catch (err) {
      next(err);
    }
  };
}
