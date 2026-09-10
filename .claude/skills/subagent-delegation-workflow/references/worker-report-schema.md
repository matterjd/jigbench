# Worker Report Schema

Every delegated worker's final message MUST follow this schema exactly. `SKILL.md` Step 5
embeds this file **verbatim** in the worker's spawn prompt — the worker sees the schema, not
a paraphrase of it.

```
OUTCOME: success | partial | failed
OBJECTIVE-RESULT: <2-4 sentences: what was delivered vs the objective>
TESTS: <command(s) + counts, e.g. "verify-guards.sh 115/115">
COMMITS: <sha + subject per line; "none" if read-only>
FILES-CHANGED: <path (+added/-removed) per line>
DEVIATIONS: every class below MUST be answered; "none" overall is permitted ONLY when all five are "clean"
  SPEC:     <requirement not met as written | clean>
  SCOPE:    <anything touched beyond the granted file scope | clean>
  LENGTH:   <any length bound exceeded, AS A RATIO | clean>
  FORMAT:   <structure/format requirement not followed | clean>
  COVERAGE: restate EVERY acceptance clause the brief listed, VERBATIM, each with its own verdict
            AND the evidence that settles it — a bare "clean" is INVALID whenever the brief
            listed clauses:
              - "<clause quoted verbatim from the brief>"
                  VERDICT: met | partial: <what is missing> | not met
                  COMMAND: <the exact command whose result decides this clause>
                           | NOT RUN: <why — a missing toolchain, no way to test it, ran out of scope>
                  OUTPUT:  <that command's ACTUAL output, trimmed to the deciding lines>
BLOCKED: <guard-block count + one line per block (verbatim reason) | 0>
CONCERNS: <what the reviewer should look at first | none>
```

Cheap models follow the letter of the schema — enumerating deviation classes is what makes
"none" mean none (a worker once reported "DEVIATIONS: none" while 2.1x over a length target).

**Why COVERAGE is per-clause (2026-07-26, cc#62 stage-8 run).** A single summary line is the one
deviation class a worker can answer honestly-in-its-own-eyes while still missing a requirement: the
cc#62 worker reported `COVERAGE: clean` against a slice whose acceptance read "**every** panel's
source must name the root its data came from," having wired exactly one panel. It was not lying — it
had no obligation to re-read the clause list. Restating each clause verbatim removes the place the
miss can hide, and costs the worker a few lines. The same run's `SPEC` class *did* work: the worker
volunteered two real deviations unprompted. Enumeration is what makes a class honest; COVERAGE was
the only class not enumerated.

**Why each clause names its COMMAND and carries real OUTPUT (P0.2, added 2026-08-02).** Enumerating
the clauses closed the place a *miss* could hide; it did not close the place an **unverified claim**
could hide — a worker can restate every clause verbatim and still settle each one by reading its own
code. Three rules follow, and they are the point of the change:

1. **"Syntax verified" is not a passing answer.** Nor is "should work", "looks correct", or a
   restatement of the clause in the past tense. If no command decides a clause, say `NOT RUN` and
   why — that is a legitimate report, and an honest one.
2. **A clause whose `COMMAND` is `NOT RUN` can never be `met`.** It is `partial` at best. `NOT RUN`
   is an explicit **deviation**, which means the brain sees it and decides — it is not a quiet pass.
3. **`OUTPUT` is the command's actual bytes, not a summary of them.** A worker paraphrasing its own
   test output is back to reporting a claim. Trim to the deciding lines; never retype them.

The brain **spot-runs on suspicion** — pick any one clause and re-run its stated command. A report
whose `COMMAND` does not reproduce its `OUTPUT` is a review-stopping finding, not a nit.
