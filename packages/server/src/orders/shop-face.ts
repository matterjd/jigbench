import { dirname, posix } from 'node:path';
import type { Component, Endpoint, NamedSchema, Survey, WorkOrderHuman, WorkOrderShop } from '@jigbench/core';

/**
 * The translation layer (EXECUTION-PLAN.md §4 S5, concept B F6): deterministic first —
 * everything here is a fact the survey already proved, never a guess. `service.ts` calls
 * this on release, then may run one optional polish pass (`polishBrief`) that can only
 * REWRITE the brief paragraph this produces — it never touches `files`/`patterns`/`tests`.
 */

export interface ShopFaceInput {
  survey: Survey;
  componentName?: string;
  file?: string;
  human: WorkOrderHuman;
  /** Text scanned for keywords (e.g. "navigate") that decide whether a matched route's
   * file belongs in the shop face — usually `${human.what} ${human.why}`. */
  promptText: string;
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Joins a component's own file path with a `templateUrl`/`styleUrls` entry the way the
 * Angular compiler resolves them: relative to the component file's own directory. */
function resolveRelative(componentFile: string, rel: string): string {
  return toPosix(posix.normalize(posix.join(dirname(toPosix(componentFile)), rel)));
}

function findComponent(survey: Survey, componentName?: string, file?: string): Component | undefined {
  if (componentName) {
    const byName = survey.components.find((c) => c.name === componentName);
    if (byName) return byName;
  }
  if (file) {
    const byFile = survey.components.find((c) => c.file === file);
    if (byFile) return byFile;
  }
  return undefined;
}

function specFileFor(componentFile: string): string {
  return componentFile.replace(/\.ts$/, '.spec.ts');
}

const NAVIGATION_WORDS = /\b(navigat|route|routing|link|redirect|url\b)/i;

function mentionsNavigation(text: string): boolean {
  return NAVIGATION_WORDS.test(text);
}

/** camelCase/PascalCase name -> lowercase word set, e.g. "InvoiceListComponent" ->
 * ["invoice", "list"] — the shared vocabulary used to relate a pick to endpoints and
 * schemas the survey found under a completely different naming convention (C# vs TS). */
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

function matchingEndpoints(endpoints: readonly Endpoint[], nouns: readonly string[]): Endpoint[] {
  return endpoints.filter((ep) => {
    const haystack = `${ep.path} ${ep.operationId ?? ''}`.toLowerCase();
    return nouns.some((n) => haystack.includes(n));
  });
}

function matchingSchemas(schemas: readonly NamedSchema[], nouns: readonly string[]): NamedSchema[] {
  return schemas.filter((s) => nouns.some((n) => s.schemaRef.toLowerCase().includes(n)));
}

function endpointPattern(ep: Endpoint): string {
  const kind = ep.stub ? 'minimal-API stub (regex-lite fallback)' : 'minimal-API map';
  return `${ep.method.toUpperCase()} ${ep.path} — ${kind}`;
}

/** `Foo.cs` -> `FooTests.cs` beside it; anything else is returned with a `Tests` suffix
 * before its extension, a reasonable default for the one dotnet naming convention this
 * survey format actually records. */
function testFileFor(file: string): string {
  const match = /^(.*\/)?([^/]+)\.cs$/.exec(toPosix(file));
  if (!match) return file;
  const [, dir = '', name] = match;
  return `${dir}${name}Tests.cs`;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function buildBrief(input: ShopFaceInput, component: Component | undefined, endpoints: readonly Endpoint[]): string {
  const sentences: string[] = [];
  const what = input.human.what || 'the requested change';
  if (component) {
    sentences.push(
      `${what} on ${component.name} (<${component.selector}>, ${component.file}).`,
    );
  } else {
    sentences.push(`${what}. No surveyed component matched this mark's target — verify the file before starting.`);
  }
  if (input.human.why) sentences.push(input.human.why.endsWith('.') ? input.human.why : `${input.human.why}.`);
  if (endpoints.length > 0) {
    sentences.push(`Touches ${pluralize(endpoints.length, 'surveyed endpoint')}: ${endpoints.map((e) => `${e.method.toUpperCase()} ${e.path}`).join(', ')}.`);
  }
  sentences.push('Files, patterns and tests below are the translation layer’s read of the survey — the shop’s starting point, not a finished spec.');
  return sentences.join(' ');
}

export function buildShopFace(input: ShopFaceInput): WorkOrderShop {
  const component = findComponent(input.survey, input.componentName, input.file);
  const files = new Set<string>();
  const patterns: string[] = [];
  const tests = new Set<string>();

  if (component) {
    files.add(component.file);
    patterns.push(component.standalone ? 'standalone component' : 'NgModule-declared component (not standalone)');

    if (component.inline) {
      patterns.push('inline template');
    } else if (component.templateUrl) {
      files.add(resolveRelative(component.file, component.templateUrl));
    }
    for (const styleUrl of component.styleUrls) files.add(resolveRelative(component.file, styleUrl));

    if (component.inputs.length > 0) patterns.push(`${pluralize(component.inputs.length, 'typed input')}`);
    if (component.outputs.length > 0) patterns.push(`${pluralize(component.outputs.length, 'typed output')}`);

    const specFile = specFileFor(component.file);
    files.add(specFile);
    tests.add(`${specFile}: extend for — ${input.human.what || 'the requested change'}`);

    const routes = input.survey.routes.filter((r) => r.component === component.name);
    if (routes.length > 0 && mentionsNavigation(input.promptText)) {
      patterns.push(routes.length > 1 ? 'Angular Router routes' : 'Angular Router route');
      for (const r of routes) files.add(r.file);
    }
  } else {
    // Honest, not helpful: no surveyed file is added here — `input.file` is the pick's own
    // claim, unverified by the survey, and this layer never writes down a file it hasn't
    // proven belongs to the app.
    patterns.push('no surveyed component matched this mark — files below are a best guess from the survey alone');
  }

  const nouns = nounsFrom(component?.name, component?.selector, input.promptText);
  const endpoints = matchingEndpoints(input.survey.endpoints, nouns);
  for (const ep of endpoints) {
    if (ep.file) {
      files.add(ep.file);
      tests.add(testFileFor(ep.file));
    }
    patterns.push(endpointPattern(ep));
  }

  const schemas = matchingSchemas(input.survey.schemas, nouns);
  for (const s of schemas) {
    patterns.push(`${s.schemaRef} DTO (surveyed schema)`);
  }

  return {
    files: [...files].sort(),
    patterns: dedupe(patterns),
    tests: [...tests].sort(),
    brief: buildBrief(input, component, endpoints),
  };
}
