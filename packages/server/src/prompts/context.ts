import { dirname, posix } from 'node:path';
import { contextForPrompt } from '../docs/context.js';
import type { Component, DocsIndex, GaugeSet, PromptContext, PromptTarget, Survey } from '@jigbench/core';
import { emptyPromptContext } from '@jigbench/core';

/**
 * S11 `PromptService.ready()`: "regenerates the context block from the survey/docs at that
 * moment." Deliberately its own small module rather than reusing `orders/shop-face.ts`'s
 * `findComponent`/`nounsFrom` (private to that file, and `orders/*` is out of scope for this
 * slice) — a little duplication here buys total isolation from the two fix-worker branches
 * touching other parts of `orders`/`mcp`.
 */

export interface BuildPromptContextInput {
  survey: Survey;
  gauges: GaugeSet;
  docsIndex?: DocsIndex;
  target: PromptTarget;
  /** What to rank docs/endpoints against — usually `${requirement} ${acceptance.join(' ')}`. */
  queryText: string;
}

const DOCS_WORD_BUDGET = 600;

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function resolveRelative(componentFile: string, rel: string): string {
  return toPosix(posix.normalize(posix.join(dirname(toPosix(componentFile)), rel)));
}

function findComponent(survey: Survey, target: PromptTarget): Component | undefined {
  if (target.component) {
    const byName = survey.components.find((c) => c.name === target.component);
    if (byName) return byName;
  }
  if (target.file) {
    const byFile = survey.components.find((c) => c.file === target.file);
    if (byFile) return byFile;
  }
  return undefined;
}

function nounsFrom(...texts: (string | undefined)[]): string[] {
  const nouns = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const words = text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/)
      .map((w) => w.toLowerCase());
    for (const w of words) {
      if (w.length > 2 && w !== 'component') nouns.add(w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w);
    }
  }
  return [...nouns];
}

/** Pure — no I/O of its own; the caller (`PromptService.ready`) hands in the survey/gauges/
 * docs index it already has. Never throws: an unmatched target just yields a context with
 * fewer sections filled in, never an error — the same "honest, not helpful" posture
 * `shop-face.ts` documents for the same situation. */
export function buildPromptContext(input: BuildPromptContextInput): PromptContext {
  const context: PromptContext = emptyPromptContext();
  const component = findComponent(input.survey, input.target);
  const files = new Set<string>();

  if (component) {
    context.components.push({ name: component.name, selector: component.selector, file: component.file });
    files.add(component.file);
    if (!component.inline && component.templateUrl) files.add(resolveRelative(component.file, component.templateUrl));
    for (const styleUrl of component.styleUrls) files.add(resolveRelative(component.file, styleUrl));

    for (const route of input.survey.routes.filter((r) => r.component === component.name)) {
      context.routes.push({ path: route.path, component: route.component, file: route.file });
    }
  } else if (input.target.file) {
    files.add(input.target.file);
  }
  context.files = [...files].sort();

  for (const gauge of input.gauges.gauges) {
    if ((gauge.usages ?? []).some((u) => files.has(u.file))) {
      context.gauges.push({ name: gauge.name, value: gauge.$value, category: gauge.category });
    }
  }

  const nouns = nounsFrom(component?.name, component?.selector, input.queryText);
  for (const ep of input.survey.endpoints) {
    const haystack = `${ep.path} ${ep.operationId ?? ''}`.toLowerCase();
    if (nouns.some((n) => haystack.includes(n))) {
      context.endpoints.push({ method: ep.method, path: ep.path, file: ep.file });
    }
  }

  if (input.docsIndex) {
    const docsContext = contextForPrompt(input.docsIndex, input.queryText, nouns, DOCS_WORD_BUDGET);
    context.docs = docsContext.chunks.map((c) => ({ provenance: c.provenance, text: c.text }));
  }

  return context;
}
