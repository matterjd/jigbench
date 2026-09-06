import { describe, expect, it } from 'vitest';
import { matchPath, stripQuery, parentListKey } from './path-match.js';

/**
 * The proxy interceptor matches an incoming request's method+path against a Fixture's
 * `responses` keys, which are templated (`"GET /api/invoices/{id}"`). F10 / the S7 brief:
 * "path templates with {id} match numeric/uuid segments; query strings ignored".
 */

describe('stripQuery', () => {
  it('drops everything from the first ? onward', () => {
    expect(stripQuery('/api/invoices?status=overdue&page=2')).toBe('/api/invoices');
  });

  it('leaves a path with no query untouched', () => {
    expect(stripQuery('/api/invoices/42')).toBe('/api/invoices/42');
  });
});

describe('matchPath', () => {
  it('matches an exact literal path', () => {
    expect(matchPath('/api/invoices', '/api/invoices')).toBe(true);
  });

  it('does not match a different literal path', () => {
    expect(matchPath('/api/invoices', '/api/customers')).toBe(false);
  });

  it('a {id} template segment matches a numeric id', () => {
    expect(matchPath('/api/invoices/{id}', '/api/invoices/42')).toBe(true);
  });

  it('a {id} template segment matches a uuid', () => {
    expect(matchPath('/api/invoices/{id}', '/api/invoices/3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true);
  });

  it('a {id} template segment does NOT match an arbitrary non-numeric, non-uuid word', () => {
    expect(matchPath('/api/invoices/{id}', '/api/invoices/overdue')).toBe(false);
  });

  it('ignores the query string on the actual request path', () => {
    expect(matchPath('/api/invoices/{id}', '/api/invoices/42?expand=lines')).toBe(true);
  });

  it('requires the same segment count', () => {
    expect(matchPath('/api/invoices/{id}', '/api/invoices/42/lines')).toBe(false);
    expect(matchPath('/api/invoices', '/api/invoices/42')).toBe(false);
  });
});

describe('parentListKey', () => {
  it('strips the trailing {param} segment to find the sibling list key', () => {
    expect(parentListKey('GET /api/invoices/{id}')).toBe('GET /api/invoices');
  });

  it('returns undefined for a key with no trailing template segment', () => {
    expect(parentListKey('GET /api/invoices')).toBeUndefined();
  });

  it('returns undefined when the template segment is not last', () => {
    expect(parentListKey('GET /api/invoices/{id}/lines')).toBeUndefined();
  });
});
