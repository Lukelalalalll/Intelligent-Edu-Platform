import { safeJsonParse } from '@/shared/utils/safeJsonParse';

export const COOKIE_CONSENT_STORAGE_KEY = 'cookieConsent.v1';

export type CookieConsentState = 'pending' | 'granted' | 'denied';
export type CookieConsentAnalyticsChoice = Exclude<CookieConsentState, 'pending'>;

export interface CookieConsentRecord {
  version: 1;
  analytics: CookieConsentAnalyticsChoice;
  updatedAt: string;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isAnalyticsChoice(value: unknown): value is CookieConsentAnalyticsChoice {
  return value === 'granted' || value === 'denied';
}

export function readStoredCookieConsent(): CookieConsentRecord | null {
  if (!canUseStorage()) {
    return null;
  }

  const parsed = safeJsonParse<CookieConsentRecord | null>(
    window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY),
    null,
  );

  if (!parsed || parsed.version !== 1 || !isAnalyticsChoice(parsed.analytics) || typeof parsed.updatedAt !== 'string') {
    return null;
  }

  return parsed;
}

export function getCookieConsentState(): CookieConsentState {
  return readStoredCookieConsent()?.analytics ?? 'pending';
}

export function hasStoredCookieConsent(): boolean {
  return readStoredCookieConsent() !== null;
}

export function writeCookieConsent(analytics: CookieConsentAnalyticsChoice): CookieConsentRecord | null {
  if (!canUseStorage()) {
    return null;
  }

  const nextRecord: CookieConsentRecord = {
    version: 1,
    analytics,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(nextRecord));
  return nextRecord;
}
