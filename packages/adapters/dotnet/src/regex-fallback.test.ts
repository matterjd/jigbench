import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { surveyFromRegexFallback } from './regex-fallback.js';

const LEDGER_API_ROOT = fileURLToPath(new URL('../../../../examples/ledger-api', import.meta.url));

describe('surveyFromRegexFallback (examples/ledger-api, read directly — no server, ignoring the recorded openapi.v1.json on purpose)', () => {
  it('finds the minimal-API MapGroup + MapGet/MapPost/MapPut endpoints with combined paths', async () => {
    const result = await surveyFromRegexFallback(LEDGER_API_ROOT);
    const byKey = new Map(result.endpoints.map((e) => [`${e.method} ${e.path}`, e]));

    expect(byKey.has('GET /api/invoices')).toBe(true);
    expect(byKey.has('POST /api/invoices')).toBe(true);
    expect(byKey.has('GET /api/invoices/{id}')).toBe(true);
    expect(byKey.has('PUT /api/invoices/{id}')).toBe(true);
    expect(byKey.has('GET /api/customers')).toBe(true);
    expect(byKey.has('GET /api/customers/{id}')).toBe(true);
  });

  it('finds the attribute-routed controller endpoint (class [Route] + method [HttpGet])', async () => {
    const result = await surveyFromRegexFallback(LEDGER_API_ROOT);
    expect(result.endpoints.some((e) => e.method === 'GET' && e.path === '/api/reports/aging')).toBe(
      true,
    );
  });

  it('flags every endpoint AND the result itself as a stub', async () => {
    const result = await surveyFromRegexFallback(LEDGER_API_ROOT);
    expect(result.endpoints.length).toBeGreaterThan(0);
    expect(result.endpoints.every((e) => e.stub === true)).toBe(true);
  });

  it('finds skeletal DTO schemas from the record primary-constructor parameter lists', async () => {
    const result = await surveyFromRegexFallback(LEDGER_API_ROOT);
    const refs = result.schemas.map((s) => s.schemaRef).sort();
    expect(refs).toEqual(
      [
        'CreateInvoiceRequest',
        'CustomerDto',
        'InvoiceDto',
        'InvoiceLineDto',
        'InvoiceLineRequest',
        'UpdateInvoiceRequest',
      ].sort(),
    );

    const customer = result.schemas.find((s) => s.schemaRef === 'CustomerDto');
    expect(customer?.schema).toMatchObject({
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        city: { type: 'string' },
      },
    });
  });

  it('maps C# int/decimal/List<T> to the right JSON types on InvoiceLineDto', async () => {
    const result = await surveyFromRegexFallback(LEDGER_API_ROOT);
    const line = result.schemas.find((s) => s.schemaRef === 'InvoiceLineDto');
    expect(line?.schema.properties).toMatchObject({
      id: { type: 'string' },
      description: { type: 'string' },
      quantity: { type: 'integer' },
      unitPrice: { type: 'number' },
    });
  });

  it("maps InvoiceDto's List<InvoiceLineDto> to an array-of-object schema", async () => {
    const result = await surveyFromRegexFallback(LEDGER_API_ROOT);
    const invoice = result.schemas.find((s) => s.schemaRef === 'InvoiceDto');
    const lines = (invoice?.schema.properties as Record<string, { type?: string; items?: unknown }>)
      ?.lines;
    expect(lines?.type).toBe('array');
    expect(lines?.items).toBeDefined();
  });
});

describe('surveyFromRegexFallback (property-style DTO class — no such class exists in examples/ledger-api)', () => {
  it('reads a plain class with { get; set; } properties as a schema too', async () => {
    const { mkdtemp, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-classdto-'));
    await writeFile(join(dir, 'App.csproj'), '<Project />');
    await writeFile(
      join(dir, 'WidgetDto.cs'),
      [
        'namespace Widgets;',
        '',
        'public class WidgetDto',
        '{',
        '    public string Id { get; set; }',
        '    public int Count { get; set; }',
        '}',
        '',
      ].join('\n'),
    );

    const result = await surveyFromRegexFallback(dir);
    const widget = result.schemas.find((s) => s.schemaRef === 'WidgetDto');
    expect(widget?.schema).toMatchObject({
      type: 'object',
      properties: { id: { type: 'string' }, count: { type: 'integer' } },
    });

    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  });
});
