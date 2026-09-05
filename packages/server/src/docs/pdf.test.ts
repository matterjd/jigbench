import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { extractPdfText } from './pdf.js';

const FIXTURE_PDF = join(import.meta.dirname, '__fixtures__', 'handbook', 'policies.pdf');

describe('extractPdfText', () => {
  it('extracts the committed fixture PDF text, including the exact billing phrase', async () => {
    const buffer = await readFile(FIXTURE_PDF);
    const text = await extractPdfText(buffer);
    expect(text).toContain('invoices fall due thirty days after issue.');
  });

  it('returns an empty (or whitespace-only) string for a page with no text — never throws', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const bytes = await doc.save();

    const text = await extractPdfText(Buffer.from(bytes));

    expect(text.trim()).toBe('');
  });
});
