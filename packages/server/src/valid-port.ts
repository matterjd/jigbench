/**
 * #37: a caller-supplied `port` is bounded before anything acts on it.
 *
 * Two routes take a port out of a request body and do real work with it —
 * `POST /api/target/start` (`target/route.ts`, which hands it to the target runner's 120-second
 * availability probe) and `POST /api/plate/mirror` (`trialfit/route.ts`, which binds a socket
 * on it). Neither checked the number. A `typeof x === 'number'` test passes anything JSON can
 * carry, and `1e999` is the one that bites: JSON has no Infinity literal, but the number
 * grammar has no ceiling either, so a parser reads `1e999` as `Infinity` — a value that is a
 * `number`, is not a port, and used to spawn the app and then burn the whole probe budget
 * waiting for a port that cannot exist. `0`, `-1`, `65536` and `4200.5` are the same class,
 * quieter.
 *
 * One integer 1 to 65535. Port 0 is excluded on purpose: to the OS it means "assign me any
 * free port", which is a legitimate thing for Jig's OWN code to ask for (`createPlateProxy`
 * does) and never something a request may ask for on Jig's behalf — a mirror bound to a port
 * the caller cannot predict is a socket nobody reaches.
 */

/** True only for an integer 1 to 65535 — `Infinity`, `NaN`, `0`, a negative, a fraction, a
 * numeric STRING and anything non-numeric are all false. */
export function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** The value as it should read back to whoever sent it. `String()` rather than
 * `JSON.stringify()` for a number, because `JSON.stringify(Infinity)` is the string `"null"` —
 * which would turn the one message that most needs to name `Infinity` into the one that hides
 * it. A string is quoted so `"4200"` is visibly not `4200`. */
function describePort(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  return typeof value;
}

/** The 400 body a bad `port` gets — the same words wherever a request names one, and they say
 * what was wrong rather than only that something was. */
export function portRefusedMessage(value: unknown): string {
  return `port must be a whole number from 1 to 65535 — got ${describePort(value)}`;
}
