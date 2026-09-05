import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClampCommand } from './clamp.js';

async function tmp(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('runClampCommand', () => {
  it('clamps a folder and prints a one-screen summary by kind, with the output path', async () => {
    const repoRoot = await tmp('jig-clamp-cmd-repo-');
    const docsDir = await tmp('jig-clamp-cmd-docs-');
    await writeFile(join(docsDir, 'guide.md'), '# Guide\n\nRead this first.\n');
    await writeFile(join(docsDir, 'notes.txt'), 'Plain notes here.\n');
    await writeFile(join(docsDir, 'diagram.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { message } = await runClampCommand({ repo: repoRoot, docs: docsDir });

    expect(message).toContain('md: 1 file');
    expect(message).toContain('txt: 1 file');
    expect(message).toContain('Ignored extensions: .png');
    expect(message).toContain('.jig');
    expect(message).toContain('docs.json');

    const file = join(repoRoot, '.jig', 'survey', 'docs.json');
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.files).toHaveLength(2);
  });

  it('reports "no docs found" for an empty folder — not an error', async () => {
    const repoRoot = await tmp('jig-clamp-cmd-repo-');
    const emptyDocs = await tmp('jig-clamp-cmd-empty-');

    const { message } = await runClampCommand({ repo: repoRoot, docs: emptyDocs });

    expect(message).toContain('No docs found');
  });

  it('lists ignored extensions even when nothing supported was found', async () => {
    const repoRoot = await tmp('jig-clamp-cmd-repo-');
    const docsDir = await tmp('jig-clamp-cmd-unsupported-');
    await writeFile(join(docsDir, 'image.png'), Buffer.from([0x89, 0x50]));

    const { message } = await runClampCommand({ repo: repoRoot, docs: docsDir });

    expect(message).toContain('No docs found');
    expect(message).toContain('Ignored extensions: .png');
  });
});
