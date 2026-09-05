/** Pure logic for appending `.jig/cache/` to a repo's `.gitignore` if it is not already
 * covered. `commands/init.ts` does the actual file read/write. */
export function ensureGitignoreEntry(
  content: string | undefined,
  entry: string,
): { updated: string; changed: boolean } {
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
