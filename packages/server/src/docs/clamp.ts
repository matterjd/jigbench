import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import {
  JIG_FORMAT,
  chunkMarkdown,
  chunkPlain,
  jigPaths,
  type DocChunk,
  type DocFileSummary,
  type DocKind,
  type DocsIndex,
} from '@jigbench/core';
import { atomicWriteFile } from '../atomic-write.js';
import { extractPdfText } from './pdf.js';

export interface ClampDocsOptions {
  repoRoot: string;
  folder: string;
}

export interface ClampDocsResult {
  index: DocsIndex;
  /** Absolute path to the `.jig/survey/docs.json` this clamp just wrote. */
  file: string;
  /** Sorted, unique, human-readable extensions this clamp saw but did not read —
   * `'(no extension)'` stands in for a file with no extension at all. */
  ignoredExtensions: string[];
}

const SKIP_DIRS = new Set(['node_modules', '.git']);
const NO_EXTENSION_LABEL = '(no extension)';
const NO_TEXT_MESSAGE = 'no extractable text · scanned?';

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

/** Repo-relative when `absoluteFile` is inside `repoRoot`; the absolute path otherwise
 * (an out-of-repo docs folder). Either way, forward slashes — these are logical
 * provenance paths, not OS paths (paths.ts's convention). */
function computeFileRef(repoRoot: string, absoluteFile: string): string {
  const rel = relative(repoRoot, absoluteFile);
  const isInside = rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
  return toPosix(isInside ? rel : absoluteFile);
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      await walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
}

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function noExtractableTextChunk(file: string): DocChunk {
  return {
    id: `${file}#L1-1`,
    file,
    headingPath: [],
    startLine: 1,
    endLine: 1,
    text: NO_TEXT_MESSAGE,
    words: countWords(NO_TEXT_MESSAGE),
  };
}

function kindForExtension(ext: string): DocKind | null {
  if (ext === '.md' || ext === '.markdown') return 'md';
  if (ext === '.txt') return 'txt';
  if (ext === '.pdf') return 'pdf';
  return null;
}

/**
 * `jigbench clamp --docs <folder>` (EXECUTION-PLAN.md §4 S2b, CONTEXT.md decision 17).
 * Walks `folder` (skipping `node_modules`, `.git`, and any hidden directory), reads every
 * markdown/text/PDF file it finds, chunks it with core's pure chunkers, and writes
 * `.jig/survey/docs.json` atomically. A folder with nothing readable in it is not an
 * error — the honest answer is an empty index, same as `runSurvey`'s stub-on-nothing-found
 * pattern.
 */
export async function clampDocs(options: ClampDocsOptions): Promise<ClampDocsResult> {
  const { repoRoot } = options;
  const folder = resolvePath(options.folder);

  const stats = await stat(folder).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`docs folder not found (or not a directory): ${folder}`);
  }

  const allFiles: string[] = [];
  await walk(folder, allFiles);
  allFiles.sort();

  const files: DocFileSummary[] = [];
  const chunks: DocChunk[] = [];
  const ignored = new Set<string>();

  for (const absoluteFile of allFiles) {
    const ext = extname(absoluteFile).toLowerCase();
    const kind = kindForExtension(ext);

    if (!kind) {
      ignored.add(ext || NO_EXTENSION_LABEL);
      continue;
    }

    const fileRef = computeFileRef(repoRoot, absoluteFile);

    let fileChunks: DocChunk[];
    if (kind === 'md') {
      fileChunks = chunkMarkdown(await readFile(absoluteFile, 'utf8'), fileRef);
    } else if (kind === 'txt') {
      fileChunks = chunkPlain(await readFile(absoluteFile, 'utf8'), fileRef);
    } else {
      const text = await extractPdfText(await readFile(absoluteFile));
      fileChunks = text.trim().length === 0 ? [noExtractableTextChunk(fileRef)] : chunkPlain(text, fileRef);
    }

    files.push({ file: fileRef, kind, chunks: fileChunks.length });
    chunks.push(...fileChunks);
  }

  const index: DocsIndex = {
    jigFormat: JIG_FORMAT,
    root: toPosix(folder),
    clampedAt: new Date().toISOString(),
    files,
    chunks,
  };

  const paths = jigPaths(repoRoot);
  const outFile = join(paths.survey, 'docs.json');
  await atomicWriteFile(outFile, JSON.stringify(index, null, 2) + '\n');

  return { index, file: outFile, ignoredExtensions: [...ignored].sort() };
}
