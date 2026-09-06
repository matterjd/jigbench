import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocsIndexSchema } from '@jigbench/core';
import { clampDocs } from './clamp.js';

const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__', 'handbook');

async function freshRepo(prefix = 'jig-clamp-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('clampDocs — the handbook fixture', () => {
  it('yields 5 files with the expected kinds, each with at least one chunk', async () => {
    const repoRoot = await freshRepo();

    const { index, file, ignoredExtensions } = await clampDocs({ repoRoot, folder: FIXTURE_DIR });

    expect(() => DocsIndexSchema.parse(index)).not.toThrow();
    expect(index.files).toHaveLength(5);
    expect(ignoredExtensions).toEqual([]);

    const byKind = (kind: string) => index.files.filter((f) => f.kind === kind);
    expect(byKind('md')).toHaveLength(3);
    expect(byKind('txt')).toHaveLength(1);
    expect(byKind('pdf')).toHaveLength(1);
    for (const summary of index.files) expect(summary.chunks).toBeGreaterThan(0);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.files).toHaveLength(5);
  });

  it('has exact provenance for the known "Due dates" heading in guide.md', async () => {
    const repoRoot = await freshRepo();
    const { index } = await clampDocs({ repoRoot, folder: FIXTURE_DIR });

    const chunk = index.chunks.find((c) => c.headingPath.join(' > ') === 'Handbook > Billing > Due dates');
    expect(chunk).toBeDefined();
    expect(chunk).toMatchObject({ startLine: 7, endLine: 7 });
    expect(chunk!.text).toContain('due');
  });

  it('extracts the PDF phrase into a matching chunk', async () => {
    const repoRoot = await freshRepo();
    const { index } = await clampDocs({ repoRoot, folder: FIXTURE_DIR });

    const pdfChunk = index.chunks.find((c) => c.text.includes('invoices fall due thirty days after issue'));
    expect(pdfChunk).toBeDefined();
  });

  it('never treats the fenced "# not a heading" line in snippets.md as a heading', async () => {
    const repoRoot = await freshRepo();
    const { index } = await clampDocs({ repoRoot, folder: FIXTURE_DIR });

    expect(index.chunks.some((c) => c.text.includes('# not a heading'))).toBe(true);
    expect(index.chunks.every((c) => !c.headingPath.includes('not a heading'))).toBe(true);
  });
});

describe('clampDocs — folder edge cases', () => {
  it('lists unsupported extensions instead of silently dropping them', async () => {
    const repoRoot = await freshRepo('jig-clamp-repo-');
    const docsDir = await freshRepo('jig-docs-unsupported-');
    await writeFile(join(docsDir, 'diagram.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(docsDir, 'config.json'), '{}');
    await writeFile(join(docsDir, 'README'), 'no extension here');

    const { index, ignoredExtensions } = await clampDocs({ repoRoot, folder: docsDir });

    expect(index.files).toEqual([]);
    expect(index.chunks).toEqual([]);
    expect(ignoredExtensions).toEqual(['(no extension)', '.json', '.png']);
  });

  it('yields an honest empty index for an empty folder, not an error', async () => {
    const repoRoot = await freshRepo('jig-clamp-repo-');
    const emptyDocs = await freshRepo('jig-docs-empty-');

    const { index } = await clampDocs({ repoRoot, folder: emptyDocs });

    expect(index.files).toEqual([]);
    expect(index.chunks).toEqual([]);
  });

  it('skips node_modules, .git, and hidden directories', async () => {
    const repoRoot = await freshRepo('jig-clamp-repo-');
    const docsDir = await freshRepo('jig-docs-skip-');
    await mkdir(join(docsDir, 'node_modules'), { recursive: true });
    await writeFile(join(docsDir, 'node_modules', 'skip-me.md'), '# nope\n\nbody\n');
    await mkdir(join(docsDir, '.git'), { recursive: true });
    await writeFile(join(docsDir, '.git', 'skip-me-too.md'), '# nope\n\nbody\n');
    await mkdir(join(docsDir, '.hidden'), { recursive: true });
    await writeFile(join(docsDir, '.hidden', 'and-me.md'), '# nope\n\nbody\n');
    await writeFile(join(docsDir, 'real.md'), '# Real\n\nreal body\n');

    const { index } = await clampDocs({ repoRoot, folder: docsDir });

    expect(index.files).toHaveLength(1);
    expect(index.files[0]?.file).toContain('real.md');
  });

  it('records repo-relative file paths when the docs folder is inside the repo', async () => {
    const repoRoot = await freshRepo('jig-clamp-inside-');
    const docsDir = join(repoRoot, 'docs');
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(docsDir, 'a.md'), '# A\n\nbody\n');

    const { index } = await clampDocs({ repoRoot, folder: docsDir });

    expect(index.files[0]?.file).toBe('docs/a.md');
    expect(index.chunks[0]?.file).toBe('docs/a.md');
  });

  it('records an absolute file path when the docs folder is outside the repo', async () => {
    const repoRoot = await freshRepo('jig-clamp-repo-');
    const docsDir = await freshRepo('jig-docs-outside-');
    await writeFile(join(docsDir, 'a.md'), '# A\n\nbody\n');

    const { index } = await clampDocs({ repoRoot, folder: docsDir });

    const fileRef = index.files[0]!.file;
    expect(fileRef.startsWith('/') || /^[A-Za-z]:\//.test(fileRef)).toBe(true);
  });

  // Cold pdf-parse (pdfjs-dist) init takes ~200ms alone (see the isolated-run timing this
  // comment is based on), but under full-suite CPU contention it has measured over 5s —
  // vitest's 5000ms default `testTimeout` made this file-level-flaky, timing out mid-parse
  // with no code defect (the PDF-parsing work itself is correct and fast once scheduled). A
  // generous per-test timeout, not a global bump, since this is the one CPU-bound outlier in
  // the file — everything else here is µs-fast fixture I/O.
  it(
    'gives a PDF with no extractable text one honest chunk instead of silence',
    async () => {
      const repoRoot = await freshRepo('jig-clamp-repo-');
      const docsDir = await freshRepo('jig-docs-blankpdf-');
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      await writeFile(join(docsDir, 'blank.pdf'), await doc.save());

      const { index } = await clampDocs({ repoRoot, folder: docsDir });

      expect(index.files).toHaveLength(1);
      expect(index.files[0]).toMatchObject({ kind: 'pdf', chunks: 1 });
      expect(index.chunks[0]?.text).toBe('no extractable text · scanned?');
    },
    20_000,
  );
});
