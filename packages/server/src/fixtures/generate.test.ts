import { describe, expect, it } from 'vitest';
import { JIG_FORMAT, type Survey } from '@jigbench/core';
import { generateFixture, hashSeed, dereferenceSchema } from './generate.js';

/**
 * F10 / EXECUTION-PLAN S7: "unit: same seed -> identical output". This exercises
 * generateFixture against a survey shaped like the Ledger example (S2's dotnet adapter
 * output): an InvoiceDto list + item endpoint sharing one $ref, a CreateInvoiceRequest model
 * schema for form fill, and a plain endpoint with no $ref at all.
 */

function ledgerLikeSurvey(): Survey {
  return {
    jigFormat: JIG_FORMAT,
    stack: ['dotnet'],
    components: [],
    routes: [],
    endpoints: [
      {
        method: 'GET',
        path: '/api/invoices',
        responseSchema: { type: 'array', items: { $ref: '#/schemas/InvoiceDto' } },
      },
      {
        method: 'GET',
        path: '/api/invoices/{id}',
        responseSchema: { $ref: '#/schemas/InvoiceDto' },
      },
      {
        method: 'POST',
        path: '/api/invoices',
        requestSchema: { $ref: '#/schemas/CreateInvoiceRequest' },
        responseSchema: { $ref: '#/schemas/InvoiceDto' },
      },
      {
        method: 'GET',
        path: '/api/reports/aging',
        responseSchema: { type: 'object', properties: { bucket: { type: 'string' } } },
      },
    ],
    schemas: [
      {
        schemaRef: 'InvoiceDto',
        schema: {
          type: 'object',
          required: ['id', 'number', 'customerName', 'issuedOn', 'total'],
          properties: {
            id: { type: 'string' },
            number: { type: 'string' },
            customerName: { type: 'string' },
            issuedOn: { type: 'string', format: 'date' },
            total: { type: 'number' },
          },
        },
      },
      {
        schemaRef: 'CreateInvoiceRequest',
        schema: {
          type: 'object',
          required: ['customerId', 'notes'],
          properties: {
            customerId: { type: 'string' },
            notes: { type: 'string' },
          },
        },
      },
    ],
    docs: [],
    generatedAt: '2026-09-05T00:00:00.000Z',
  };
}

describe('hashSeed', () => {
  it('is deterministic for the same input', () => {
    expect(hashSeed('overdue-heavy')).toBe(hashSeed('overdue-heavy'));
    expect(hashSeed(42)).toBe(hashSeed(42));
  });

  it('differs for different input (no collision on these two)', () => {
    expect(hashSeed('overdue-heavy')).not.toBe(hashSeed('light'));
    expect(hashSeed(42)).not.toBe(hashSeed(43));
  });
});

describe('dereferenceSchema', () => {
  const schemas = new Map<string, unknown>([
    ['A', { type: 'object', properties: { b: { $ref: '#/schemas/B' } } }],
    ['B', { type: 'string' }],
  ]);

  it('resolves a $ref against the schema map', () => {
    expect(dereferenceSchema({ $ref: '#/schemas/A' }, schemas)).toEqual({
      type: 'object',
      properties: { b: { type: 'string' } },
    });
  });

  it('never throws on a self-referencing cycle — it bottoms out instead', () => {
    const cyclic = new Map<string, unknown>([
      ['Node', { type: 'object', properties: { next: { $ref: '#/schemas/Node' } } }],
    ]);
    expect(() => dereferenceSchema({ $ref: '#/schemas/Node' }, cyclic)).not.toThrow();
  });

  it('falls back to a permissive object schema for an unresolved ref rather than throwing', () => {
    expect(dereferenceSchema({ $ref: '#/schemas/Missing' }, schemas)).toEqual({ type: 'object' });
  });

  it('never throws on a MUTUAL two-schema cycle (A -> B -> A)', () => {
    const mutual = new Map<string, unknown>([
      ['A', { type: 'object', properties: { b: { $ref: '#/schemas/B' } } }],
      ['B', { type: 'object', properties: { a: { $ref: '#/schemas/A' } } }],
    ]);
    expect(() => dereferenceSchema({ $ref: '#/schemas/A' }, mutual)).not.toThrow();
  });

  // Regression (found running the real fixture-smoke.sh against the Ledger example): an
  // earlier version capped by raw TREE depth rather than by $ref-name cycles. A `type: [...]`
  // array five-ish plain-object levels down from a single $ref hop (exactly this shape —
  // Invoice -> lines -> items -> InvoiceLineDto -> quantity -> type[]) tripped that cap and
  // silently replaced each element of the type array with `{ type: 'object' }`, which then
  // made json-schema-faker throw "Unknown type: [object Object]" on a schema that was never
  // actually cyclic — only ORDINARILY nested, the way real OpenAPI/.NET DTOs are.
  it('does not corrupt a deeply-nested, non-cyclic type array (regression: the depth cap used to)', () => {
    const deep = new Map<string, unknown>([
      [
        'Invoice',
        {
          type: 'object',
          properties: { lines: { type: 'array', items: { $ref: '#/schemas/InvoiceLine' } } },
        },
      ],
      [
        'InvoiceLine',
        {
          type: 'object',
          properties: {
            quantity: { pattern: '^-?(?:0|[1-9]\\d*)$', type: ['integer', 'string'], format: 'int32' },
          },
        },
      ],
    ]);
    const result = dereferenceSchema({ $ref: '#/schemas/Invoice' }, deep) as {
      properties: { lines: { items: { properties: { quantity: { type: unknown } } } } };
    };
    expect(result.properties.lines.items.properties.quantity.type).toEqual(['integer', 'string']);
  });
});

describe('generateFixture — determinism', () => {
  it('produces byte-identical responses+forms for the same seed, twice', () => {
    const survey = ledgerLikeSurvey();
    const a = generateFixture({ survey, seed: 42, name: 'overdue-heavy' });
    const b = generateFixture({ survey, seed: 42, name: 'overdue-heavy' });
    expect(JSON.stringify(a.responses)).toBe(JSON.stringify(b.responses));
    expect(JSON.stringify(a.forms)).toBe(JSON.stringify(b.forms));
  });

  it('produces different responses for a different seed', () => {
    const survey = ledgerLikeSurvey();
    const a = generateFixture({ survey, seed: 42, name: 'overdue-heavy' });
    const b = generateFixture({ survey, seed: 7, name: 'light-load' });
    expect(JSON.stringify(a.responses)).not.toBe(JSON.stringify(b.responses));
  });
});

describe('generateFixture — list vs item shape', () => {
  it('a list endpoint (array response, $ref items) gets exactly 8 entities', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'x' });
    const list = fixture.responses['GET /api/invoices'];
    expect(Array.isArray(list)).toBe(true);
    expect((list as unknown[]).length).toBe(8);
  });

  it('an item endpoint (single $ref response) gets exactly one entity — the list pool\'s first', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'x' });
    const list = fixture.responses['GET /api/invoices'] as Record<string, unknown>[];
    const item = fixture.responses['GET /api/invoices/{id}'];
    expect(Array.isArray(item)).toBe(false);
    expect(item).toEqual(list[0]);
  });

  it('the POST endpoint sharing the same InvoiceDto response ref also gets the pool\'s first entity', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'x' });
    const list = fixture.responses['GET /api/invoices'] as Record<string, unknown>[];
    expect(fixture.responses['POST /api/invoices']).toEqual(list[0]);
  });

  it('an endpoint with no $ref at all still gets a deterministic single payload', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'x' });
    const payload = fixture.responses['GET /api/reports/aging'];
    expect(payload).toBeTypeOf('object');
    expect(Array.isArray(payload)).toBe(false);
  });
});

describe('generateFixture — realistic values via faker', () => {
  it('generates a plausible customerName (letters and a space) and a numeric total', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'x' });
    const list = fixture.responses['GET /api/invoices'] as Record<string, unknown>[];
    for (const entity of list) {
      expect(typeof entity.customerName).toBe('string');
      expect(entity.customerName as string).toMatch(/[A-Za-z]+\s[A-Za-z]+/);
      expect(typeof entity.total).toBe('number');
      expect(entity.issuedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('the 8 list entities are not all identical to each other', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'x' });
    const list = fixture.responses['GET /api/invoices'] as Record<string, unknown>[];
    const distinctIds = new Set(list.map((e) => e.id));
    expect(distinctIds.size).toBe(list.length);
  });
});

describe('generateFixture — forms for request/model schemas', () => {
  it('generates form values keyed by schemaRef for every survey schema', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'x' });
    expect(Object.keys(fixture.forms).sort()).toEqual(['CreateInvoiceRequest', 'InvoiceDto']);
    expect(fixture.forms.CreateInvoiceRequest).toHaveProperty('customerId');
    expect(fixture.forms.CreateInvoiceRequest).toHaveProperty('notes');
  });
});

describe('generateFixture — fixture shell', () => {
  it('sets jigFormat, a filename-safe id derived from the name, and lists the schemaRefs used', () => {
    const fixture = generateFixture({ survey: ledgerLikeSurvey(), seed: 1, name: 'Overdue Heavy!' });
    expect(fixture.jigFormat).toBe(JIG_FORMAT);
    expect(fixture.id).toBe('overdue-heavy');
    expect(fixture.name).toBe('Overdue Heavy!');
    expect(fixture.schemaRefs).toContain('InvoiceDto');
    expect(fixture.schemaRefs).toContain('CreateInvoiceRequest');
  });
});
