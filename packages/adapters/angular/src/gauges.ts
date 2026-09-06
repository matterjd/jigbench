import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { categorizeGauge, JIG_FORMAT, type Gauge, type GaugeCategory, type GaugeSet } from '@jigbench/core';
import { toRepoRelative } from './ts-project.js';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.git']);

async function findStyleFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findStyleFiles(full)));
    } else if (entry.name.endsWith('.scss') || entry.name.endsWith('.css')) {
      files.push(full);
    }
  }
  return files;
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function dtcgType(category: GaugeCategory): string {
  switch (category) {
    case 'colour':
      return 'color';
    case 'shadow':
      return 'shadow';
    case 'motion':
      return 'duration';
    case 'z':
      return 'number';
    case 'radius':
    case 'space':
      return 'dimension';
    case 'type':
    default:
      return 'string';
  }
}

interface Declaration {
  name: string; // '--ledger-color-accent' or '$ledger-color-paper'
  value: string;
  file: string; // absolute
  line: number;
}

const CSS_VAR_DECL_RE = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
const SCSS_VAR_DECL_RE = /^\s*\$([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/gm;

function findDeclarations(file: string, text: string): Declaration[] {
  const decls: Declaration[] = [];

  for (const m of text.matchAll(CSS_VAR_DECL_RE)) {
    decls.push({ name: `--${m[1]}`, value: m[2].trim(), file, line: lineAt(text, m.index) });
  }
  for (const m of text.matchAll(SCSS_VAR_DECL_RE)) {
    decls.push({ name: `$${m[1]}`, value: m[2].trim(), file, line: lineAt(text, m.index) });
  }

  return decls;
}

/** Count usages of one gauge (`var(--name)` for a CSS custom property, `$name` for an SCSS
 * variable — never the declaration line itself) across every style file, grouped by file. */
function countUsages(
  gaugeName: string,
  declaration: Declaration,
  files: Array<{ file: string; text: string }>,
): Array<{ file: string; count: number }> {
  const isCssVar = gaugeName.startsWith('--');
  const bareName = isCssVar ? gaugeName.slice(2) : gaugeName.slice(1);
  const escaped = bareName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = isCssVar
    ? new RegExp(`var\\(\\s*--${escaped}\\s*\\)`, 'g')
    : new RegExp(`\\$${escaped}(?![\\w-])`, 'g');

  const usages: Array<{ file: string; count: number }> = [];

  for (const { file, text } of files) {
    const lines = text.split('\n');
    if (file === declaration.file) {
      // Never count the declaration's own line as a usage of itself.
      lines[declaration.line - 1] = '';
    }
    const scanned = lines.join('\n');
    const matches = scanned.match(pattern);
    if (matches && matches.length > 0) {
      usages.push({ file, count: matches.length });
    }
  }

  return usages;
}

/** Every CSS custom property (`--name`, declared in `:root` or any other selector) and every
 * SCSS variable (`$name`) under an Angular app's `src/`, as DTCG-shaped gauges — plus a
 * usages map (which files reference each one, and how many times) so the S4 gauges panel can
 * light instances. */
export async function surveyGauges(appRoot: string): Promise<GaugeSet> {
  const srcDir = join(appRoot, 'src');
  const styleFiles = await findStyleFiles(srcDir);
  const files = await Promise.all(
    styleFiles.map(async (file) => ({ file, text: await readFile(file, 'utf8') })),
  );

  const firstDeclaration = new Map<string, Declaration>();
  for (const { file, text } of files) {
    for (const decl of findDeclarations(file, text)) {
      if (!firstDeclaration.has(decl.name)) firstDeclaration.set(decl.name, decl);
    }
  }

  const gauges: Gauge[] = [];
  for (const [name, decl] of firstDeclaration) {
    const category = categorizeGauge(name, decl.value);
    const usages = countUsages(name, decl, files).map((u) => ({
      file: toRepoRelative(appRoot, u.file),
      count: u.count,
    }));

    gauges.push({
      name,
      $type: dtcgType(category),
      $value: decl.value,
      category,
      source: { file: toRepoRelative(appRoot, decl.file), line: decl.line },
      usages,
    });
  }

  return {
    jigFormat: JIG_FORMAT,
    gauges,
    generatedAt: new Date().toISOString(),
  };
}
