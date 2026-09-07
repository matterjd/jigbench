import type { FsEntry, FsRoot } from './api.js';
import type { FolderBrowser as FolderBrowserState } from './useFolderBrowser.js';
import './FolderBrowser.css';

export interface FolderBrowserProps {
  browser: FolderBrowserState;
  /** Called with the folder's path when a row is clicked — the chosen-path field follows the
   * browser, so navigating INTO a folder and picking it are the same gesture. */
  onPick(path: string): void;
}

/** The badges a row carries — only the ones that are true, in a fixed order. */
function badgesFor(entry: FsEntry): string[] {
  const out: string[] = [];
  if (entry.hasGit) out.push('git');
  if (entry.hasPackageJson) out.push('package.json');
  if (entry.hasAngularJson) out.push('angular.json');
  if (entry.hasCsproj) out.push('.csproj');
  if (entry.hasDocs) out.push('docs');
  return out;
}

/** The root the current path sits under. On POSIX every path starts with `/`, so the LONGEST
 * matching root wins — `~` over `/` for anything under home — and exactly one pill is pressed. */
function activeRootPath(roots: FsRoot[], path: string | null): string | null {
  if (path === null) return null;
  let best: FsRoot | null = null;
  for (const root of roots) {
    if (path.startsWith(root.path) && (best === null || root.path.length > best.path.length)) best = root;
  }
  return best?.path ?? null;
}

/** Jig's own folder browser (AMENDMENT-1 §7, A6) — a page cannot receive a real path from the OS
 * picker, so this lists directories from `/api/fs/*` with the badges that say "a repo lives
 * here". No spinner: a read in flight is the sentence "reading <path> …". */
export function FolderBrowser({ browser, onPick }: FolderBrowserProps) {
  const active = activeRootPath(browser.roots, browser.path);
  const atTop = browser.parent === null;

  function pick(entry: FsEntry): void {
    browser.goTo(entry.path);
    onPick(entry.path);
  }

  return (
    <div className="jig-folder">
      {browser.roots.length > 0 && (
        <div className="jig-folder__roots" role="group" aria-label="where to start">
          {browser.roots.map((root) => (
            <button
              key={root.path}
              type="button"
              className="jig-folder__root"
              aria-pressed={root.path === active}
              onClick={() => browser.goTo(root.path)}
            >
              {root.name}
            </button>
          ))}
        </div>
      )}

      <div className="jig-folder__here">
        <span className="jig-folder__path">{browser.path ?? '—'}</span>
        <button type="button" className="jig-folder__hair" disabled={atTop} onClick={() => browser.up()}>
          up
          {atTop && <span className="jig-folder__why"> · at the top</span>}
        </button>
      </div>

      {browser.status === 'failed' && browser.message && <p className="jig-folder__say">{browser.message}</p>}

      {browser.status === 'reading' ? (
        <p className="jig-folder__say">{`reading ${browser.pending ?? browser.path ?? ''} …`}</p>
      ) : browser.entries.length === 0 ? (
        <p className="jig-folder__say">
          nothing here but files — a repo folder carries a git, package.json, angular.json or .csproj badge
        </p>
      ) : (
        <div className="jig-folder__list">
          {browser.entries.map((entry) => {
            const badges = badgesFor(entry);
            return (
              <button key={entry.path} type="button" className="jig-folder__row" onClick={() => pick(entry)}>
                <span className="jig-folder__name">{entry.name}</span>
                {badges.length > 0 && (
                  <span className="jig-folder__badges">
                    {badges.map((badge) => (
                      <span key={badge} className="jig-folder__badge">
                        {badge}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
