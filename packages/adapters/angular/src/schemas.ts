import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createGenerator } from 'ts-json-schema-generator';
import type { NamedSchema } from '@jigbench/core';
import { angularSourceGlobs, createAngularProject } from './ts-project.js';

function isModelFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return /\/models\//.test(normalized) || /\.model\.ts$/.test(normalized);
}

function findTsconfig(appRoot: string): string | undefined {
  for (const candidate of ['tsconfig.app.json', 'tsconfig.json']) {
    const full = join(appRoot, candidate);
    if (existsSync(full)) return full;
  }
  return undefined;
}

/** One JSON Schema per exported interface/type alias in any file under a `models` directory,
 * or named `<name>.model.ts`, via `ts-json-schema-generator`. `type: '*'` (generate-
 * everything mode) drops types silently in this generator version when a file exports more
 * than a couple of interconnected types (verified against this exact fixture) — so each
 * exported type is requested by name instead, one `createSchema()` call per name off a
 * shared generator. */
export async function surveySchemas(appRoot: string): Promise<NamedSchema[]> {
  const project = createAngularProject();
  project.addSourceFilesAtPaths(angularSourceGlobs(appRoot));

  const modelFiles = project.getSourceFiles().filter((sf) => isModelFile(sf.getFilePath()));
  if (modelFiles.length === 0) return [];

  const tsconfig = findTsconfig(appRoot);
  const results: NamedSchema[] = [];

  for (const sourceFile of modelFiles) {
    const typeNames = [
      ...sourceFile
        .getInterfaces()
        .filter((i) => i.isExported())
        .map((i) => i.getName()),
      ...sourceFile
        .getTypeAliases()
        .filter((t) => t.isExported())
        .map((t) => t.getName()),
    ];
    if (typeNames.length === 0) continue;

    const generator = createGenerator({
      path: sourceFile.getFilePath(),
      tsconfig,
      expose: 'export',
      topRef: false,
      skipTypeCheck: true,
    });

    for (const typeName of typeNames) {
      try {
        const schema = generator.createSchema(typeName) as Record<string, unknown>;
        results.push({ schemaRef: typeName, schema });
      } catch {
        // A shape ts-json-schema-generator can't express (e.g. a function type) is skipped
        // rather than guessed at — never a fabricated schema.
      }
    }
  }

  return results;
}
