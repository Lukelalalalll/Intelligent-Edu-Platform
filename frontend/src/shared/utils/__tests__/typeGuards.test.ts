import { describe, it, expect } from 'vitest';
import { isAxiosError, getErrorMessage, assert, safeJsonParse } from '../typeGuards';

describe('isAxiosError', () => {
  it('returns true for objects with response property', () => {
    expect(isAxiosError({ response: { data: {} } })).toBe(true);
  });

  it('returns false for Error instances', () => {
    expect(isAxiosError(new Error('test'))).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isAxiosError('error string')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isAxiosError(null)).toBe(false);
    expect(isAxiosError(undefined)).toBe(false);
  });

  it('returns false for plain objects without response', () => {
    expect(isAxiosError({ message: 'test' })).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('extracts detail from Axios error', () => {
    const error = {
      response: { data: { detail: 'Not found' } },
      message: 'Request failed'
    };
    expect(getErrorMessage(error)).toBe('Not found');
  });

  it('falls back to message when no detail', () => {
    const error = {
      response: { data: { message: 'Server error' } },
      message: 'Request failed'
    };
    expect(getErrorMessage(error)).toBe('Server error');
  });

  it('handles Error instances', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('handles string errors', () => {
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('returns fallback for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  it('returns custom fallback when provided', () => {
    expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });
});

describe('assert', () => {
  it('does not throw for truthy values', () => {
    expect(() => assert(true, 'should not throw')).not.toThrow();
  });

  it('throws for falsy values', () => {
    expect(() => assert(false, 'assertion failed')).toThrow('assertion failed');
  });

  it('throws for null', () => {
    expect(() => assert(null, 'null value')).toThrow('null value');
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('invalid', { a: 0 })).toEqual({ a: 0 });
  });

  it('works with arrays', () => {
    expect(safeJsonParse('[1,2,3]', [] as number[])).toEqual([1, 2, 3]);
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', 'fallback')).toBe('fallback');
  });
});