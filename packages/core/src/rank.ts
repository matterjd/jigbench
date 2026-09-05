import type { DocChunk } from './docs.js';

/**
 * A pure, deterministic BM25-lite keyword ranker (S2b, CONTEXT.md decision 17: "keyword
 * rank for v0.1; embeddings later"). No I/O, no dictionaries loaded from disk — just a
 * tokenizer with a tiny stopword list and simple suffix stemming, and the classic BM25
 * scoring formula over whatever chunks the caller hands in.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'and', 'or', 'is', 'are', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'for', 'on', 'with', 'as', 'at', 'by',
  'from', 'was', 'were', 'has', 'have', 'had', 'not', 'no', 'but', 'if', 'then', 'so',
  'than', 'into', 'about', 'over', 'under', 'after', 'before', 'can', 'will', 'your',
  'you', 'we', 'our', 'their', 'his', 'her', 'they', 'which', 'what', 'who', 'when',
  'where', 'how', 'do', 'does', 'did', 'i', 'me', 'my', 'all', 'any', 'each',
]);

/** Simple suffix stemming — plural -s, -ing, -ed only, guarded by a minimum length so
 * short words ("is", "as", "bus") are never mangled. Not a real stemmer (no Porter
 * algorithm, no exceptions table) — good enough to match "invoice"/"invoices" and
 * "bill"/"billing" against each other, which is all v1 keyword rank needs. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lowercase, alnum-only tokens, stopwords dropped, then stemmed. */
export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tokens: string[] = [];
  for (const word of raw) {
    if (STOPWORDS.has(word)) continue;
    tokens.push(stem(word));
  }
  return tokens;
}

export interface RankIndex {
  chunks: DocChunk[];
  docLengths: number[];
  avgDocLength: number;
  /** term -> number of documents containing it at least once */
  termDocFreq: Map<string, number>;
  /** per-document term -> frequency-in-that-document map, same order as `chunks` */
  termFreqByDoc: Map<string, number>[];
  n: number;
}

/** Build a ranking index over a set of chunks. Pure — same input always yields the same
 * index, and `chunks` may be empty (an honestly-empty `DocsIndex` is not an error). */
export function buildIndex(chunks: readonly DocChunk[]): RankIndex {
  const tokenized = chunks.map((c) => tokenize(c.text));
  const termFreqByDoc = tokenized.map((tokens) => {
    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    return freq;
  });
  const docLengths = tokenized.map((tokens) => tokens.length);
  const n = chunks.length;
  const avgDocLength = n === 0 ? 0 : docLengths.reduce((a, b) => a + b, 0) / n;

  const termDocFreq = new Map<string, number>();
  for (const freq of termFreqByDoc) {
    for (const term of freq.keys()) {
      termDocFreq.set(term, (termDocFreq.get(term) ?? 0) + 1);
    }
  }

  return { chunks: [...chunks], docLengths, avgDocLength, termDocFreq, termFreqByDoc, n };
}

const K1 = 1.5;
const B = 0.75;

export interface RankedChunk {
  chunk: DocChunk;
  score: number;
}

/**
 * Score every chunk in `index` against `query` with BM25 and return the top `k`,
 * highest score first. Ties break deterministically on `file` then `startLine` (both
 * ascending) so the same index + query always returns the same order. An empty index
 * (no chunks at all) returns `[]` — never throws.
 */
export function retrieve(index: RankIndex, query: string, k = 5): RankedChunk[] {
  if (index.n === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const uniqueQueryTerms = new Set(queryTerms);
  const scores = new Array<number>(index.n).fill(0);

  for (const term of uniqueQueryTerms) {
    const df = index.termDocFreq.get(term);
    if (!df) continue;
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));

    for (let d = 0; d < index.n; d++) {
      const tf = index.termFreqByDoc[d]!.get(term);
      if (!tf) continue;
      const docLen = index.docLengths[d]!;
      const denom = tf + K1 * (1 - B + (B * docLen) / (index.avgDocLength || 1));
      scores[d]! += idf * ((tf * (K1 + 1)) / denom);
    }
  }

  const ranked: RankedChunk[] = index.chunks.map((chunk, i) => ({ chunk, score: scores[i]! }));
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const byFile = a.chunk.file.localeCompare(b.chunk.file);
    if (byFile !== 0) return byFile;
    return a.chunk.startLine - b.chunk.startLine;
  });

  return ranked.slice(0, k);
}
