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

/** The next four-digit work-order id, given the ids already on disk. Pure — the caller
 * reads `.jig/work-orders/` and hands the list in; this never touches a filesystem. */
export function nextWorkOrderId(existing: readonly string[]): string {
  let max = 0;
  for (const id of existing) {
    const n = Number.parseInt(id, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, '0');
}
