import { describe, expect, it } from 'vitest';
import { jigJsonSchemas } from './jsonschema.js';

describe('jigJsonSchemas', () => {
  it('exports a JSON Schema for every .jig/ root format', () => {
    for (const key of Object.keys(jigJsonSchemas) as (keyof typeof jigJsonSchemas)[]) {
      const schema = jigJsonSchemas[key]();
      expect(schema).toBeTypeOf('object');
      expect(schema).not.toBeNull();
    }
  });

  it('the work-order JSON Schema requires a four-digit id pattern', () => {
    const schema = jigJsonSchemas.workOrder() as { properties?: { id?: { pattern?: string } } };
    expect(schema.properties?.id?.pattern).toBeTruthy();
  });
});
