import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../safeJsonParse';

describe('safeJsonParse', () => {
  it('returns parsed object for valid JSON', () => {
    const result = safeJsonParse('{"a":1}', {});
    expect(result).toEqual({ a: 1 });
  });

  it('returns the fallback when raw is null', () => {
    const result = safeJsonParse(null, []);
    expect(result).toEqual([]);
  });

  it('returns the fallback when JSON is invalid', () => {
    const result = safeJsonParse('invalid', { default: true });
    expect(result).toEqual({ default: true });
  });

  it('returns the fallback on empty string', () => {
    const result = safeJsonParse('', 'fallback');
    expect(result).toBe('fallback');
  });

  it('returns parsed string value for valid JSON string', () => {
    const result = safeJsonParse('"hello"', null);
    expect(result).toBe('hello');
  });

  it('returns fallback when called with undefined (treated as falsy)', () => {
    const result = safeJsonParse(undefined as unknown as string | null, 42);
    expect(result).toBe(42);
  });
});
