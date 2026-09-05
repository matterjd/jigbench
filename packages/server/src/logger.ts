/**
 * stdout is reserved for MCP's JSON-RPC stream (AGENTS.md "stdout is reserved"). Every log
 * line from this process — server or cli — goes to stderr and nowhere else. Never import
 * `console` for logging in this package; use this logger instead.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...meta: unknown[]): void;
  info(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
}

function formatMeta(meta: unknown[]): string {
  if (meta.length === 0) return '';
  return ' ' + meta.map((m) => (typeof m === 'string' ? m : safeJson(m))).join(' ');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function write(level: LogLevel, message: string, meta: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}${formatMeta(meta)}\n`;
  process.stderr.write(line);
}

export const logger: Logger = {
  debug: (message, ...meta) => write('debug', message, meta),
  info: (message, ...meta) => write('info', message, meta),
  warn: (message, ...meta) => write('warn', message, meta),
  error: (message, ...meta) => write('error', message, meta),
};
