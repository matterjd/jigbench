import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findOpenApiFile, surveyFromOpenApiFile } from './openapi-file.js';

const LEDGER_API_ROOT = fileURLToPath(new URL('../../../../examples/ledger-api', import.meta.url));

describe('findOpenApiFile', () => {
  it('finds examples/ledger-api/openapi.v1.json', async () => {
    const file = await findOpenApiFile(LEDGER_API_ROOT);
    expect(file).toMatch(/openapi\.v1\.json$/);
  });

  it('returns undefined when there is no recorded OpenAPI document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-noopenapi-'));
    expect(await findOpenApiFile(dir)).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });
});

describe('surveyFromOpenApiFile (examples/ledger-api/openapi.v1.json)', () => {
  it('yields all seven recorded endpoints with method + path + operationId', async () => {
    const result = await surveyFromOpenApiFile(LEDGER_API_ROOT);
    expect(result).toBeDefined();
    expect(result?.endpoints).toHaveLength(7);

    const byOp = Object.fromEntries((result?.endpoints ?? []).map((e) => [e.operationId, e]));
    expect(byOp['ListInvoices']).toMatchObject({ method: 'GET', path: '/api/invoices' });
    expect(byOp['CreateInvoice']).toMatchObject({ method: 'POST', path: '/api/invoices' });
    expect(byOp['GetInvoice']).toMatchObject({ method: 'GET', path: '/api/invoices/{id}' });
    expect(byOp['UpdateInvoice']).toMatchObject({ method: 'PUT', path: '/api/invoices/{id}' });
    expect(byOp['ListCustomers']).toMatchObject({ method: 'GET', path: '/api/customers' });
    expect(byOp['GetCustomer']).toMatchObject({ method: 'GET', path: '/api/customers/{id}' });

    // The reports endpoint has no operationId in the recorded document.
    const aging = result?.endpoints.find((e) => e.path === '/api/reports/aging');
    expect(aging).toMatchObject({ method: 'GET' });
    expect(aging?.operationId).toBeUndefined();
  });

  it('none of the openapi-file-tier endpoints are flagged stub', async () => {
    const result = await surveyFromOpenApiFile(LEDGER_API_ROOT);
    expect(result?.endpoints.every((e) => e.stub !== true)).toBe(true);
  });

  it('copies components.schemas as JSON Schema, with $refs rewritten to local refs', async () => {
    const result = await surveyFromOpenApiFile(LEDGER_API_ROOT);
    const refs = (result?.schemas ?? []).map((s) => s.schemaRef).sort();
    expect(refs).toEqual(
      [
        'AgingBucket',
        'CreateInvoiceRequest',
        'CustomerDto',
        'HttpValidationProblemDetails',
        'InvoiceDto',
        'InvoiceLineDto',
        'InvoiceLineRequest',
        'UpdateInvoiceRequest',
      ].sort(),
    );

    const invoiceDto = result?.schemas.find((s) => s.schemaRef === 'InvoiceDto');
    const linesProp = (invoiceDto?.schema.properties as Record<string, { items?: { $ref?: string } }>)
      ?.lines;
    expect(linesProp?.items?.$ref).toBe('#/schemas/InvoiceLineDto');
    expect(linesProp?.items?.$ref).not.toContain('#/components/schemas/');
  });

  it('returns undefined when no OpenAPI document exists in the repo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jig-dn-noopenapi2-'));
    expect(await surveyFromOpenApiFile(dir)).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });
});
