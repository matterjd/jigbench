import { Project, ScriptTarget } from 'ts-morph';

/**
 * A lightweight, type-checking-free ts-morph project. Every extraction this adapter does is
 * structural (decorator arguments, signal-call shapes, exported declaration names) — none of
 * it needs `@angular/core`'s real types resolved, so we skip `tsConfigFilePath` entirely
 * rather than pay for parsing the app's full dependency graph. `experimentalDecorators` is
 * required for `@Component(...)` to parse as a decorator at all.
 */
export function createAngularProject(): Project {
  return new Project({
    compilerOptions: {
      target: ScriptTarget.ES2022,
      experimentalDecorators: true,
      useDefineForClassFields: false,
    },
    skipFileDependencyResolution: true,
  });
}

const SKIP_SEGMENTS = ['node_modules', 'dist', '.angular'];

/** Glob patterns for every `.ts` source file under an Angular app root, excluding build
 * output, dependencies, and Karma spec files — passed straight to
 * `project.addSourceFilesAtPaths`. */
export function angularSourceGlobs(appRoot: string): string[] {
  const base = appRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return [
    `${base}/**/*.ts`,
    `!${base}/**/*.spec.ts`,
    ...SKIP_SEGMENTS.map((seg) => `!${base}/**/${seg}/**`),
  ];
}

export function toRepoRelative(appRoot: string, absolutePath: string): string {
  const base = appRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = absolutePath.replace(/\\/g, '/');
  return normalized.startsWith(`${base}/`) ? normalized.slice(base.length + 1) : normalized;
}
