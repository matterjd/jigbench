/** S17a's own copy of the CLI's `gitignore.ts` pure logic — see `mcp-json.ts`'s module doc
 * for why this is a copy rather than an import (dependency direction: `cli` -> `server`). */
export function ensureGitignoreEntry(content: string | undefined, entry: string): { updated: string; changed: boolean } {
  const text = content ?? '';
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const alreadyPresent = lines.some((line) => line.trim() === entry);
  if (alreadyPresent) {
    return { updated: text, changed: false };
  }

  const needsLeadingNewline = text.length > 0 && !text.endsWith('\n');
  const updated = `${text}${needsLeadingNewline ? '\n' : ''}${entry}\n`;
  return { updated, changed: true };
}
