/** Lowercase, hyphenated, ASCII-only. Diacritics are folded first (NFKD decomposition +
 * stripping the Unicode Diacritic property), everything else collapses to a single hyphen,
 * and the result is capped so a slug never becomes a path problem on its own. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'untitled';
}

/** Shared by every `.jig/` collection that numbers its files `0001`, `0002`, … — pure, no
 * filesystem access; the caller reads its own directory and hands the ids already on disk
 * in. */
function nextFourDigitId(existing: readonly string[]): string {
  let max = 0;
  for (const id of existing) {
    const n = Number.parseInt(id, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, '0');
}

/** The next four-digit work-order id, given the ids already on disk. */
export function nextWorkOrderId(existing: readonly string[]): string {
  return nextFourDigitId(existing);
}

/** The next four-digit toolpath id, given the ids already under `.jig/toolpaths/` (S8) — the
 * same numbering rule as work orders, under its own name so a caller reaching for "the next
 * id for MY collection" never has to borrow a work-order-named function to get it. */
export function nextToolpathId(existing: readonly string[]): string {
  return nextFourDigitId(existing);
}

/** The next four-digit prompt id, given the ids already under `.jig/prompts/` (S11) — same
 * numbering rule, own name, same reasoning as `nextToolpathId` above. */
export function nextPromptId(existing: readonly string[]): string {
  return nextFourDigitId(existing);
}
