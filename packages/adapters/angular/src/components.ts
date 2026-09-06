import {
  ClassDeclaration,
  Node,
  ObjectLiteralExpression,
  PropertyDeclaration,
  SyntaxKind,
} from 'ts-morph';
import type { Component, ComponentProperty } from '@jigbench/core';
import { angularSourceGlobs, createAngularProject, toRepoRelative } from './ts-project.js';

function objectLiteralArg(cls: ClassDeclaration): ObjectLiteralExpression | undefined {
  const dec = cls.getDecorator('Component');
  const arg = dec?.getArguments()[0];
  return arg && Node.isObjectLiteralExpression(arg) ? arg : undefined;
}

function stringProp(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (!prop || !Node.isPropertyAssignment(prop)) return undefined;
  const init = prop.getInitializer();
  return init && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

function boolProp(obj: ObjectLiteralExpression, name: string): boolean | undefined {
  const prop = obj.getProperty(name);
  if (!prop || !Node.isPropertyAssignment(prop)) return undefined;
  const init = prop.getInitializer();
  if (!init) return undefined;
  if (init.getKind() === SyntaxKind.TrueKeyword) return true;
  if (init.getKind() === SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function stringArrayProp(obj: ObjectLiteralExpression, name: string): string[] {
  const prop = obj.getProperty(name);
  if (!prop || !Node.isPropertyAssignment(prop)) return [];
  const init = prop.getInitializer();
  if (!init || !Node.isArrayLiteralExpression(init)) return [];
  return init
    .getElements()
    .filter(Node.isStringLiteral)
    .map((el) => el.getLiteralText());
}

/** `styleUrl` (Angular 17+ singular) or `styleUrls` (array) — normalized to an array. */
function styleUrls(obj: ObjectLiteralExpression): string[] {
  const single = stringProp(obj, 'styleUrl');
  if (single !== undefined) return [single];
  return stringArrayProp(obj, 'styleUrls');
}

/** Identifies the callee of a signal-declaration call: `input()` / `input.required()` /
 * `model()` / `model.required()` / `output()`. Returns the base function name and whether it
 * was the `.required` variant, or `undefined` when the initializer isn't one of these calls. */
function signalCallee(init: Node): { base: 'input' | 'model' | 'output'; required: boolean } | undefined {
  if (!Node.isCallExpression(init)) return undefined;
  const callee = init.getExpression();

  if (Node.isIdentifier(callee)) {
    const name = callee.getText();
    if (name === 'input' || name === 'model' || name === 'output') {
      return { base: name, required: false };
    }
    return undefined;
  }

  if (Node.isPropertyAccessExpression(callee)) {
    const obj = callee.getExpression();
    const member = callee.getName();
    if (Node.isIdentifier(obj) && member === 'required') {
      const name = obj.getText();
      if (name === 'input' || name === 'model') return { base: name, required: true };
    }
    return undefined;
  }

  return undefined;
}

function decoratorFlag(prop: PropertyDeclaration, decoratorName: 'Input' | 'Output'): ComponentProperty | undefined {
  const dec = prop.getDecorator(decoratorName);
  if (!dec) return undefined;
  const name = prop.getName();
  if (decoratorName === 'Output') return { name, required: false };

  const arg = dec.getArguments()[0];
  if (arg && Node.isObjectLiteralExpression(arg)) {
    const required = boolProp(arg, 'required');
    return { name, required: required ?? false };
  }
  return { name, required: false };
}

function extractProperties(cls: ClassDeclaration): { inputs: ComponentProperty[]; outputs: ComponentProperty[] } {
  const inputs: ComponentProperty[] = [];
  const outputs: ComponentProperty[] = [];

  for (const prop of cls.getProperties()) {
    const asInput = decoratorFlag(prop, 'Input');
    if (asInput) inputs.push(asInput);
    const asOutput = decoratorFlag(prop, 'Output');
    if (asOutput) outputs.push(asOutput);
    if (asInput || asOutput) continue;

    const init = prop.getInitializer();
    if (!init) continue;
    const signal = signalCallee(init);
    if (!signal) continue;

    const name = prop.getName();
    if (signal.base === 'input') {
      inputs.push({ name, required: signal.required });
    } else if (signal.base === 'output') {
      outputs.push({ name, required: false });
    } else if (signal.base === 'model') {
      // A model() is a two-way binding: it is simultaneously an input and a
      // `<name>Change` output in Angular's own runtime — we surface both sides under the
      // same declared property name so a consumer can find either.
      inputs.push({ name, required: signal.required });
      outputs.push({ name, required: false });
    }
  }

  return { inputs, outputs };
}

/** Read every `@Component`-decorated class under `appRoot`. The Angular CLI (20.x, no
 * schematic suffix) no longer names files `*.component.ts` — every component in
 * `examples/ledger-angular` is a bare `<name>.ts` — so this walks every `.ts` file for the
 * decorator rather than filtering by filename, which is the only way this ever finds
 * anything against the real fixture. */
export async function surveyComponents(appRoot: string): Promise<Component[]> {
  const project = createAngularProject();
  project.addSourceFilesAtPaths(angularSourceGlobs(appRoot));

  const components: Component[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const obj = objectLiteralArg(cls);
      if (!obj) continue;

      const name = cls.getName();
      if (!name) continue;

      const selector = stringProp(obj, 'selector') ?? '';
      const templateUrl = stringProp(obj, 'templateUrl');
      const { inputs, outputs } = extractProperties(cls);

      components.push({
        name,
        selector,
        file: toRepoRelative(appRoot, sourceFile.getFilePath()),
        standalone: boolProp(obj, 'standalone') ?? true,
        inline: templateUrl === undefined,
        inputs,
        outputs,
        templateUrl,
        styleUrls: styleUrls(obj),
      });
    }
  }

  return components;
}
