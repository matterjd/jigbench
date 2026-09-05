import { describe, expect, it } from 'vitest';
import {
  ComponentSchema,
  EndpointSchema,
  NamedSchemaSchema,
  SurveyAdapterMetaSchema,
  SurveySchema,
  stubSurvey,
} from './survey.js';

describe('Survey', () => {
  it('stubSurvey() produces a schema-valid, honestly-labeled stub', () => {
    const survey = stubSurvey('2026-09-05T00:00:00.000Z');
    expect(() => SurveySchema.parse(survey)).not.toThrow();
    expect(survey.stub).toBe(true);
    expect(survey.jigFormat).toBe(1);
    expect(survey.components).toEqual([]);
  });

  it('rejects a survey missing jigFormat', () => {
    const bad = { ...stubSurvey(), jigFormat: undefined };
    expect(() => SurveySchema.parse(bad)).toThrow();
  });

  it('accepts a component with signal-input/output detail (S2: adapter-angular)', () => {
    const component = {
      name: 'StatusChipComponent',
      selector: 'app-status-chip',
      file: 'src/app/shared/status-chip/status-chip.ts',
      standalone: true,
      inline: false,
      inputs: [{ name: 'status', required: true }],
      outputs: [],
      templateUrl: './status-chip.html',
      styleUrls: ['./status-chip.scss'],
    };
    expect(() => ComponentSchema.parse(component)).not.toThrow();
  });

  it('rejects a component input missing the required flag', () => {
    const bad = {
      name: 'StatusChipComponent',
      selector: 'app-status-chip',
      file: 'x.ts',
      standalone: true,
      inline: false,
      inputs: [{ name: 'status' }],
      outputs: [],
      styleUrls: [],
    };
    expect(() => ComponentSchema.parse(bad)).toThrow();
  });

  it('accepts an endpoint carrying operationId + stub badge (S2: adapter-dotnet regex-lite tier)', () => {
    const endpoint = {
      method: 'GET',
      path: '/api/reports/aging',
      operationId: undefined,
      stub: true,
      file: 'Controllers/ReportsController.cs',
    };
    expect(() => EndpointSchema.parse(endpoint)).not.toThrow();
  });

  it('accepts a namespaced schema entry', () => {
    expect(() =>
      NamedSchemaSchema.parse({ schemaRef: 'dotnet.InvoiceDto', schema: { type: 'object' } }),
    ).not.toThrow();
  });

  it('accepts per-adapter provenance (source tier, appRoot, stub badge)', () => {
    expect(() =>
      SurveyAdapterMetaSchema.parse({
        adapter: 'dotnet',
        appRoot: 'examples/ledger-api',
        source: 'regex-stub',
        stub: true,
      }),
    ).not.toThrow();
  });

  it('a survey may carry components/schemas/adapters alongside the stub flag', () => {
    const survey = {
      ...stubSurvey(),
      stub: false,
      components: [
        {
          name: 'StatusChipComponent',
          selector: 'app-status-chip',
          file: 'x.ts',
          standalone: true,
          inline: false,
          inputs: [{ name: 'status', required: true }],
          outputs: [],
          styleUrls: [],
        },
      ],
      schemas: [{ schemaRef: 'Invoice', schema: { type: 'object' } }],
      adapters: [{ adapter: 'angular', stub: false, source: 'ts-morph' }],
    };
    expect(() => SurveySchema.parse(survey)).not.toThrow();
  });
});
