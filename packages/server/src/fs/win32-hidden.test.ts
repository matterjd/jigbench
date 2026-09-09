import { describe, expect, it } from 'vitest';
import { parseAttribOutput } from './win32-hidden.js';

/**
 * #24: the parse half of the hidden/system filter, provable on every platform. The route test in
 * `route.test.ts` sets the real attributes and must skip off win32; this one reads the output
 * `attrib /d C:\*` actually produces, so the ubuntu leg still fails if the parse breaks.
 */

// Real `attrib /d C:\*` shape: a fixed attribute field, then the full path. The drive's colon is
// the first colon on the line, which is what tells the two halves apart.
const DRIVE_ROOT_OUTPUT = [
  'A  SHR       C:\\bootmgr',
  '   SH        C:\\$Recycle.Bin',
  '   SH        C:\\System Volume Information',
  '    H        C:\\$WINDOWS.~BT',
  '   SH        C:\\Recovery',
  '             C:\\PerfLogs',
  'A            C:\\Shipping',
  '             C:\\my-app',
  '',
].join('\r\n');

describe('parseAttribOutput', () => {
  it('flags the hidden and system folders at a drive root, and nothing else', () => {
    const names = ['$Recycle.Bin', 'System Volume Information', '$WINDOWS.~BT', 'Recovery', 'PerfLogs', 'Shipping', 'my-app'];
    const flagged = parseAttribOutput('C:\\', names, DRIVE_ROOT_OUTPUT);
    expect([...flagged].sort()).toEqual(['$Recycle.Bin', '$WINDOWS.~BT', 'Recovery', 'System Volume Information']);
  });

  it('never reads an H or an S out of the name itself — only out of the attribute field', () => {
    // 'Shipping' and 'System Volume Information' both carry S and H in their names; only the one
    // whose attribute field says so is flagged, above. Here nothing is flagged at all.
    const flagged = parseAttribOutput('C:\\', ['Shipping', 'PerfLogs'], 'A            C:\\Shipping\r\n             C:\\PerfLogs\r\n');
    expect([...flagged]).toEqual([]);
  });

  it('matches case-insensitively (Windows paths are) and answers with readdir\u2019s own spelling', () => {
    const flagged = parseAttribOutput('C:\\Users\\Matter\\code', ['MyRepo'], '   SH        c:\\users\\matter\\code\\myrepo\r\n');
    expect([...flagged]).toEqual(['MyRepo']);
  });

  it('ignores a line for anything but a direct child of the listed directory', () => {
    const stdout = [
      '   SH        C:\\code\\nested\\deep', // no `/s` is passed, but never trust it either
      '   SH        C:\\other\\hidden',
      '   SH        C:\\code',
      '',
    ].join('\r\n');
    expect([...parseAttribOutput('C:\\code', ['nested', 'hidden', 'deep'], stdout)]).toEqual([]);
  });

  it('ignores lines with no path at all (an "Access denied" or a blank), flagging nothing', () => {
    const stdout = ['Access denied - C:\\code\\locked', '', 'Parameter format not correct - "x"', ''].join('\r\n');
    expect([...parseAttribOutput('C:\\code', ['locked'], stdout)]).toEqual([]);
  });
});
