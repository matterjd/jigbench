#!/usr/bin/env node
// scripts/make-fixture-pdf.mjs
//
// Generates packages/server/src/docs/__fixtures__/handbook/policies.pdf — the one PDF
// fixture S2b's docs-clamp tests read (EXECUTION-PLAN.md §4 S2b). Its OUTPUT is committed
// alongside this script so no test depends on regenerating it at run time; re-run this
// script by hand if the fixture text ever needs to change.
//
// Usage: node scripts/make-fixture-pdf.mjs

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const OUT_FILE = fileURLToPath(
  new URL('../packages/server/src/docs/__fixtures__/handbook/policies.pdf', import.meta.url),
);

// The docs-clamp test suite greps the extracted text for this exact phrase — keep it
// verbatim if this fixture is ever regenerated.
const LINES = [
  'Billing policy',
  '',
  'invoices fall due thirty days after issue.',
  'Late invoices accrue a small administrative fee.',
];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);

  let y = 260;
  for (const line of LINES) {
    if (line.length > 0) {
      page.drawText(line, { x: 40, y, size: 12, font });
    }
    y -= 20;
  }

  const bytes = await doc.save();
  await writeFile(OUT_FILE, bytes);
  console.log(`wrote ${OUT_FILE} (${bytes.length} bytes)`);
}

main();
