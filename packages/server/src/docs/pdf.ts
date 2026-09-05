import { PDFParse } from 'pdf-parse';

/**
 * S2b's PDF text extraction (EXECUTION-PLAN.md §4 S2b, CONTEXT.md decision 17: "PDF text
 * (`pdf-parse`)"). `pdf-parse@2.x` wraps `pdfjs-dist`; `getText()` does plain text
 * extraction and never touches the `@napi-rs/canvas` dependency that only its
 * screenshot/image helpers need, so this stays a pure-JS text read with no local native
 * build step (verified on Windows + Node 24).
 *
 * Never throws for a well-formed PDF with nothing extractable (a scanned image with no
 * text layer, say) — it returns an empty string and lets the caller (`clampDocs`) decide
 * what an empty result means for that file.
 */
export async function extractPdfText(data: Buffer | Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    // No page-number banner in the joined text (`pageJoiner`'s default inserts one) —
    // it would otherwise leak into chunkPlain's paragraphs as noise.
    const result = await parser.getText({ pageJoiner: '\n\n' });
    return result.text ?? '';
  } finally {
    await parser.destroy();
  }
}
