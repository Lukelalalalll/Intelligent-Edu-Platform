import { describe, expect, it } from 'vitest';

import { getApiUrl, getFastAPIUrl } from './api';

describe('api URL resolution', () => {
  it('allows local fastapiUrl query overrides in non-production builds', () => {
    window.history.replaceState({}, '', '/?fastapiUrl=http://localhost:5009');

    expect(getFastAPIUrl()).toBe('http://localhost:5009');
    expect(getApiUrl('/api/v1/health')).toBe('http://localhost:5009/api/v1/health');
  });

  it('ignores remote fastapiUrl query overrides', () => {
    window.history.replaceState({}, '', '/?fastapiUrl=https://attacker.example');

    expect(getFastAPIUrl()).toBe(window.location.origin);
    expect(getApiUrl('/api/v1/health')).toBe('/api/v1/health');
  });
});
