#!/usr/bin/env node
// Classify the DELETE / RENAME targets of a command against the protected roots.
//
// stdin: newline-separated candidate targets — the output of write-targets.js, which may
//        end with a literal "AMBIGUOUS" line when its parse hit something it could not
//        be sure about.
// argv:  the protected roots (control root, then every active work zone).
// exit:  0 = no target endangers a root         -> ALLOW
//        1 = a target IS a root, CONTAINS one, or cannot be resolved -> BLOCK
//        2 = usage error                        -> caller must fail closed
// stdout: on BLOCK, one line: "<target>\t<why>"
//
// WHY THIS EXISTS (roadmap P2.5, maintenance pass 3). The rule this replaces matched
// MENTIONS of a protected path anywhere in the command string, so an ordinary
// `cd <repo> && rm -rf dist` was refused as a repo delete. That cost three sessions in two
// months (2026-07-06 budget-automation, 07-21 wisp, 08-01 command-center). The fix is
// better TARGETING, never a weaker rule: every case the old rule was written to stop still
// blocks, and the suite pins both polarities.
//
// DESTRUCTION IS HELD TO A STRICTER BAR THAN CONTROL-PLANE WRITES. write-targets.js
// documents targets built from $VAR or command substitution as accepted false-ALLOWS —
// tolerable for a write, which is recoverable, and not for an `rm -rf`, which is not.
// Anything unresolvable here BLOCKS: a variable, a glob, a relative path containing . or
// .., a bare name colliding with a protected root's own basename, or an AMBIGUOUS parse.
"use strict";

const WIN = process.platform === "win32";

function norm(p) {
  let t = String(p).replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (t.length > 1) t = t.replace(/\/+$/, "");
  return t;
}

function isAbs(t) {
  return /^\//.test(t) || /^[A-Za-z]:(\/|$)/.test(t);
}

// Textual .. resolution. Deliberately NOT realpath(): the target usually does not exist
// yet (or is about to stop existing), and a filesystem call in a PreToolUse hook is a
// latency and failure surface. Textual canonicalisation cannot be fooled into ALLOWING
// here — it can only over-approximate toward blocking.
function canon(t) {
  const m = /^([A-Za-z]:)?\//.exec(t);
  const prefix = m ? m[0] : "";
  const out = [];
  for (const seg of t.slice(prefix.length).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { out.pop(); continue; }
    out.push(seg);
  }
  return prefix + out.join("/");
}

const key = t => (WIN ? t.toLowerCase() : t);
const basename = t => norm(t).split("/").pop();

const roots = process.argv.slice(2).map(norm).filter(Boolean);
if (!roots.length) process.exit(2);

let input = "";
process.stdin.on("data", d => (input += d));
process.stdin.on("end", () => {
  const lines = input.split("\n").map(s => s.trim()).filter(Boolean);

  const block = (t, why) => {
    process.stdout.write(`${t}\t${why}\n`);
    process.exit(1);
  };

  // No target extracted, and the parse was confident. The destructive-verb regex that
  // gated this call matched text that is not a parsed command's argument — an `rm -rf`
  // inside a grep pattern, a commit message, or an issue body. Those are exactly the
  // mentions this change exists to stop blocking. An unsure parse emits AMBIGUOUS and is
  // handled below, so silence here really does mean "nothing is being deleted".
  if (!lines.length) process.exit(0);

  for (const raw of lines) {
    if (raw === "AMBIGUOUS") block(raw, "command could not be parsed");

    const t = norm(raw);
    if (!t) block(raw, "empty target");
    if (/[$`]/.test(t)) block(t, "unresolvable: variable or command substitution");
    if (/[*?[]/.test(t)) block(t, "unresolvable: glob");
    if (/^~/.test(t)) block(t, "unresolvable: home expansion");

    if (isAbs(t)) {
      const c = key(canon(t));
      if (c === "" || c === "/" || /^[a-z]:$/.test(c)) block(t, "filesystem root");
      for (const r of roots) {
        const rc = key(canon(r));
        if (c === rc) block(t, `target IS protected root ${r}`);
        if (rc.startsWith(c + "/")) block(t, `target is an ANCESTOR of protected root ${r}`);
      }
    } else {
      // Relative: the cwd is unknowable from a PreToolUse payload (a leading `cd` may have
      // moved it), so anything that could climb, or that names a repo directly, fails closed.
      if (t.split("/").some(s => s === "." || s === "..")) {
        block(t, "relative path containing . or .. (cwd is unknowable here)");
      }
      const bn = key(basename(t));
      for (const r of roots) {
        if (bn === key(basename(r))) {
          block(t, `relative name collides with the basename of protected root ${r}`);
        }
      }
    }
  }

  process.exit(0);
});
