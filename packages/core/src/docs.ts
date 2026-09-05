import { z } from 'zod';
import { JIG_FORMAT } from './jig-format.js';

/**
 * S2b — the docs clamp (`jigbench clamp --docs <folder>`, EXECUTION-PLAN.md §4 S2b,
 * CONTEXT.md decision 17). Pure, zero-I/O chunkers: given text already read from disk by
 * the caller (`server`), split it into heading- or paragraph-shaped sections with exact
 * line provenance. `server`'s `clampDocs` walks the folder, reads each file, and calls
 * these; `rank.ts` scores the resulting chunks against a query.
 */

export const DocChunkSchema = z.object({
  id: z.string(),
  /** Repo-relative when the clamped folder is inside the repo; absolute for an
   * out-of-repo folder. The base it was made relative to (or the folder itself, when
   * absolute) is recorded once on `DocsIndex.root` — never repeated per chunk. */
  file: z.string(),
  headingPath: z.array(z.string()),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string(),
  words: z.number().int().nonnegative(),
});
export type DocChunk = z.infer<typeof DocChunkSchema>;

export const DocKindSchema = z.enum(['md', 'txt', 'pdf']);
export type DocKind = z.infer<typeof DocKindSchema>;

export const DocFileSummarySchema = z.object({
  file: z.string(),
  kind: DocKindSchema,
  chunks: z.number().int().nonnegative(),
});
export type DocFileSummary = z.infer<typeof DocFileSummarySchema>;

export const DocsIndexSchema = z.object({
  jigFormat: z.literal(JIG_FORMAT),
  /** The clamped folder's own resolved path — always recorded, whether or not `file`
   * entries below could be made repo-relative. */
  root: z.string(),
  clampedAt: z.string(),
  files: z.array(DocFileSummarySchema),
  chunks: z.array(DocChunkSchema),
});
export type DocsIndex = z.infer<typeof DocsIndexSchema>;

/** An honest empty index — a clamped folder with nothing readable in it is not an error
 * (S2b acceptance: "a folder with no docs yields an empty, honest list"). */
export function emptyDocsIndex(root: string, clampedAt: string = new Date().toISOString()): DocsIndex {
  return { jigFormat: JIG_FORMAT, root, clampedAt, files: [], chunks: [] };
}

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function chunkId(file: string, startLine: number, endLine: number): string {
  return `${file}#L${startLine}-${endLine}`;
}

const ATX_HEADING_RE = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const FENCE_RE = /^ {0,3}(```+|~~~+)/;

interface OpenSection {
  headingPath: string[];
  /** 1-indexed line number of the first line that could belong to this section's body
   * (the line right after the heading that opened it, or line 1 for the preamble). */
  bodyStartLine: number;
  bodyLines: string[];
}

function sectionToChunk(open: OpenSection, file: string): DocChunk | null {
  const { bodyLines, headingPath, bodyStartLine } = open;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < bodyLines.length; i++) {
    if (bodyLines[i]!.trim().length > 0) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx === -1) return null; // no body content at all — never yield an empty chunk

  const startLine = bodyStartLine + firstIdx;
  const endLine = bodyStartLine + lastIdx;
  const text = bodyLines.slice(firstIdx, lastIdx + 1).join('\n');

  return {
    id: chunkId(file, startLine, endLine),
    file,
    headingPath: [...headingPath],
    startLine,
    endLine,
    text,
    words: countWords(text),
  };
}

/**
 * Split markdown into heading-shaped sections. One chunk per heading (any level), whose
 * `text` is the body between it and the next heading (of any level) or EOF — the heading
 * line itself is not repeated in `text` since `headingPath` already carries it. A `#`
 * inside a fenced code block (``` or ~~~, either delimiter, toggled open/closed) is never
 * treated as a heading. A section with no non-blank body content is dropped, not emitted
 * empty — but its title still becomes an ancestor in its children's `headingPath`.
 */
export function chunkMarkdown(text: string, file: string): DocChunk[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chunks: DocChunk[] = [];
  const headingStack: string[] = [];
  let inFence = false;
  let open: OpenSection = { headingPath: [], bodyStartLine: 1, bodyLines: [] };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i] ?? '';

    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      open.bodyLines.push(line);
      continue;
    }
    if (inFence) {
      open.bodyLines.push(line);
      continue;
    }

    const headingMatch = ATX_HEADING_RE.exec(line);
    if (headingMatch) {
      const chunk = sectionToChunk(open, file);
      if (chunk) chunks.push(chunk);

      const level = headingMatch[1]!.length;
      const title = (headingMatch[2] ?? '').trim();
      while (headingStack.length >= level) headingStack.pop();
      headingStack.push(title);

      open = { headingPath: [...headingStack], bodyStartLine: lineNo + 1, bodyLines: [] };
      continue;
    }

    open.bodyLines.push(line);
  }

  const last = sectionToChunk(open, file);
  if (last) chunks.push(last);

  return chunks;
}

const DEFAULT_PLAIN_CHUNK_WORDS = 200;

interface Paragraph {
  startLine: number;
  endLine: number;
  lines: string[];
}

/**
 * Split plain text into blank-line-separated paragraphs, then group whole paragraphs
 * together up to `wordsPerChunk` (default ~200) words per chunk — a paragraph is never
 * split across chunks, and a chunk that would otherwise be empty is never emitted. No
 * heading concept applies, so every chunk's `headingPath` is `[]`.
 */
export function chunkPlain(text: string, file: string, wordsPerChunk = DEFAULT_PLAIN_CHUNK_WORDS): DocChunk[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i] ?? '';
    if (line.trim().length === 0) {
      if (current) {
        paragraphs.push(current);
        current = null;
      }
      continue;
    }
    if (!current) current = { startLine: lineNo, endLine: lineNo, lines: [] };
    current.lines.push(line);
    current.endLine = lineNo;
  }
  if (current) paragraphs.push(current);

  const chunks: DocChunk[] = [];
  let group: Paragraph[] = [];
  let groupWords = 0;

  const flushGroup = () => {
    if (group.length === 0) return;
    const startLine = group[0]!.startLine;
    const endLine = group[group.length - 1]!.endLine;
    const groupText = group.map((p) => p.lines.join('\n')).join('\n\n');
    const words = countWords(groupText);
    group = [];
    groupWords = 0;
    if (words === 0) return; // never yield an empty chunk
    chunks.push({
      id: chunkId(file, startLine, endLine),
      file,
      headingPath: [],
      startLine,
      endLine,
      text: groupText,
      words,
    });
  };

  for (const para of paragraphs) {
    const paraWords = countWords(para.lines.join('\n'));
    if (paraWords === 0) continue;
    if (group.length > 0 && groupWords + paraWords > wordsPerChunk) {
      flushGroup();
    }
    group.push(para);
    groupWords += paraWords;
  }
  flushGroup();

  return chunks;
}
