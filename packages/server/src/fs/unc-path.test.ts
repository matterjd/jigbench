import { describe, expect, it } from 'vitest';
import { isUncPath } from './unc-path.js';

// #18: a UNC value handed to `stat` makes Windows open an SMB connection to the named host —
// refused by its spelling, before any filesystem call, on every OS.
describe('isUncPath', () => {
  it('recognises both spellings of a UNC prefix, and the Windows device/long-path prefixes', () => {
    expect(isUncPath('\\\\evil.example\\share')).toBe(true);
    expect(isUncPath('//evil.example/share')).toBe(true);
    expect(isUncPath('\\\\?\\C:\\repo')).toBe(true);
    expect(isUncPath('\\\\.\\pipe\\x')).toBe(true);
    expect(isUncPath('  \\\\evil.example\\share')).toBe(true); // leading whitespace is no disguise
    expect(isUncPath('\\/evil.example/share')).toBe(true); // mixed separators either
  });

  it('leaves every ordinary local path alone', () => {
    expect(isUncPath('C:\\Users\\matte\\repo')).toBe(false);
    expect(isUncPath('/home/matte/repo')).toBe(false);
    expect(isUncPath('/')).toBe(false);
    expect(isUncPath('\\repo')).toBe(false); // one leading separator is drive-relative, not UNC
    expect(isUncPath('repo')).toBe(false);
    expect(isUncPath('')).toBe(false);
  });
});
