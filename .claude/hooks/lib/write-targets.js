#!/usr/bin/env node
// Extract WRITE TARGETS from a shell command string. Guardrail-grade, not a full shell
// parser: the goal is that a command blocks only when a control-plane path is the actual
// destination of a write (redirect target, or file argument of a write command), never
// because it merely MENTIONS a protected path in a grep pattern, issue body, or prose.
//
// stdin:  the command string.
// stdout: one extracted target per line; a final "AMBIGUOUS" line when the parse hit
//         something it cannot be sure about — callers then fall back to the legacy
//         mention-based rule (fail-closed only where control paths are actually named).
//
// Accepted false-ALLOWS (doctrine: guardrail, not a sandbox — same class as the documented
// indirection bypass): targets built from $VAR or command substitution are opaque here.
// Interior commands of substitutions ARE scanned, so `$(rm ... )` still yields targets.
"use strict";

const MARK = "\x01"; // placeholder for elided substitutions inside a word

let ambiguous = false;
const targets = [];

function addTarget(w) {
  const t = w.split(MARK).join("");
  if (t) targets.push(t);
}

// ---- pass 1: quote/heredoc/substitution-aware split into simple segments ----------------

function findSubstEnd(cmd, start) {
  // cmd[start] === "$", cmd[start+1] === "(" — find the matching ")" (nesting + quotes)
  let depth = 0, i = start + 1, q = null;
  for (; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = null; continue; }
    if (q === '"') { if (c === '"' && cmd[i - 1] !== "\\") q = null; continue; }
    if (c === "'" ) { q = c; continue; }
    if (c === '"' ) { q = c; continue; }
    if (c === "\\") { i++; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function scan(cmd, depth) {
  if (depth > 3) { ambiguous = true; return; }
  const segs = [];
  let cur = "";
  let i = 0;
  const n = cmd.length;
  let q = null;
  const pendingHeredocs = [];

  const flush = () => { segs.push(cur); cur = ""; };

  while (i < n) {
    const c = cmd[i];
    if (q === "'") {
      cur += c; i++;
      if (c === "'") q = null;
      continue;
    }
    if (c === "\\") { cur += c + (cmd[i + 1] || ""); i += 2; continue; }
    if (q === '"') {
      if (c === '"') { q = null; cur += c; i++; continue; }
      if (c === "$" && cmd[i + 1] === "(") {
        const e = findSubstEnd(cmd, i);
        if (e === -1) { ambiguous = true; i = n; continue; }
        scan(cmd.slice(i + 2, e), depth + 1);
        cur += MARK; i = e + 1; continue;
      }
      if (c === "`") {
        const e = cmd.indexOf("`", i + 1);
        if (e === -1) { ambiguous = true; i = n; continue; }
        scan(cmd.slice(i + 1, e), depth + 1);
        cur += MARK; i = e + 1; continue;
      }
      cur += c; i++; continue;
    }
    // unquoted
    if (c === "'" || c === '"') { q = c; cur += c; i++; continue; }
    if (c === "$" && cmd[i + 1] === "(") {
      const e = findSubstEnd(cmd, i);
      if (e === -1) { ambiguous = true; i = n; continue; }
      scan(cmd.slice(i + 2, e), depth + 1);
      cur += MARK; i = e + 1; continue;
    }
    if (c === "`") {
      const e = cmd.indexOf("`", i + 1);
      if (e === -1) { ambiguous = true; i = n; continue; }
      scan(cmd.slice(i + 1, e), depth + 1);
      cur += MARK; i = e + 1; continue;
    }
    if (c === "<" && cmd[i + 1] === "<" && cmd[i + 2] === "<") { cur += " "; i += 3; continue; } // herestring: data, not a target
    if (c === "<" && cmd[i + 1] === "<") {
      // heredoc: record the terminator; body lines are skipped at the next newline
      let j = i + 2;
      if (cmd[j] === "-") j++;
      while (j < n && (cmd[j] === " " || cmd[j] === "\t")) j++;
      let t = "";
      while (j < n && !" \t\n;|&<>".includes(cmd[j])) {
        const d = cmd[j];
        if (d === "'" || d === '"') { j++; continue; }
        if (d === "\\") { j++; t += cmd[j] || ""; j++; continue; }
        t += d; j++;
      }
      if (!t) { ambiguous = true; i = j; continue; }
      pendingHeredocs.push(t);
      i = j; continue;
    }
    if (c === "\n") {
      if (pendingHeredocs.length) {
        let j = i + 1;
        while (pendingHeredocs.length) {
          const term = pendingHeredocs.shift();
          let found = false;
          while (j <= n) {
            let e = cmd.indexOf("\n", j);
            if (e === -1) e = n;
            const line = cmd.slice(j, e).replace(/^\t+/, "");
            j = e + 1;
            if (line === term) { found = true; break; }
            if (e === n) break;
          }
          if (!found) { ambiguous = true; pendingHeredocs.length = 0; break; }
        }
        flush(); i = j; continue;
      }
      flush(); i++; continue;
    }
    if (c === ";") { flush(); i++; continue; }
    if (c === "&" && cmd[i + 1] === "&") { flush(); i += 2; continue; }
    if (c === "|" && cmd[i + 1] === "|") { flush(); i += 2; continue; }
    if (c === "|") { flush(); i++; continue; }
    if (c === "&" && cmd[i + 1] === ">") { cur += c; i++; continue; } // &> is a redirect, keep in segment
    if (c === "&" && cur.endsWith(">")) { cur += c; i++; continue; }  // >&N / 2>&1 fd-dup, not a background separator
    if (c === "&") { flush(); i++; continue; }
    cur += c; i++;
  }
  if (q) ambiguous = true;                    // unbalanced quote
  if (pendingHeredocs.length) ambiguous = true; // unterminated heredoc
  flush();
  for (const s of segs) segment(s, depth);
}

// ---- pass 2: per-segment tokenization + target extraction --------------------------------

// at s[i] (token start or word break), match a redirect operator.
// Returns {len, kind} — kind: "out" (has a file target), "dup" (fd dup, no target),
// "in" (input, next word is data) — or null.
function matchRedirect(s, i) {
  let j = i;
  if (s[j] === "&" && s[j + 1] === ">") {          // &> or &>>
    j += 2;
    if (s[j] === ">") j++;
    return { len: j - i, kind: "out" };
  }
  let d = j;
  while (d < s.length && s[d] >= "0" && s[d] <= "9") d++;
  if (s[d] !== ">" ) {
    if (s[j] === "<") {                            // input redirect (plain <; << handled in scan)
      let k = j + 1;
      return { len: k - i, kind: "in" };
    }
    return null;
  }
  // digits (possibly none) followed by >
  j = d + 1;
  if (s[j] === ">") { j++; return { len: j - i, kind: "out" }; }        // >>  N>>
  if (s[j] === "|") { j++; return { len: j - i, kind: "out" }; }        // >|
  if (s[j] === "&") {                                                    // >& : dup if digits/-, else target
    let k = j + 1;
    if (s[k] === "-" || (s[k] >= "0" && s[k] <= "9")) {
      k++;
      while (k < s.length && s[k] >= "0" && s[k] <= "9") k++;
      return { len: k - i, kind: "dup" };
    }
    return { len: k - i, kind: "out" };
  }
  return { len: j - i, kind: "out" };                                    // >  N>
}

function isRedirStart(s, i) {
  const c = s[i];
  if (c === ">" || c === "<") return true;
  if (c === "&" && s[i + 1] === ">") return true;
  // NOTE: a digit run only introduces an fd redirect at TOKEN START; mid-word digits
  // belong to the word (bash lexes `foo2>bar` as word "foo2" + redirect ">bar").
  return false;
}

function segment(s, depth) {
  const toks = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    // redirect at token start (incl. fd-number forms like 2> )
    const r = matchRedirect(s, i);
    if (r) { toks.push({ t: "redir", kind: r.kind }); i += r.len; continue; }
    // read a word (quote-aware; unquoted redirect chars end the word)
    let w = "";
    let q = null;
    while (i < n) {
      const d = s[i];
      if (q === "'") { if (d === "'") { q = null; i++; continue; } w += d; i++; continue; }
      if (q === '"') {
        if (d === '"') { q = null; i++; continue; }
        if (d === "\\") { w += (s[i + 1] || ""); i += 2; continue; }
        w += d; i++; continue;
      }
      if (d === "'" || d === '"') { q = d; i++; continue; }
      if (d === "\\") { w += (s[i + 1] || ""); i += 2; continue; }
      if (d === " " || d === "\t") break;
      if (isRedirStart(s, i)) break;
      w += d; i++;
    }
    if (q) ambiguous = true;
    toks.push({ t: "word", v: w });
  }

  // pair redirect targets; collect argv words
  const words = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === "redir") {
      if (t.kind === "dup") continue;
      const nx = toks[k + 1];
      if (t.kind === "in") { if (nx && nx.t === "word") k++; continue; }
      if (!nx || nx.t !== "word" || nx.v === "") { ambiguous = true; continue; }
      addTarget(nx.v); k++;
      continue;
    }
    words.push(t.v);
  }
  if (!words.length) return;

  // command word: skip leading VAR=val assignments and common wrappers
  const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
  const WRAPPERS = new Set(["sudo", "command", "env", "nice", "nohup", "time", "xargs", "builtin"]);
  let w = words.slice();
  while (w.length && ASSIGN.test(w[0])) w.shift();
  const base = p => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");
  while (w.length) {
    const c0 = base(w[0]);
    if (WRAPPERS.has(c0)) {
      w.shift();
      while (w.length && ASSIGN.test(w[0])) w.shift();
      while (w.length && w[0].startsWith("-")) w.shift();
      continue;
    }
    break;
  }
  if (!w.length) return;
  const cmd0 = base(w[0]);
  const args = w.slice(1);
  const nonFlag = args.filter(a => a !== "--" && !a.startsWith("-"));

  switch (cmd0) {
    case "tee":
      nonFlag.forEach(addTarget);
      break;
    case "mv":       // moving a control file AWAY is destructive too — all path args count
    case "rm":
    case "truncate": // conservatively includes the -s SIZE value; a bare number never matches the control set
      nonFlag.forEach(addTarget);
      break;
    case "cp":       // reading FROM a control path is legal; only the destination counts
      if (nonFlag.length) addTarget(nonFlag[nonFlag.length - 1]);
      break;
    case "dd":
      args.filter(a => a.startsWith("of=")).forEach(a => addTarget(a.slice(3)));
      break;
    case "sed": {
      const inPlace = args.some(a => a === "-i" || /^-i./.test(a) || a === "--in-place" || a.startsWith("--in-place"));
      if (inPlace) nonFlag.forEach(addTarget); // includes the script arg — a sed script naming a control path while editing another file is an accepted (documented) false positive
      break;
    }
    case "bash":
    case "sh":
    case "zsh": {
      const ci = args.indexOf("-c");
      if (ci >= 0) {
        const lit = args[ci + 1];
        if (lit === undefined || lit.startsWith("$") || lit.includes(MARK)) ambiguous = true;
        else scan(lit, depth + 1);
      }
      break;
    }
    case "eval": {
      const joined = args.join(" ").trim();
      if (!joined || joined.startsWith("$") || joined.includes(MARK)) ambiguous = true;
      else scan(joined, depth + 1);
      break;
    }
  }
}

// ---- main --------------------------------------------------------------------------------

let input = "";
process.stdin.on("data", d => (input += d));
process.stdin.on("end", () => {
  try {
    scan(String(input), 0);
  } catch (e) {
    ambiguous = true;
  }
  const out = [...new Set(targets)];
  if (ambiguous) out.push("AMBIGUOUS");
  process.stdout.write(out.join("\n") + (out.length ? "\n" : ""));
});
