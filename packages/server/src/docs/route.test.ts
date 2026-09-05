import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import express from 'express';
import { jigPaths, type DocsIndex } from '@jigbench/core';
import { createDocsRoute } from './route.js';

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function serveDocsRoute(repoRoot: string): Promise<string> {
  const app = express();
  app.get('/api/docs', createDocsRoute(repoRoot));
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server!.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve(`http://localhost:${port}`);
    });
  });
}

async function writeIndex(repoRoot: string, index: DocsIndex): Promise<void> {
  const paths = jigPaths(repoRoot);
  await mkdir(paths.survey, { recursive: true });
  await writeFile(join(paths.survey, 'docs.json'), JSON.stringify(index), 'utf8');
}

const SAMPLE_INDEX: DocsIndex = {
  jigFormat: 1,
  root: '/docs',
  clampedAt: '2026-09-05T00:00:00.000Z',
  files: [
    { file: 'a.md', kind: 'md', chunks: 1 },
    { file: 'b.md', kind: 'md', chunks: 1 },
  ],
  chunks: [
    { id: 'a', file: 'a.md', headingPath: [], startLine: 1, endLine: 1, text: 'the invoice due date is printed here', words: 7 },
    { id: 'b', file: 'b.md', headingPath: [], startLine: 1, endLine: 1, text: 'unrelated setup notes about npm scripts', words: 6 },
  ],
};

describe('GET /api/docs', () => {
  it('reports an honest empty summary when no docs.json exists yet', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-docsroute-'));
    const url = await serveDocsRoute(repoRoot);

    const res = await fetch(`${url}/api/docs`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ root: null, clampedAt: null, files: [] });
  });

  it('returns the index summary (files + counts, no chunk text) with no query', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-docsroute-'));
    await writeIndex(repoRoot, SAMPLE_INDEX);
    const url = await serveDocsRoute(repoRoot);

    const res = await fetch(`${url}/api/docs`);
    const body = await res.json();

    expect(body.files).toEqual(SAMPLE_INDEX.files);
    expect(JSON.stringify(body)).not.toContain('invoice due date');
  });

  it('ranks chunks by ?q= and puts the best match first', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-docsroute-'));
    await writeIndex(repoRoot, SAMPLE_INDEX);
    const url = await serveDocsRoute(repoRoot);

    const res = await fetch(`${url}/api/docs?${new URLSearchParams({ q: 'invoice due date' })}`);
    const body = await res.json();

    expect(body.query).toBe('invoice due date');
    expect(body.results[0]?.file).toBe('a.md');
    expect(body.results[0]?.text).toContain('due');
  });

  it('defaults k to 5 and honors an explicit k', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-docsroute-'));
    const manyChunks: DocsIndex = {
      ...SAMPLE_INDEX,
      chunks: Array.from({ length: 8 }, (_, i) => ({
        id: `c${i}`,
        file: `c${i}.md`,
        headingPath: [],
        startLine: 1,
        endLine: 1,
        text: 'invoice invoice invoice',
        words: 3,
      })),
    };
    await writeIndex(repoRoot, manyChunks);
    const url = await serveDocsRoute(repoRoot);

    const defaultRes = await fetch(`${url}/api/docs?q=invoice`);
    expect((await defaultRes.json()).results).toHaveLength(5);

    const kRes = await fetch(`${url}/api/docs?q=invoice&k=2`);
    expect((await kRes.json()).results).toHaveLength(2);
  });

  it('returns an empty results array for a query with no docs.json yet', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-docsroute-'));
    const url = await serveDocsRoute(repoRoot);

    const res = await fetch(`${url}/api/docs?q=anything`);
    const body = await res.json();

    expect(body).toEqual({ query: 'anything', results: [] });
  });
});
