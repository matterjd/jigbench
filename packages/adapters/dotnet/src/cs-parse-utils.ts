/** Small, dependency-free helpers for the regex-lite C# fallback tier. None of this is a real
 * C# parser — it is a best-effort text scan, which is exactly why every result it feeds is
 * badged `stub: true` end to end. */

/** Finds the index of the closing bracket matching the opener at `openIndex` (which must be
 * `openChar`), honoring nesting. Returns -1 if unbalanced. Ignores brackets inside string
 * literals well enough for C# source that doesn't nest the SAME bracket type inside a string
 * right at a boundary — an acceptable limitation for a stub-tier scanner. */
export function findMatchingBracket(text: string, openIndex: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped char
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Splits `text` on top-level commas only — commas inside `()`, `[]`, `{}`, `<>`, or string
 * literals never split. Used to break a record's parameter list, or an attribute's argument
 * list, into individual items. */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      current += ch;
      if (ch === '\\') {
        current += text[++i] ?? '';
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      current += ch;
      continue;
    }
    if ('([{<'.includes(ch)) depth++;
    else if (')]}>'.includes(ch)) depth--;

    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Strips one or more leading `[property: Attr(...), Attr2]` / `[Attr]` annotations off a
 * record-parameter or property text, returning what's left. Attribute argument lists can
 * contain commas, so this respects bracket nesting rather than stopping at the first `]`. */
export function stripLeadingAttributes(text: string): string {
  let s = text.trimStart();
  while (s.startsWith('[')) {
    const close = findMatchingBracket(s, 0, '[', ']');
    if (close === -1) break;
    s = s.slice(close + 1).trimStart();
  }
  return s;
}

export interface JsonTypeShape {
  type: string;
  format?: string;
  items?: JsonTypeShape;
}

/** Maps a C# type name (as it appears in source, e.g. `List<InvoiceLineRequest>`, `int`,
 * `DateOnly`, `string?`) to a JSON Schema type shape. Unknown/custom types (DTOs, enums this
 * scanner hasn't seen) fall back to `type: 'object'` — never a guessed structure. */
export function mapCSharpType(csType: string): JsonTypeShape {
  const t = csType.trim().replace(/\?$/, '');

  const listMatch = /^(?:List|IReadOnlyList|IList|ICollection|IEnumerable)<(.+)>$/.exec(t);
  if (listMatch) return { type: 'array', items: mapCSharpType(listMatch[1]) };
  const arrayMatch = /^(.+)\[\]$/.exec(t);
  if (arrayMatch) return { type: 'array', items: mapCSharpType(arrayMatch[1]) };

  switch (t) {
    case 'string':
      return { type: 'string' };
    case 'bool':
    case 'Boolean':
      return { type: 'boolean' };
    case 'int':
    case 'Int32':
    case 'long':
    case 'Int64':
    case 'short':
      return { type: 'integer' };
    case 'decimal':
    case 'double':
    case 'float':
      return { type: 'number' };
    case 'DateOnly':
      return { type: 'string', format: 'date' };
    case 'DateTime':
    case 'DateTimeOffset':
      return { type: 'string', format: 'date-time' };
    case 'Guid':
      return { type: 'string', format: 'uuid' };
    default:
      return { type: 'object' };
  }
}

/** `CustomerId` -> `customerId` (ASP.NET Core's default System.Text.Json casing), so a
 * skeletal regex-lite schema's property names line up with what tier (a)/(b) would have
 * recorded for the same DTO. */
export function toCamelCase(name: string): string {
  if (name.length === 0) return name;
  return name[0].toLowerCase() + name.slice(1);
}
