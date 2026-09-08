// packages/bench/src/clamp/api.ts — the Clamp screen's fetch client over S17a's routes
// (AMENDMENT-1 §7, A6): the folder browser (`/api/fs/*`), clamp/unclamp, the target app
// (`/api/target/*`), the docs clamp, and the setup checklist + its two writes.
//
// Every call degrades to `{ ok: false, message }` with the SERVER'S OWN WORDS on any failure
// (`../api/request.ts`) — the screen shows those words in a sentence, never a blank pane. As
// everywhere in the bench, `fetchImpl` is the LAST parameter so a test injects a stub.
import type { DetectedTargetSummary, RecentBenchEntry, Survey, TargetState } from '@jigbench/core';
import { postJson, request, type ApiResult } from '../api/request.js';

export type { ApiResult } from '../api/request.js';

/** One starting point for the folder browser — `~` and `/` on POSIX, a drive letter on Windows. */
export interface FsRoot {
  name: string;
  path: string;
}

/** One directory inside a listing, with the badges that say "this looks like a repo". */
export interface FsEntry {
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
  hasAngularJson: boolean;
  hasCsproj: boolean;
  hasDocs: boolean;
}

export interface FsListing {
  path: string;
  /** `null` at a filesystem root — the browser's "up" has nowhere to go. */
  parent: string | null;
  entries: FsEntry[];
}

/** `POST /api/clamp`'s 200 body. `detected` is optional: the server agent adds it in this same
 * build, and an older server simply never sends it. */
export interface ClampResult {
  ok: true;
  repoRoot: string;
  survey: Survey;
  docsClamped: boolean;
  recent: RecentBenchEntry[];
  detected?: DetectedTargetSummary | null;
}

export interface TargetStartOptions {
  script?: string;
  port?: number;
}

export interface TargetStartAccepted {
  accepted: true;
  port: number;
}

export interface DocsClampResult {
  files: number;
  chunks: number;
  ignoredExtensions: string[];
  file: string;
}

/** `POST /api/setup/mcp` and `/api/setup/desktop` — what-will-change first, written only with
 * `apply: true`. The `diff` FIELD name is the server's; it never reaches the surface as a word. */
export interface SetupWriteResult {
  diff: string;
  changed: boolean;
  wrote: boolean;
}

/** `GET /api/setup` — the checklist one click from the status line. */
export interface SetupChecklist {
  survey: boolean;
  docs: boolean;
  target: TargetState;
  mcp: { written: boolean; path?: string };
  desktop: { written: boolean; path?: string };
  claude: 'installed' | 'none';
  /** #20: what "Start the app" would run — `null` when the server found no dev script; absent
   * from an older server, which the drawer reads the same way. */
  detected?: DetectedTargetSummary | null;
}

export function fsRoots(fetchImpl: typeof fetch = fetch): Promise<ApiResult<{ roots: FsRoot[] }>> {
  return request<{ roots: FsRoot[] }>('/api/fs/roots', fetchImpl);
}

export function fsList(path: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<FsListing>> {
  return request<FsListing>(`/api/fs/list?path=${encodeURIComponent(path)}`, fetchImpl);
}

export function clamp(repoRoot: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<ClampResult>> {
  return postJson<ClampResult>('/api/clamp', { repoRoot }, fetchImpl);
}

export function unclamp(fetchImpl: typeof fetch = fetch): Promise<ApiResult<{ ok: true }>> {
  return postJson<{ ok: true }>('/api/unclamp', {}, fetchImpl);
}

export function targetStart(
  opts: TargetStartOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<TargetStartAccepted>> {
  return postJson<TargetStartAccepted>('/api/target/start', opts, fetchImpl);
}

export function targetStop(fetchImpl: typeof fetch = fetch): Promise<ApiResult<{ ok: true }>> {
  return postJson<{ ok: true }>('/api/target/stop', {}, fetchImpl);
}

export function targetUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<{ ok: true }>> {
  return postJson<{ ok: true }>('/api/target/url', { url }, fetchImpl);
}

export function docsClamp(folder: string, fetchImpl: typeof fetch = fetch): Promise<ApiResult<DocsClampResult>> {
  return postJson<DocsClampResult>('/api/docs/clamp', { folder }, fetchImpl);
}

export function setupMcp(apply: boolean, fetchImpl: typeof fetch = fetch): Promise<ApiResult<SetupWriteResult>> {
  return postJson<SetupWriteResult>('/api/setup/mcp', { apply }, fetchImpl);
}

export function setupDesktop(apply: boolean, fetchImpl: typeof fetch = fetch): Promise<ApiResult<SetupWriteResult>> {
  return postJson<SetupWriteResult>('/api/setup/desktop', { apply }, fetchImpl);
}

export function getSetup(fetchImpl: typeof fetch = fetch): Promise<ApiResult<SetupChecklist>> {
  return request<SetupChecklist>('/api/setup', fetchImpl);
}
