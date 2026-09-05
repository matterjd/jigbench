// Dev entry point — `npm run dev` in this package runs this under `tsx watch`. Not part of
// the published build (excluded from tsconfig.json); it exists purely to give a developer a
// server pointed at the repo they're standing in, proxying the bench to Vite's own port
// (see packages/bench's `dev` script for the matching half).
import { createJigServer } from './http.js';

const repoRoot = process.cwd();
const port = Number(process.env.JIG_PORT ?? 4600);
const benchDevServerUrl = process.env.JIG_BENCH_DEV_URL ?? 'http://localhost:5173';

createJigServer({ repoRoot, port, openBrowser: false, benchDevServerUrl }).then(
  (handle) => {
    // eslint-disable-next-line no-console -- dev-only entry point, never shipped
    process.stderr.write(`[dev] jig server: ${handle.url} (bench proxied to ${benchDevServerUrl})\n`);
  },
  (err: unknown) => {
    process.stderr.write(`[dev] failed to start: ${String(err)}\n`);
    process.exitCode = 1;
  },
);
