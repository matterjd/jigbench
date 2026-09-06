import { describe, expect, it } from 'vitest';
import { FixtureSchema, type Fixture } from './fixture.js';
import { JIG_FORMAT } from './jig-format.js';

/**
 * S7 extends the S1 single-schema Fixture shape ({schemaRef, data}) into the richer shape a
 * fixture generated from a whole Survey needs: many endpoints' worth of responses, keyed by
 * `${METHOD} ${path}`, plus request/model schema values for form fill, plus Law II's
 * scrap/restore state (never a hard delete). Nothing outside fixture.ts/jsonschema.ts
 * referenced the old shape (grepped before this change), so this is a clean replace, not an
 * additive union.
 */
describe('FixtureSchema (S7)', () => {
  const valid: Fixture = {
    jigFormat: JIG_FORMAT,
    id: 'overdue-heavy-a1b2c3d4',
    name: 'overdue-heavy',
    seed: 42,
    createdAt: '2026-09-05T00:00:00.000Z',
    schemaRefs: ['InvoiceDto', 'CustomerDto'],
    responses: {
      'GET /api/invoices': [{ id: '1', number: 'INV-1' }],
      'GET /api/invoices/{id}': { id: '1', number: 'INV-1' },
    },
    forms: {
      CreateInvoiceRequest: { customerId: '1', notes: 'net 30' },
    },
  };

  it('parses a full fixture', () => {
    expect(FixtureSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a string seed too (the default-seed-from-name case)', () => {
    expect(FixtureSchema.parse({ ...valid, seed: 'stable-hash-of-name' }).seed).toBe(
      'stable-hash-of-name',
    );
  });

  it('carries optional Law II scrap state, absent by default', () => {
    const parsed = FixtureSchema.parse(valid);
    expect(parsed.scrapped).toBeUndefined();
    expect(parsed.scrappedAt).toBeUndefined();

    const scrapped = FixtureSchema.parse({ ...valid, scrapped: true, scrappedAt: '2026-09-05T01:00:00.000Z' });
    expect(scrapped.scrapped).toBe(true);
    expect(scrapped.scrappedAt).toBe('2026-09-05T01:00:00.000Z');
  });

  it('rejects a fixture missing responses/forms (the S1 shape alone is no longer valid)', () => {
    const legacyShape = { jigFormat: JIG_FORMAT, id: 'x', seed: 1, schemaRef: 'X', data: {} };
    expect(() => FixtureSchema.parse(legacyShape)).toThrow();
  });

  it('rejects the wrong jigFormat', () => {
    expect(() => FixtureSchema.parse({ ...valid, jigFormat: 2 })).toThrow();
  });
});
