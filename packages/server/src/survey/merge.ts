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
 */
export function mergeSurveys(results: AdapterSurveyResult[]): Survey {
  if (results.length === 0) return stubSurvey();

  const stack = [...new Set(results.flatMap((r) => r.survey.stack))];
  const allStub = results.every((r) => r.survey.stub === true);

  return {
    jigFormat: JIG_FORMAT,
    stack,
    components: results.flatMap((r) => r.survey.components),
    routes: results.flatMap((r) => r.survey.routes),
    endpoints: results.flatMap((r) => r.survey.endpoints),
    schemas: mergeSchemas(results),
    docs: [],
    generatedAt: new Date().toISOString(),
    stub: allStub,
    adapters: results.flatMap((r) => r.survey.adapters ?? []),
  };
}
