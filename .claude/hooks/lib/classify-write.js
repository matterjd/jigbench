#!/usr/bin/env node
// Write/Edit guard classifier (multi-lock era). Reads the hook JSON on stdin, enumerates
// every lock via ./locks.js, and prints tab-separated records the shell guard acts on:
//
//   EXPIRED\t<did>\t<expiry>          (zero or more — bash appends the --once expiry line)
//   then exactly ONE verdict line:
//   NOROOT | OK | NOLOCKS
//   BADLOCK\t<file>                   unreadable lock file — bash fails CLOSED
//   CONTROL\t<did>\t<tier>            control-plane target — read-only for every session
//   OWNWORK\t<did>\t<tier>            inside the caller's own zone (bash applies the tier: T4 blocks)
//   OTHERZONE\t<did>\t<tier>          inside ANOTHER delegation's zone (collision — block)
//   OUTSIDE\t<did>\t<tier>            owned session outside every zone (containment — block)
//   SCRATCH\t<did>\t<tier>            the session's OWN scratchpad (Matter's ruling 2026-09-08) — allow; T4 stays read-only
//   PEERZONE\t<did>\t<tier>           pure peer writing into a locked zone (collision — block)
//   PEERELSE\t<did1,did2,...>         pure peer elsewhere (allow; bash logs peer-allowed per lock)
//
// Relative file_path resolves against the caller's CWD (the hook event's cwd) for EVERY
// session — pass 7 (mn#47): the old owned-session base, owned[0].zone, misfiled a relative
// write into the alphabetically-first lane once N>1, judging a file other than the one
// actually being written (resolve(cwd, path) IS the write's destination). A drifted owned
// caller writing relatively from outside its zone now classifies OUTSIDE (blocked) instead
// of being silently folded into a zone. Any throw exits non-zero — bash fails CLOSED.
"use strict";
const path = require("path");
const { enumerate } = require("./locks.js");

let s = "";
process.stdin.on("data", d => (s += d));
process.stdin.on("end", () => {
  try {
    main(JSON.parse(s));
  } catch (e) {
    process.exit(3);
  }
});

function main(o) {
  const root = process.env.ROOT || "";
  const locksDir = process.env.LOCKS_DIR || "";
  const sid = process.env.SID || "";
  const lines = [];
  const emit = v => {
    lines.push(v);
    process.stdout.write(lines.join("\n") + "\n");
  };

  if (!root) return emit("NOROOT");

  const win = process.platform === "win32";
  const nrm = p => (win ? p.toLowerCase() : p);
  const sep = path.sep;
  const R = path.resolve(root);

  const recs = enumerate(locksDir, sid);
  for (const r of recs) if (r.kind === "EXPIRED") lines.push(["EXPIRED", r.did, r.expiry].join("\t"));
  const bad = recs.find(r => r.kind === "BADLOCK");
  if (bad) return emit(["BADLOCK", bad.did].join("\t"));

  const live = recs
    .filter(r => r.kind === "LOCK")
    .map(r => ({ ...r, zone: path.resolve(r.work || root) }));

  const f = (o.tool_input && o.tool_input.file_path) || "";
  if (!f) return emit("OK");
  if (!live.length) return emit("NOLOCKS");

  const owned = live.filter(r => r.rel === "owned" || r.rel === "ambig");
  const isPeer = owned.length === 0;
  // Pass 6 (F1): CONTROL and OUTSIDE identify NO zone, so naming one lock there is a guess.
  // On 2026-08-27 that guess (always index 0, and locks.js sorts names) filed one lane's
  // worker blocks into the other lane's blocked.log and never created the first lane's at
  // all. With more than one candidate the honest answer is `_unscoped`, which bash routes
  // to the shared config/delegation-blocked.log. One candidate behaves exactly as before.
  const cands = owned.length ? owned : live;
  const attr = cands.length > 1 ? { did: "_unscoped", tier: "?" } : cands[0];

  // Pass 7 (mn#47): the write's real destination is resolve(cwd, path) — for everyone.
  const base = path.resolve(o.cwd || process.cwd());
  const F = path.resolve(base, f);
  const nF = nrm(F);

  const hooks = nrm(path.resolve(R, ".claude/hooks"));
  const locksD = nrm(path.resolve(R, "config/delegation-locks"));
  const ctrl = [
    path.resolve(R, "config/delegation-active.yml"), // legacy single-lock path: tombstoned, still protected
    path.resolve(R, "SUBAGENT-AUTHORIZATION.md"),
    path.resolve(R, ".claude/settings.json"),
    path.resolve(R, ".claude/settings.local.json"),
  ].map(nrm);
  if (ctrl.includes(nF) || nF === hooks || nF.startsWith(hooks + sep) || nF === locksD || nF.startsWith(locksD + sep)) {
    return emit(["CONTROL", attr.did, attr.tier].join("\t"));
  }

  const inZone = z => {
    const nz = nrm(z);
    return nF === nz || nF.startsWith(nz + sep);
  };

  if (!isPeer) {
    // Pass 8b (Matter's ruling, 2026-09-08): an owned session may write ITS OWN per-session
    // scratchpad under any live lock. mn#50's second finding — the harness advertises the
    // scratchpad to every agent and OUTSIDE denied it. Narrow by construction: the harness temp
    // root, any project slug, THIS session's id, then `scratchpad`; no id -> no carve-out.
    if (sid) {
      const tmpBase = win ? (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Temp") : "") : require("os").tmpdir();
      if (tmpBase) {
        const scratchRoot = nrm(path.resolve(tmpBase, "claude"));
        if (nF.startsWith(scratchRoot + sep)) {
          const segs = nF.slice(scratchRoot.length + 1).split(sep);
          if (segs.length >= 3 && segs[1] === nrm(sid) && segs[2] === "scratchpad") {
            return emit(["SCRATCH", attr.did, attr.tier].join("\t"));
          }
        }
      }
    }
    for (const r of owned) if (inZone(r.zone)) return emit(["OWNWORK", r.did, r.tier].join("\t"));
    for (const r of live) if (inZone(r.zone)) return emit(["OTHERZONE", r.did, r.tier].join("\t"));
    return emit(["OUTSIDE", attr.did, attr.tier].join("\t"));
  }
  for (const r of live) if (inZone(r.zone)) return emit(["PEERZONE", r.did, r.tier].join("\t"));
  return emit(["PEERELSE", live.map(r => r.did).join(",")].join("\t"));
}
