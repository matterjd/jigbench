import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMcpCommand } from './mcp.js';

describe('runMcpCommand (S1: MCP itself arrives in S6)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes nothing to stdout, logs why to stderr, and leaves a zero exit code', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const originalExitCode = process.exitCode;

    await runMcpCommand({ repo: process.cwd() });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('MCP arrives in S6');
    expect(process.exitCode).toBe(0);

    process.exitCode = originalExitCode;
  });
});
