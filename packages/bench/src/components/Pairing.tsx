import { useEffect, useState } from 'react';

/**
 * "The tongue, paired at first encounter" (COMMISSION.md §3, concept-a F14). Every shop word
 * (Bench, Loupe, Release, …) is paired with its plain-English word the FIRST time a reader
 * meets it in a session, and shown bare after that — a tooltip, a tab label, a chip, wherever
 * it first appears. `sessionKey` distinguishes independent "first encounters" (the rail's
 * Loupe tooltip and the palette's Loupe item each earn their own), defaulting to `word` when
 * the surface has only one place that word could show up.
 */
const seenPairings = new Set<string>();

export interface PairingProps {
  /** The shop word — "Loupe", "Release", "Bench", … */
  word: string;
  /** The plain-word pairing shown once, e.g. "point at anything and see what it is". */
  plain: string;
  /** Distinguishes this occurrence's first encounter from another surface using the same
   * word. Defaults to `word` when there is only one such surface. */
  sessionKey?: string;
}

/** Renders "Word — plain word" the first time `sessionKey` (or `word`) is encountered in this
 * session, and "Word" alone afterward. The encounter is recorded at mount, in a module-level
 * set that outlives any single instance — a later mount of the *same* key, even in an
 * unrelated component, has already been "met". */
export function Pairing({ word, plain, sessionKey }: PairingProps) {
  const key = sessionKey ?? word;
  const [isFirst] = useState(() => !seenPairings.has(key));

  useEffect(() => {
    seenPairings.add(key);
    // Intentionally no cleanup: unmounting must not "un-meet" a word the reader already saw.
  }, [key]);

  return (
    <span className="jig-pairing">
      {word}
      {isFirst && <span className="jig-pairing__plain"> — {plain}</span>}
    </span>
  );
}

/** Test-only escape hatch — production code never calls this; a real session's "first
 * encounter" state should never reset itself mid-session. */
export function resetPairingsForTests(): void {
  seenPairings.clear();
}
