import { describe, expect, it } from 'vitest';
import { JIG_FORMAT, stubSurvey, type Survey } from '@jigbench/core';
import { mergeSurveys } from './merge.js';

function surveyWith(partial: Partial<Survey>): Survey {
  return { ...stubSurvey(), stub: false, ...partial };
}

describe('mergeSurveys', () => {
  it('falls back to an honest stub when no adapter detected anything', () => {
    const merged = mergeSurveys([]);
    expect(merged.stub).toBe(true);
    expect(merged.jigFormat).toBe(JIG_FORMAT);
    expect(merged.components).toEqual([]);
  });

  it('concatenates stack/components/routes/endpoints across adapters', () => {
    const angular = surveyWith({
      stack: ['angular'],
      components: [
        {
          name: 'Foo',
          selector: 'app-foo',
          file: 'a.ts',
          standalone: true,
          inline: true,
          inputs: [],
          outputs: [],
          styleUrls: [],
        },
      ],
      routes: [{ path: 'foo', component: 'Foo', file: 'a.ts' }],
      adapters: [{ adapter: 'angular', stub: false, source: 'ts-morph' }],
    });
    const dotnet = surveyWith({
      stack: ['dotnet'],
      endpoints: [{ method: 'GET', path: '/api/foo' }],
      adapters: [{ adapter: 'dotnet', stub: false, source: 'openapi-file' }],
    });

    const merged = mergeSurveys([
      { name: 'angular', survey: angular },
      { name: 'dotnet', survey: dotnet },
    ]);

    expect(merged.stack).toEqual(['angular', 'dotnet']);
    expect(merged.components).toHaveLength(1);
    expect(merged.routes).toHaveLength(1);
    expect(merged.endpoints).toHaveLength(1);
    expect(merged.stub).toBe(false);
    expect(merged.adapters).toEqual([
      { adapter: 'angular', stub: false, source: 'ts-morph' },
      { adapter: 'dotnet', stub: false, source: 'openapi-file' },
    ]);
  });

  it('is stub:true only when every contributing adapter is a stub (e.g. only the regex-lite tier ran)', () => {
    const dotnetStubOnly = surveyWith({
      stack: ['dotnet'],
      endpoints: [{ method: 'GET', path: '/api/foo', stub: true }],
      stub: true,
      adapters: [{ adapter: 'dotnet', stub: true, source: 'regex-stub' }],
    });

    const merged = mergeSurveys([{ name: 'dotnet', survey: dotnetStubOnly }]);
    expect(merged.stub).toBe(true);
  });

  it('is stub:false when at least one contributing adapter produced real data, even if another is a stub', () => {
    const angularReal = surveyWith({
      stack: ['angular'],
      components: [
        {
          name: 'Foo',
          selector: 'app-foo',
          file: 'a.ts',
          standalone: true,
          inline: true,
          inputs: [],
          outputs: [],
          styleUrls: [],
        },
      ],
      adapters: [{ adapter: 'angular', stub: false, source: 'ts-morph' }],
    });
    const dotnetStub = surveyWith({
      stack: ['dotnet'],
      endpoints: [{ method: 'GET', path: '/api/foo', stub: true }],
      stub: true,
      adapters: [{ adapter: 'dotnet', stub: true, source: 'regex-stub' }],
    });

    const merged = mergeSurveys([
      { name: 'angular', survey: angularReal },
      { name: 'dotnet', survey: dotnetStub },
    ]);
    expect(merged.stub).toBe(false);
  });

  it('namespaces a schemaRef by adapter only when two adapters collide on the same name', () => {
    const a = surveyWith({
      schemas: [
        { schemaRef: 'Invoice', schema: { type: 'object' } },
        { schemaRef: 'OnlyInA', schema: { type: 'object' } },
      ],
      adapters: [{ adapter: 'angular', stub: false }],
    });
    const b = surveyWith({
      schemas: [{ schemaRef: 'Invoice', schema: { type: 'object' } }],
      adapters: [{ adapter: 'dotnet', stub: false }],
    });

    const merged = mergeSurveys([
      { name: 'angular', survey: a },
      { name: 'dotnet', survey: b },
    ]);

    const refs = merged.schemas.map((s) => s.schemaRef).sort();
    expect(refs).toEqual(['OnlyInA', 'angular.Invoice', 'dotnet.Invoice'].sort());
  });

  // S16 (AMENDMENT-1 §6/A5): the generic web adapter always contributes stack:['web'] and
  // empty components/routes on its OWN survey, but must yield that contribution once a real
  // stack adapter has ALSO matched — it never crowds out a real stack name, and never
  // duplicates the (always-empty) components/routes it never surveys for. Its own per-adapter
  // meta entry (devServer/frameworks hints) still lands in the merged `adapters` array either
  // way — that is how the human summary can name it ("web: <root> (css/scss scan)") and how
  // `serve.ts` can read a devServer guess off the merged survey.
  describe('the web adapter yields its stack/components/routes to a real stack adapter', () => {
    it('web stands alone with stack: ["web"] when no stack adapter matched', () => {
      const web = surveyWith({
        stack: ['web'],
        adapters: [{ adapter: 'web', appRoot: 'root', source: 'css/scss scan', stub: false, unknown: true }],
      });

      const merged = mergeSurveys([{ name: 'web', survey: web }]);

      expect(merged.stack).toEqual(['web']);
      expect(merged.components).toEqual([]);
      expect(merged.adapters).toEqual([
        { adapter: 'web', appRoot: 'root', source: 'css/scss scan', stub: false, unknown: true },
      ]);
    });

    it('web\'s stack/components/routes are dropped from the merge once a stack adapter matched too', () => {
      const angular = surveyWith({
        stack: ['angular'],
        components: [
          {
            name: 'Foo',
            selector: 'app-foo',
            file: 'a.ts',
            standalone: true,
            inline: true,
            inputs: [],
            outputs: [],
            styleUrls: [],
          },
        ],
        routes: [{ path: 'foo', component: 'Foo', file: 'a.ts' }],
        adapters: [{ adapter: 'angular', stub: false, source: 'ts-morph' }],
      });
      const web = surveyWith({
        stack: ['web'],
        components: [],
        routes: [],
        adapters: [{ adapter: 'web', appRoot: 'root', source: 'css/scss scan', stub: false, unknown: true, devServer: 'http://localhost:5173' }],
      });

      const merged = mergeSurveys([
        { name: 'angular', survey: angular },
        { name: 'web', survey: web },
      ]);

      expect(merged.stack).toEqual(['angular']);
      expect(merged.components).toHaveLength(1);
      expect(merged.routes).toHaveLength(1);
    });

    it('web\'s own per-adapter meta entry (with its devServer hint) still lands in the merged adapters array even when it yields', () => {
      const angular = surveyWith({
        stack: ['angular'],
        adapters: [{ adapter: 'angular', stub: false, source: 'ts-morph' }],
      });
      const web = surveyWith({
        stack: ['web'],
        adapters: [{ adapter: 'web', appRoot: 'root', source: 'css/scss scan', stub: false, unknown: true, devServer: 'http://localhost:5173' }],
      });

      const merged = mergeSurveys([
        { name: 'angular', survey: angular },
        { name: 'web', survey: web },
      ]);

      expect(merged.adapters).toContainEqual({
        adapter: 'web',
        appRoot: 'root',
        source: 'css/scss scan',
        stub: false,
        unknown: true,
        devServer: 'http://localhost:5173',
      });
    });

    it('order does not matter — web listed before the stack adapter still yields', () => {
      const web = surveyWith({
        stack: ['web'],
        adapters: [{ adapter: 'web', stub: false, unknown: true }],
      });
      const dotnet = surveyWith({
        stack: ['dotnet'],
        endpoints: [{ method: 'GET', path: '/api/foo' }],
        adapters: [{ adapter: 'dotnet', stub: false, source: 'openapi-file' }],
      });

      const merged = mergeSurveys([
        { name: 'web', survey: web },
        { name: 'dotnet', survey: dotnet },
      ]);

      expect(merged.stack).toEqual(['dotnet']);
    });
  });
});
