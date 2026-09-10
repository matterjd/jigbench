#!/usr/bin/env node
// Delegation lock enumeration for the guard hooks (multi-lock era).
// Locks are flat `key: value` files under config/delegation-locks/<delegation_id>.yml,
// written only by activate-lock.sh (atomic) and deleted by release-lock.sh. No YAML lib.
//
// Env:  LOCKS_DIR  — the lock directory (required; absent dir = zero locks)
//       SID        — caller's CLAUDE_CODE_SESSION_ID ("" if the harness doesn't surface it)
//
// stdout, tab-separated, one record per line:
//   EXPIRED\t<did>\t<expiry>                                 — active lock whose expiry passed
//   BADLOCK\t<file>                                          — unreadable lock file (callers fail CLOSED)
//   LOCK\t<did>\t<tier>\t<owner>\t<work>\t<hash>\t<rel>      — live lock
// rel: owned  (SID present and equals owner_session)
//      peer   (both present and different — POSITIVE identification)
//      ambig  (owner or SID blank — callers treat as owned/confined, the pre-peer fail-safe)
//
// Expiry semantics: blank = no backstop (live). Unparseable = live (fail-closed in the
// confining direction — a lock that cannot prove it expired still confines).
"use strict";
const fs = require("fs");
const path = require("path");

function parseLock(file) {
  const out = {};
  const txt = fs.readFileSync(file, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const i = raw.indexOf(":");
    if (i < 1) continue;
    const k = raw.slice(0, i).trim();
    let v = raw.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function classifyRel(owner, sid) {
  if (!owner || !sid) return "ambig";
  return owner === sid ? "owned" : "peer";
}

// Returns an array of records: {kind, did, tier, owner, work, hash, rel, expiry, file}
function enumerate(locksDir, sid) {
  const recs = [];
  let names = [];
  try {
    names = fs.readdirSync(locksDir).filter(n => n.endsWith(".yml"));
  } catch (e) {
    return recs; // no directory => no locks
  }
  for (const n of names.sort()) {
    const file = path.join(locksDir, n);
    let L;
    try {
      L = parseLock(file);
    } catch (e) {
      recs.push({ kind: "BADLOCK", did: n });
      continue;
    }
    if (String(L.active) !== "true") continue; // inactive file: ignore (release deletes; tolerate)
    const did = L.delegation_id || n.replace(/\.yml$/, "");
    const expiry = L.expiry || "";
    if (expiry) {
      const t = Date.parse(expiry);
      if (!Number.isNaN(t) && t < Date.now()) {
        recs.push({ kind: "EXPIRED", did, expiry });
        continue;
      }
      // NaN (garbage) => live: fail-closed keeps confinement on
    }
    recs.push({
      kind: "LOCK",
      did,
      tier: L.tier || "",
      owner: L.owner_session || "",
      work: L.work_repo_path || "",
      hash: L.release_hash || "",
      rel: classifyRel(L.owner_session || "", sid || ""),
    });
  }
  return recs;
}

module.exports = { parseLock, enumerate };

if (require.main === module) {
  const locksDir = process.env.LOCKS_DIR || "";
  const sid = process.env.SID || "";
  // Empty fields are emitted as "-" — bash `read` with IFS=tab COLLAPSES runs of tabs
  // (tab is an IFS whitespace char), which would silently shift fields. Consumers map
  // "-" back to "". SIDs are UUIDs and zones are paths, so "-" is never a real value.
  const dash = v => (v === "" ? "-" : v);
  const out = [];
  for (const r of enumerate(locksDir, sid)) {
    if (r.kind === "EXPIRED") out.push(["EXPIRED", r.did, dash(r.expiry)].join("\t"));
    else if (r.kind === "BADLOCK") out.push(["BADLOCK", r.did].join("\t"));
    else out.push(["LOCK", r.did, dash(r.tier), dash(r.owner), dash(r.work), dash(r.hash), r.rel].join("\t"));
  }
  process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
}
