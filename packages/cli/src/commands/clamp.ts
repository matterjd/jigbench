import { clampDocs } from '@jigbench/server';
import { resolveRepoRoot } from '../repo-root.js';

export interface ClampCommandOptions {
  repo?: string;
  docs: string;
}

export interface ClampCommandResult {
  message: string;
}

/**
 * `jigbench clamp --docs <folder>` (EXECUTION-PLAN.md §4 S2b). Prints a one-screen
 * summary — files by kind, chunk counts, any ignored extensions, and where the index
 * landed. A folder with nothing readable in it says so plainly and still exits 0; it is
 * an honest empty result, not a failure.
 */
export async function runClampCommand(options: ClampCommandOptions): Promise<ClampCommandResult> {
  const repoRoot = resolveRepoRoot(options.repo);
  const { index, file, ignoredExtensions } = await clampDocs({ repoRoot, folder: options.docs });

  const ignoredLine =
    ignoredExtensions.length > 0 ? `Ignored extensions: ${ignoredExtensions.join(', ')}` : undefined;

  if (index.files.length === 0) {
    const lines = [`No docs found under: ${options.docs}`];
    if (ignoredLine) lines.push(ignoredLine);
    return { message: lines.join('\n') };
  }

  const byKind = new Map<string, { files: number; chunks: number }>();
  for (const summary of index.files) {
    const entry = byKind.get(summary.kind) ?? { files: 0, chunks: 0 };
    entry.files += 1;
    entry.chunks += summary.chunks;
    byKind.set(summary.kind, entry);
  }
  const totalChunks = index.files.reduce((sum, f) => sum + f.chunks, 0);

  const lines = [
    `Clamped docs: ${options.docs}`,
    ...[...byKind.entries()].map(
      ([kind, { files, chunks }]) =>
        `  ${kind}: ${files} file${files === 1 ? '' : 's'}, ${chunks} chunk${chunks === 1 ? '' : 's'}`,
    ),
    `Total: ${index.files.length} file${index.files.length === 1 ? '' : 's'}, ${totalChunks} chunk${totalChunks === 1 ? '' : 's'}`,
    ignoredLine ?? 'No unsupported files skipped.',
    `Wrote: ${file}`,
  ];

  return { message: lines.join('\n') };
}
