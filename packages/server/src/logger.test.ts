import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to stderr and never to stdout', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.info('server listening', { port: 4600 });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const line = stderrSpy.mock.calls[0][0] as string;
    expect(line).toContain('INFO');
    expect(line).toContain('server listening');
    expect(line).toContain('"port":4600');
  });

  it('every level writes only to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.debug('d');
    logger.warn('w');
    logger.error('e');

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledTimes(3);
  });
});
