import { dirname, join } from 'node:path';
import { ArrayLiteralExpression, Node, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import type { Component, Route } from '@jigbench/core';
import { angularSourceGlobs, createAngularProject, toRepoRelative } from './ts-project.js';

/** Join a parent route path with a child's, the way Angular's router does: neither side is
 * assumed to carry the `/` — an empty parent or child collapses away rather than producing a
 * doubled or dangling slash. */
export function joinRoutePath(parent: string, child: string): string {
  const segments = [parent, child].map((s) => s.replace(/^\/+|\/+$/g, '')).filter((s) => s.length > 0);
  return segments.join('/');
}

function findComponentClassName(value: Node): string | undefined {
  // `component: SomeComponent`
  if (Node.isIdentifier(value)) return value.getText();
  return undefined;
}

/** `loadComponent: () => import('./x').then((m) => m.SomeComponent)` — pulls the dynamic
 * import's module specifier and the `.then()` arrow's returned member name. Returns
 * `undefined` for any shape it doesn't recognize rather than guessing. */
function parseLoadComponent(value: Node): { specifier: string; className: string } | undefined {
  if (!Node.isArrowFunction(value)) return undefined;
  const body = value.getBody();

  // Body can be `import('./x').then(...)` directly, or a block `{ return import('./x').then(...); }`.
  let expr: Node | undefined = body;
  if (Node.isBlock(body)) {
    const ret = body.getStatements().find(Node.isReturnStatement);
    expr = ret?.getExpression();
  }
  if (!expr || !Node.isCallExpression(expr)) return undefined;

  const thenCallee = expr.getExpression();
  if (!Node.isPropertyAccessExpression(thenCallee) || thenCallee.getName() !== 'then') return undefined;

  const importCall = thenCallee.getExpression();
  // Dynamic `import(...)` is represented differently across TS AST versions (a
  // CallExpression over an ImportExpression node, or a keyword-expression call) — a text
  // check is the one thing that's stable across all of them.
  if (!Node.isCallExpression(importCall) || !importCall.getText().startsWith('import(')) {
    return undefined;
  }
  const specArg = importCall.getArguments()[0];
  if (!specArg || !Node.isStringLiteral(specArg)) return undefined;

  const thenArg = expr.getArguments()[0];
  if (!thenArg || !Node.isArrowFunction(thenArg)) return undefined;
  const thenBody = thenArg.getBody();
  const memberExpr = Node.isBlock(thenBody)
    ? thenBody.getStatements().find(Node.isReturnStatement)?.getExpression()
    : thenBody;
  if (!memberExpr || !Node.isPropertyAccessExpression(memberExpr)) return undefined;

  return { specifier: specArg.getLiteralText(), className: memberExpr.getName() };
}

function resolveFile(
  appRoot: string,
  routesFilePath: string,
  className: string,
  specifier: string | undefined,
  components: Component[],
): string {
  const byName = components.find((c) => c.name === className);
  if (byName) return byName.file;
  if (specifier) {
    const abs = join(dirname(routesFilePath), specifier) + '.ts';
    return toRepoRelative(appRoot, abs.replace(/\\/g, '/'));
  }
  return '';
}

function collectRoutes(
  appRoot: string,
  routesFile: SourceFile,
  array: ArrayLiteralExpression,
  components: Component[],
  parentPath: string,
): Route[] {
  const results: Route[] = [];

  for (const el of array.getElements()) {
    if (!Node.isObjectLiteralExpression(el)) continue;
    const obj: ObjectLiteralExpression = el;

    const pathProp = obj.getProperty('path');
    const pathInit =
      pathProp && Node.isPropertyAssignment(pathProp) ? pathProp.getInitializer() : undefined;
    const pathValue = pathInit && Node.isStringLiteral(pathInit) ? pathInit.getLiteralText() : undefined;
    const fullPath = joinRoutePath(parentPath, pathValue ?? '');

    const componentProp = obj.getProperty('component');
    const loadComponentProp = obj.getProperty('loadComponent');
    const childrenProp = obj.getProperty('children');

    if (componentProp && Node.isPropertyAssignment(componentProp)) {
      const init = componentProp.getInitializer();
      const className = init ? findComponentClassName(init) : undefined;
      if (className) {
        results.push({
          path: fullPath,
          component: className,
          file: resolveFile(appRoot, routesFile.getFilePath(), className, undefined, components),
        });
      }
    }

    if (loadComponentProp && Node.isPropertyAssignment(loadComponentProp)) {
      const init = loadComponentProp.getInitializer();
      const parsed = init ? parseLoadComponent(init) : undefined;
      if (parsed) {
        results.push({
          path: fullPath,
          component: parsed.className,
          file: resolveFile(appRoot, routesFile.getFilePath(), parsed.className, parsed.specifier, components),
        });
      }
    }

    if (childrenProp && Node.isPropertyAssignment(childrenProp)) {
      const init = childrenProp.getInitializer();
      if (init && Node.isArrayLiteralExpression(init)) {
        results.push(...collectRoutes(appRoot, routesFile, init, components, fullPath));
      }
    }
  }

  return results;
}

/** `routes` from `*.routes.ts` (which also matches `app.routes.ts`) and `app.config.ts`:
 * finds every `const x: Routes = [...]` array literal and flattens it (children included,
 * full paths) into core `Route` entries. Redirect-only entries (`redirectTo`, no
 * `component`/`loadComponent`) are skipped — there is no component to point at. */
export async function surveyRoutes(appRoot: string, components: Component[]): Promise<Route[]> {
  const project = createAngularProject();
  project.addSourceFilesAtPaths(angularSourceGlobs(appRoot));

  const routes: Route[] = [];
  const seen = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    const path = sourceFile.getFilePath();
    if (!path.endsWith('.routes.ts') && !path.endsWith('app.config.ts')) continue;

    for (const decl of sourceFile.getVariableDeclarations()) {
      const typeNode = decl.getTypeNode();
      const isRoutesTyped = typeNode?.getText() === 'Routes';
      const init = decl.getInitializer();
      if (!isRoutesTyped || !init || !Node.isArrayLiteralExpression(init)) continue;

      const key = `${path}#${decl.getName()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      routes.push(...collectRoutes(appRoot, sourceFile, init, components, ''));
    }
  }

  return routes;
}
