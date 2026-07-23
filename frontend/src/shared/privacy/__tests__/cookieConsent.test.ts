import { beforeEach, describe, expect, it } from 'vitest';

import {
  COOKIE_CONSENT_STORAGE_KEY,
  getCookieConsentState,
  readStoredCookieConsent,
  writeCookieConsent,
} from '../cookieConsent';

describe('cookieConsent storage helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns pending when nothing has been stored yet', () => {
    expect(getCookieConsentState()).toBe('pending');
    expect(readStoredCookieConsent()).toBeNull();
  });

  it('persists a granted decision with versioned metadata', () => {
    const record = writeCookieConsent('granted');

    expect(record?.version).toBe(1);
    expect(record?.analytics).toBe('granted');
    expect(readStoredCookieConsent()?.analytics).toBe('granted');
    expect(getCookieConsentState()).toBe('granted');
  });

  it('ignores malformed stored payloads', () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify({ version: 1, analytics: 'maybe' }));

    expect(readStoredCookieConsent()).toBeNull();
    expect(getCookieConsentState()).toBe('pending');
  });
});
