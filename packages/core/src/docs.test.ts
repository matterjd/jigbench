import { describe, expect, it } from 'vitest';
import { DocChunkSchema, DocsIndexSchema, chunkMarkdown, chunkPlain, emptyDocsIndex } from './docs.js';

// A fixture built line-by-line (not a template literal) so every line number below is
// exact and easy to re-derive by hand: line N is `lines[N - 1]`.
const NESTED_FIXTURE_LINES = [
  '# Guide', // 1
  '', // 2
  'Welcome to the guide.', // 3
  '', // 4
  '## Setup', // 5
  '', // 6
  'Install dependencies first.', // 7
  '', // 8
  '```bash', // 9
  '# not a heading', // 10
  'echo "hello"', // 11
  '```', // 12
  '', // 13
  '### Install', // 14
  '', // 15
  'Run npm install.', // 16
  '', // 17
  '## Usage', // 18
  '', // 19
  'Read the docs.', // 20
];
const NESTED_FIXTURE = NESTED_FIXTURE_LINES.join('\n');

describe('chunkMarkdown', () => {
  it('splits on ATX headings, keeps the heading path, and keeps line numbers exact', () => {
    const chunks = chunkMarkdown(NESTED_FIXTURE, 'handbook/guide.md');

    expect(chunks).toHaveLength(4);

    expect(chunks[0]).toMatchObject({
      headingPath: ['Guide'],
      startLine: 3,
      endLine: 3,
      text: 'Welcome to the guide.',
    });

    expect(chunks[2]).toMatchObject({
      headingPath: ['Guide', 'Setup', 'Install'],
      startLine: 16,
      endLine: 16,
      text: 'Run npm install.',
    });

    expect(chunks[3]).toMatchObject({
      headingPath: ['Guide', 'Usage'],
      startLine: 20,
      endLine: 20,
      text: 'Read the docs.',
    });
  });

  it('never treats a `#` inside a fenced code block as a heading', () => {
    const chunks = chunkMarkdown(NESTED_FIXTURE, 'handbook/guide.md');
    const setupChunk = chunks[1]!;

    expect(setupChunk.headingPath).toEqual(['Guide', 'Setup']);
    expect(setupChunk.startLine).toBe(7);
    expect(setupChunk.endLine).toBe(12);
    // The fenced `# not a heading` line survives as plain text inside the Setup section...
    expect(setupChunk.text).toContain('# not a heading');
    expect(setupChunk.text).toContain('```bash');
    // ...and never became a heading of its own — no chunk carries it in a headingPath.
    expect(chunks.every((c) => !c.headingPath.includes('not a heading'))).toBe(true);
  });

  it('never yields an empty chunk for a heading with no body text', () => {
    const chunks = chunkMarkdown('# A\n## B\ncontent\n', 'x.md');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ headingPath: ['A', 'B'], startLine: 3, endLine: 3, text: 'content' });
  });

  it('emits a headingPath: [] preamble chunk for content before the first heading', () => {
    // lines: 1 "intro line", 2 "", 3 "# First", 4 "", 5 "body", (6 "" from the trailing \n)
    const chunks = chunkMarkdown('intro line\n\n# First\n\nbody\n', 'x.md');
    expect(chunks[0]).toMatchObject({ headingPath: [], startLine: 1, endLine: 1, text: 'intro line' });
    expect(chunks[1]).toMatchObject({ headingPath: ['First'], startLine: 5, endLine: 5, text: 'body' });
  });

  it('produces schema-valid chunks and stable, unique ids', () => {
    const chunks = chunkMarkdown(NESTED_FIXTURE, 'handbook/guide.md');
    for (const chunk of chunks) {
      expect(() => DocChunkSchema.parse(chunk)).not.toThrow();
    }
    const ids = new Set(chunks.map((c) => c.id));
    expect(ids.size).toBe(chunks.length);
  });

  it('returns no chunks for an empty file', () => {
    expect(chunkMarkdown('', 'empty.md')).toEqual([]);
    expect(chunkMarkdown('   \n\n  \n', 'blank.md')).toEqual([]);
  });
});

describe('chunkPlain', () => {
  const TXT_LINES = [
    'Para one line.', // 1
    '', // 2
    'Para two spans', // 3
    'two lines.', // 4
    '', // 5
    'Para three.', // 6
  ];
  const TXT_FIXTURE = TXT_LINES.join('\n');

  it('groups blank-line paragraphs into one chunk when well under the word budget', () => {
    const chunks = chunkPlain(TXT_FIXTURE, 'notes.txt');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      headingPath: [],
      startLine: 1,
      endLine: 6,
      words: 10,
    });
    expect(chunks[0]!.text).toBe('Para one line.\n\nPara two spans\ntwo lines.\n\nPara three.');
  });

  it('never splits a paragraph and starts a new chunk once the budget is exceeded', () => {
    const chunks = chunkPlain(TXT_FIXTURE, 'notes.txt', 5);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ startLine: 1, endLine: 1, words: 3 });
    expect(chunks[1]).toMatchObject({ startLine: 3, endLine: 4, words: 5 });
    expect(chunks[2]).toMatchObject({ startLine: 6, endLine: 6, words: 2 });
  });

  it('never yields an empty chunk for blank-only text', () => {
    expect(chunkPlain('', 'empty.txt')).toEqual([]);
    expect(chunkPlain('\n\n   \n\n', 'blank.txt')).toEqual([]);
  });
});

describe('DocsIndexSchema', () => {
  it('accepts an honest empty index', () => {
    const index = emptyDocsIndex('/repo/docs', '2026-09-05T00:00:00.000Z');
    expect(index.files).toEqual([]);
    expect(index.chunks).toEqual([]);
    expect(() => DocsIndexSchema.parse(index)).not.toThrow();
  });

  it('accepts a populated index with file summaries and chunks', () => {
    const chunks = chunkMarkdown(NESTED_FIXTURE, 'guide.md');
    const index = {
      jigFormat: 1,
      root: '/repo/docs',
      clampedAt: '2026-09-05T00:00:00.000Z',
      files: [{ file: 'guide.md', kind: 'md', chunks: chunks.length }],
      chunks,
    };
    expect(() => DocsIndexSchema.parse(index)).not.toThrow();
  });

  it('rejects an unknown file kind', () => {
    const index = emptyDocsIndex('/repo/docs');
    const bad = { ...index, files: [{ file: 'a.docx', kind: 'docx', chunks: 0 }] };
    expect(() => DocsIndexSchema.parse(bad)).toThrow();
  });
});
