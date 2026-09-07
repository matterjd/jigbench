#!/usr/bin/env node
// A small stand-in for `claude -p --output-format stream-json` — never a real Claude Code
// process. `runner.test.ts` spawns this via `{ command: process.execPath, commandArgsPrefix:
// [thisFile] }` (no shell, so `cancel()`'s kill-by-PID lands on this exact process). Every
// knob below is read from the environment so a test can control the outcome without arguments
// (the real CLI's own `-p`/`--output-format`/etc. flags are still passed through by
// `BuildRunner`, and are simply ignored here — this script never parses argv).
//
// Env knobs:
//   FAKE_CLAUDE_MODE            'success' (default) | 'fail' | 'crash' | 'slow' | 'no-files'
//   FAKE_CLAUDE_FILES           comma list for the FILES: line, default "README.md"
//   FAKE_CLAUDE_DELAY_MS        ms between each streamed line (default 0; 'slow' mode ignores
//                               this and instead waits FAKE_CLAUDE_SLOW_MS before its first
//                               line, giving a test time to cancel before anything streams)
//   FAKE_CLAUDE_SLOW_MS         default 5000
//   FAKE_CLAUDE_SESSION_ID      default 'fake-session'
//   FAKE_CLAUDE_STDIN_OUT       if set, the prompt text this process received on stdin is
//                               written there verbatim — lets a test assert what was piped in.

// `BuildRunner.isClaudeAvailable()` spawns this exact same script with `--version` appended
// — answer it immediately, the way the real `claude --version` does (no stdin read, no
// simulated work), or every availability probe would inherit whatever slow/failing mode a
// test configured for the real build it's ALSO about to make, which is not what "is claude
// installed" is asking.
if (process.argv.includes('--version')) {
  process.stdout.write('9.9.9 (fake-claude)\n');
  process.exit(0);
}

const mode = process.env.FAKE_CLAUDE_MODE ?? 'success';
const files = process.env.FAKE_CLAUDE_FILES ?? 'README.md';
const delayMs = Number(process.env.FAKE_CLAUDE_DELAY_MS ?? '0');
const slowMs = Number(process.env.FAKE_CLAUDE_SLOW_MS ?? '5000');
const sessionId = process.env.FAKE_CLAUDE_SESSION_ID ?? 'fake-session';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const promptText = await readStdin();
  if (process.env.FAKE_CLAUDE_STDIN_OUT) {
    await import('node:fs/promises').then((fs) => fs.writeFile(process.env.FAKE_CLAUDE_STDIN_OUT, promptText, 'utf8'));
  }

  if (mode === 'crash') {
    process.stderr.write('fake-claude: simulated crash before any output\n');
    process.exit(1);
  }

  if (mode === 'slow') {
    await sleep(slowMs);
    // If we get here, nothing killed us in time — emit a normal success run so the test can
    // tell "cancelled" and "ran to completion slowly" apart.
  } else if (delayMs > 0) {
    await sleep(delayMs);
  }

  emit({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd() });
  if (delayMs > 0) await sleep(delayMs);

  emit({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Looking at the repo.' }] },
    session_id: sessionId,
  });
  if (delayMs > 0) await sleep(delayMs);

  emit({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Edit', input: { file_path: files.split(',')[0]?.trim() ?? 'README.md' } }] },
    session_id: sessionId,
  });
  if (delayMs > 0) await sleep(delayMs);

  emit({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', is_error: false, content: 'ok' }] },
    session_id: sessionId,
  });
  if (delayMs > 0) await sleep(delayMs);

  if (mode === 'fail') {
    const finalText = 'Ran into a compile error and could not finish.';
    emit({
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: finalText }] },
      session_id: sessionId,
    });
    emit({
      type: 'result',
      subtype: 'error',
      is_error: true,
      result: finalText,
      session_id: sessionId,
      num_turns: 2,
      total_cost_usd: 0.001,
    });
    process.exit(1);
  }

  const finalText = mode === 'no-files' ? 'Done, but I forgot to report which files I touched.' : `Done.\n\nFILES: ${files}`;
  emit({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: finalText }] },
    session_id: sessionId,
  });
  emit({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: finalText,
    session_id: sessionId,
    num_turns: 3,
    total_cost_usd: 0.002,
  });
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`fake-claude: ${err?.stack ?? err}\n`);
  process.exit(1);
});
