import { buildIndex, retrieve, type DocChunk, type DocsIndex } from '@jigbench/core';

/**
 * The seam S5's drafter calls (EXECUTION-PLAN.md §4 S2b: "the drafter's context builder
 * ranks chunks by keyword overlap with the mark and the app's surveyed names"). Ranks a
 * `DocsIndex`'s chunks against the mark's prompt PLUS whatever component/route names the
 * survey already found — so a mark on `InvoiceListComponent` pulls in docs that mention
 * "invoice" even when the prompt itself never says the word — then trims to a word
 * budget so the result fits inside a model's context window. Chunks are added whole,
 * best match first among those that still fit; a chunk is never split mid-sentence, and
 * a later, smaller chunk can still make it in even when a better-ranked one didn't fit.
 */

export interface DocsContextChunk {
  file: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  text: string;
  score: number;
  /** e.g. "billing.md > Billing > Due dates (lines 10-14)" — ready to print next to the
   * chunk's text so a human (or the model) can see exactly where it came from. */
  provenance: string;
}

export interface DocsContext {
  chunks: DocsContextChunk[];
  totalWords: number;
}

function provenanceLine(chunk: DocChunk): string {
  const breadcrumb = chunk.headingPath.length > 0 ? ` > ${chunk.headingPath.join(' > ')}` : '';
  return `${chunk.file}${breadcrumb} (lines ${chunk.startLine}-${chunk.endLine})`;
}

export function contextForPrompt(
  index: DocsIndex,
  prompt: string,
  surveyNames: readonly string[],
  budgetWords: number,
): DocsContext {
  if (index.chunks.length === 0 || budgetWords <= 0) {
    return { chunks: [], totalWords: 0 };
  }

  const rankIndex = buildIndex(index.chunks);
  const query = [prompt, ...surveyNames].join(' ');
  const ranked = retrieve(rankIndex, query, index.chunks.length);

  const chunks: DocsContextChunk[] = [];
  let totalWords = 0;

  for (const { chunk, score } of ranked) {
    if (totalWords + chunk.words > budgetWords) continue; // doesn't fit; a smaller one might
    chunks.push({
      file: chunk.file,
      headingPath: chunk.headingPath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text,
      score,
      provenance: provenanceLine(chunk),
    });
    totalWords += chunk.words;
  }

  return { chunks, totalWords };
}
