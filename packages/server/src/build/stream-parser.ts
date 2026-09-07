import type { BuildStreamEvent } from './types.js';

/**
 * `claude -p --output-format stream-json --verbose` emits one JSON object per line (NDJSON).
 * This is the shape as documented by the Claude Code / Agent SDK's own streaming output and
 * mirrored by the fake `claude` test double (`__fixtures__/fake-claude.mjs`) this runner is
 * tested against — no real `claude -p` session ran to observe it directly (the brief
 * forbids that outside the one opt-in `JIG_LIVE_CLAUDE=1` live check), so this parser is
 * deliberately tolerant: any line whose `type` (or shape) isn't one of the four below
 * degrades to a `raw` event rather than being dropped or throwing — a real CLI emitting one
 * more event kind than expected here still shows up in the stream, just unclassified.
 *
 * Known shapes:
 *   {"type":"system","subtype":"init","session_id":"..."}
 *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]},"session_id":"..."}
 *   {"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{...}}]}}
 *   {"type":"user","message":{"content":[{"type":"tool_result","is_error":false,...}]}}
 *   {"type":"result","subtype":"success"|"error","is_error":bool,"result":"...","session_id":"...","num_turns":n,"total_cost_usd":n}
 */

interface RawContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  is_error?: boolean;
}

interface RawEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: unknown;
  num_turns?: number;
  total_cost_usd?: number;
  message?: { content?: RawContentBlock[] };
}

/** The short, human-scannable "target" for a tool call — the file path, glob/grep pattern,
 * shell command, or URL a caller passed it, whichever the tool actually has. Never throws on
 * an unexpected/missing input shape; falls back to the empty string. */
function toolTargetFrom(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const candidate = input.file_path ?? input.path ?? input.pattern ?? input.command ?? input.url ?? input.query;
  return typeof candidate === 'string' ? candidate : '';
}

function firstMeaningfulBlock(content: RawContentBlock[] | undefined): BuildStreamEvent | null {
  for (const block of content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') {
      return { kind: 'text', text: block.text };
    }
    if (block.type === 'tool_use') {
      return { kind: 'tool', name: typeof block.name === 'string' ? block.name : 'tool', target: toolTargetFrom(block.input) };
    }
    if (block.type === 'tool_result') {
      return { kind: 'tool_result', ok: block.is_error !== true };
    }
  }
  return null;
}

/** `null` for a blank line (never emitted as an event); every non-blank line always yields
 * SOME event — unparseable JSON and an unrecognized shape both degrade to `raw` rather than
 * being silently dropped, so nothing in the transcript ever vanishes from the live stream. */
export function parseStreamLine(line: string): BuildStreamEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let raw: RawEvent;
  try {
    raw = JSON.parse(trimmed) as RawEvent;
  } catch {
    return { kind: 'raw', text: trimmed };
  }

  switch (raw.type) {
    case 'system':
      if (raw.subtype === 'init' && typeof raw.session_id === 'string') {
        return { kind: 'init', sessionId: raw.session_id };
      }
      return { kind: 'raw', text: trimmed };

    case 'assistant':
    case 'user': {
      const block = firstMeaningfulBlock(raw.message?.content);
      return block ?? { kind: 'raw', text: trimmed };
    }

    case 'result':
      return {
        kind: 'result',
        ok: raw.is_error !== true,
        sessionId: raw.session_id,
        summary: typeof raw.result === 'string' ? raw.result : undefined,
        numTurns: raw.num_turns,
        costUsd: raw.total_cost_usd,
      };

    default:
      return { kind: 'raw', text: trimmed };
  }
}

/** `FILES: a, b, c` — the exact report line `prompt.ts`'s fixed Rules block asks the model
 * to end with. Scans every line of `text` (not just the last) since a model may add trailing
 * prose after it; the FIRST match wins, comma-split and trimmed, empty entries dropped. */
export function extractFilesLine(text: string): string[] | null {
  const match = /^FILES:\s*(.*)$/m.exec(text);
  if (!match) return null;
  return match[1]!
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}
