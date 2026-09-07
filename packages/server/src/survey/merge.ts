import { JIG_FORMAT, stubSurvey, type NamedSchema, type Survey } from '@jigbench/core';

export interface AdapterSurveyResult {
  name: string;
  survey: Survey;
}

/** `schemas` from every adapter, namespaced by adapter name (`"dotnet.InvoiceDto"`) only for
 * a `schemaRef` that more than one adapter produced — an unambiguous name is left alone. */
function mergeSchemas(results: AdapterSurveyResult[]): NamedSchema[] {
  const countByRef = new Map<string, number>();
  for (const { survey } of results) {
    for (const schema of survey.schemas) {
      countByRef.set(schema.schemaRef, (countByRef.get(schema.schemaRef) ?? 0) + 1);
    }
  }

  const merged: NamedSchema[] = [];
  for (const { name, survey } of results) {
    for (const schema of survey.schemas) {
      const collides = (countByRef.get(schema.schemaRef) ?? 0) > 1;
      merged.push(collides ? { ...schema, schemaRef: `${name}.${schema.schemaRef}` } : schema);
    }
  }
  return merged;
}

/**
 * Combines every detected adapter's own Survey into the one core `Survey` `.jig/survey/
 * survey.json` records. `stub` is true only when nothing real came back at all: no adapter
 * detected the repo, or every adapter that ran is itself a stub (e.g. dotnet's regex-lite
 * tier with no Angular app alongside it) — the moment ANY adapter contributes real data,
 * the merged survey is real too, even if a sibling adapter is still a stub.
 *
 * S16 (AMENDMENT-1 §6/A5): the generic `web` adapter is the fallback that matches almost any
 * web codebase, so its own `stack`/`components`/`routes`/`schemas` contribution YIELDS the
 * moment any OTHER (real stack) adapter has also matched — it never crowds `stack` with 'web'
 * alongside a real stack name, and never pads `components`/`routes` with the empty arrays it
 * always produces anyway. `web`'s per-adapter meta entry (its `appRoot`/`source`, and any
 * `devServer`/`frameworks` hints) is NEVER dropped, though — it still lands in the merged
 * `adapters` array unconditionally, which is how `serve.ts`'s `--target` inference and the
 * survey command's human summary ("web: <root> (css/scss scan)") read it regardless of
 * whether a stack adapter also matched. Order of `results` doesn't matter: `web` yields
 * whenever ANY entry named something other than `'web'` is present, not just when it comes
 * first or last.
 */
export function mergeSurveys(results: AdapterSurveyResult[]): Survey {
  if (results.length === 0) return stubSurvey();

  const hasStackAdapter = results.some((r) => r.name !== 'web');
  const contributesStack = (r: AdapterSurveyResult) => !(hasStackAdapter && r.name === 'web');
  const stackContributors = results.filter(contributesStack);

  const stack = [...new Set(stackContributors.flatMap((r) => r.survey.stack))];
  const allStub = results.every((r) => r.survey.stub === true);

  return {
    jigFormat: JIG_FORMAT,
    stack,
    components: stackContributors.flatMap((r) => r.survey.components),
    routes: stackContributors.flatMap((r) => r.survey.routes),
    endpoints: stackContributors.flatMap((r) => r.survey.endpoints),
    schemas: mergeSchemas(stackContributors),
    docs: [],
    generatedAt: new Date().toISOString(),
    stub: allStub,
    adapters: results.flatMap((r) => r.survey.adapters ?? []),
  };
}
