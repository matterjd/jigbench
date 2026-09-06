import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface LaunchSettings {
  profiles?: Record<string, { applicationUrl?: string }>;
}

/** The `applicationUrl` of the first profile in `Properties/launchSettings.json` that names
 * one — tier (b)'s only input. `undefined` when the file is missing, unparsable, or no
 * profile names a URL, in which case the caller falls through to the regex-lite tier. */
export async function readApplicationUrl(appRoot: string): Promise<string | undefined> {
  const file = join(appRoot, 'Properties', 'launchSettings.json');
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return undefined;
  }

  let settings: LaunchSettings;
  try {
    settings = JSON.parse(raw) as LaunchSettings;
  } catch {
    return undefined;
  }

  for (const profile of Object.values(settings.profiles ?? {})) {
    if (profile.applicationUrl) return profile.applicationUrl.split(';')[0];
  }
  return undefined;
}
