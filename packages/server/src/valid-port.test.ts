import { describe, expect, it } from 'vitest';
import { isValidPort, portRefusedMessage } from './valid-port.js';

// #37: the rule itself, away from either route that applies it — `target/route.test.ts` and
// `trialfit/route.test.ts` pin that each route really sends a 400 in words.
describe('isValidPort', () => {
  it('accepts every whole number from 1 to 65535, edges included', () => {
    for (const port of [1, 2, 80, 4200, 4600, 4601, 65534, 65535]) {
      expect(isValidPort(port), String(port)).toBe(true);
    }
  });

  it('refuses 0 — to the OS that means "any free port", which is Jig\'s to ask for and never a caller\'s', () => {
    expect(isValidPort(0)).toBe(false);
  });

  it('refuses anything past either end, and any fraction', () => {
    for (const port of [-1, -4200, 65536, 70000, 4200.5, 0.5]) {
      expect(isValidPort(port), String(port)).toBe(false);
    }
  });

  it('refuses the two numbers JSON cannot spell but a parser still produces', () => {
    // `1e999` is the one the desk found: JSON has no Infinity literal, but its number grammar
    // has no exponent ceiling either, so `JSON.parse('{"port":1e999}').port` is Infinity — a
    // `number`, and not a port.
    expect(JSON.parse('{"port":1e999}').port).toBe(Infinity);
    expect(isValidPort(Infinity)).toBe(false);
    expect(isValidPort(-Infinity)).toBe(false);
    expect(isValidPort(NaN)).toBe(false);
  });

  it('refuses a numeric string and every non-number', () => {
    for (const value of ['4200', '', 'four thousand', null, undefined, true, {}, [], [4200]]) {
      expect(isValidPort(value), JSON.stringify(value) ?? String(value)).toBe(false);
    }
  });
});

describe('portRefusedMessage', () => {
  it('names the rule and the value that broke it', () => {
    expect(portRefusedMessage(65536)).toBe('port must be a whole number from 1 to 65535 — got 65536');
  });

  it('says Infinity out loud — `JSON.stringify(Infinity)` is the string "null", which would hide the one value that most needs naming', () => {
    expect(JSON.stringify(Infinity)).toBe('null');
    expect(portRefusedMessage(Infinity)).toBe('port must be a whole number from 1 to 65535 — got Infinity');
  });

  it('quotes a string so "4200" is visibly not 4200, and names the type of anything else', () => {
    expect(portRefusedMessage('4200')).toBe('port must be a whole number from 1 to 65535 — got "4200"');
    expect(portRefusedMessage(null)).toBe('port must be a whole number from 1 to 65535 — got null');
    expect(portRefusedMessage({})).toBe('port must be a whole number from 1 to 65535 — got object');
    expect(portRefusedMessage(true)).toBe('port must be a whole number from 1 to 65535 — got boolean');
  });
});
