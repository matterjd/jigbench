import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runServeCommand, type ServeCommandResult } from './commands/serve.js';

/**
 * #23 ruling 2 (Matter, 2026-09-14): "RATIFY 'go to the bench'; amend AMENDMENT-1 section 7
 * and the kickoff, and fix the terminal line in serve.ts."
 *
 * This is the case that would have caught that line. `packages/bench/src/tongue.test.ts`
 * guards the BENCH's surface — JSX text and aria/title/placeholder — and the terminal is a
 * surface it cannot see, so `jig serve`'s own first two lines sat outside the tongue
 * entirely and shipped "open the bench" for three slices.
 *
 * Two things are deliberately different from the bench's gate:
 *
 * 1. The banned set is READ OUT OF `docs/design/COMMISSION.md` §3's "Never" column rather
 *    than copied into a second literal list. A copy is a replica that cannot fail on what it
 *    omits: the tongue is amended in the commission, and a gate holding its own snapshot of
 *    it goes quietly out of date. The parse has its own controls below.
 * 2. There is NO pairing exemption. The bench's gate allows a banned word after an em dash,
 *    because that is where a `Word — plain word` pairing puts it — and that exemption is
 *    exactly why a copy of that gate would NOT have caught this line: "No repo clamped yet —
 *    open the bench to pick one." has its banned word after an em dash, as a verb, pairing
 *    with nothing. The terminal has no `Pairing` component and meets no word for the first
 *    time in a way a reader can hover, so the rule here is the plain one: Jig's own words in
 *    the terminal use none of them.
 */

const COMMISSION = join(import.meta.dirname, '..', '..', '..', 'docs', 'design', 'COMMISSION.md');

/** The "Never" column of COMMISSION.md §3, lower-cased, de-duplicated, in table order. */
function bannedWordsFromCommission(): string[] {
  const md = readFileSync(COMMISSION, 'utf8');
  const section = md.slice(md.indexOf('## 3. The tongue'));
  const table = section.slice(0, section.indexOf('## 4.'));
  const out = new Set<string>();
  for (const line of table.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // | Jig says | Plain word | Never |  ->  cells[0] is the empty lead, so "Never" is [3].
    const never = cells[3];
    if (!never || never === 'Never' || /^-+$/.test(never.replace(/[\s:]/g, ''))) continue;
    for (const word of never.split(',')) {
      const cleaned = word.replace(/[*_`]/g, '').trim().toLowerCase();
      if (cleaned) out.add(cleaned);
    }
  }
  return [...out];
}

const BANNED = bannedWordsFromCommission();

/** A URL or an absolute path in the message is the CALLER's data, not Jig's words — a repo
 * checked out under `~/projects` must not turn this gate red. Masked before the scan, and
 * `DETECTOR CONTROL: masking does not hide a banned word beside a url` below is the control
 * that the mask cannot swallow a real one. */
function jigsOwnWords(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[A-Za-z]:[\\/]\S*/g, '<path>')
    .replace(/(^|\s)\/\S+/g, '$1<path>');
}

function bannedWordsIn(message: string): string[] {
  const text = jigsOwnWords(message).toLowerCase();
  return BANNED.filter((banned) => {
    const re = new RegExp(banned.includes(' ') ? banned : String.raw`\b${banned}\b`, 'i');
    return re.test(text);
  });
}

let result: ServeCommandResult | undefined;

afterEach(async () => {
  if (result) {
    await result.close();
    result = undefined;
  }
});

describe('#23 ruling 2: what `jig serve` prints is inside the tongue too', () => {
  it('the no-repo line says "go to the bench" and uses no banned word', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'jig-tongue-nobench-'));

    result = await runServeCommand({ port: 0, open: false, cwd });

    expect(result.message).toContain('go to the bench');
    expect(bannedWordsIn(result.message)).toEqual([]);
  });

  it('the clamped lines use no banned word either', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'jig-tongue-clamped-'));

    result = await runServeCommand({ repo: repoRoot, port: 0, open: false, platePort: 0 });

    expect(bannedWordsIn(result.message)).toEqual([]);
  });

  it('CONTROL: the banned set really came out of COMMISSION.md §3', () => {
    expect(BANNED.length).toBeGreaterThan(40);
    // The four the slice briefs name by hand, plus one multi-word entry — if the parse ever
    // reads the wrong column (or no table at all) this is what says so.
    expect(BANNED).toEqual(expect.arrayContaining(['open', 'seed', 'recording', 'audit log']));
    expect(BANNED).not.toContain('bench');
  });

  it('DETECTOR CONTROL: fires on the exact line this slice removed', () => {
    expect(bannedWordsIn('No repo clamped yet — open the bench to pick one.')).toEqual(['open']);
  });

  it('DETECTOR CONTROL: masking does not hide a banned word beside a url', () => {
    expect(bannedWordsIn('Jig is on the bench: http://localhost:4600 — open it')).toEqual(['open']);
  });
});
