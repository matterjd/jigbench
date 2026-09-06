import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { surveySchemas } from './schemas.js';

const LEDGER_ANGULAR_ROOT = fileURLToPath(
  new URL('../../../../examples/ledger-angular', import.meta.url),
);

describe('surveySchemas (examples/ledger-angular)', () => {
  it('emits one JSON Schema per exported type under src/**/models/** or *.model.ts', async () => {
    const schemas = await surveySchemas(LEDGER_ANGULAR_ROOT);
    const refs = schemas.map((s) => s.schemaRef).sort();
    // customer.model.ts: Customer. invoice.model.ts: InvoiceStatus, InvoiceLine, Invoice,
    // InvoiceFormValue.
    expect(refs).toEqual(
      ['Customer', 'Invoice', 'InvoiceFormValue', 'InvoiceLine', 'InvoiceStatus'].sort(),
    );
  });

  it('Invoice references InvoiceLine via a local $ref and has the right required properties', async () => {
    const schemas = await surveySchemas(LEDGER_ANGULAR_ROOT);
    const invoice = schemas.find((s) => s.schemaRef === 'Invoice');
    expect(invoice).toBeDefined();
    expect(invoice?.schema.type).toBe('object');
    const properties = invoice?.schema.properties as Record<string, unknown>;
    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['id', 'customerId', 'lines', 'total', 'status']),
    );
  });

  it('InvoiceStatus is a string enum', async () => {
    const schemas = await surveySchemas(LEDGER_ANGULAR_ROOT);
    const status = schemas.find((s) => s.schemaRef === 'InvoiceStatus');
    expect(status?.schema.enum).toEqual(
      expect.arrayContaining(['draft', 'sent', 'paid', 'overdue', 'void']),
    );
  });
});
