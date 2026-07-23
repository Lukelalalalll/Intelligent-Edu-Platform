import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { log } from '@/shared/utils/logger';
import {
  getCookieConsentState,
  hasStoredCookieConsent,
  readStoredCookieConsent,
  writeCookieConsent,
  type CookieConsentAnalyticsChoice,
  type CookieConsentState,
} from './cookieConsent';
import { syncTelemetryConsentState } from '@/utils/mixpanel';

interface CookieConsentContextValue {
  consentState: CookieConsentState;
  analyticsEnabled: boolean;
  isResolved: boolean;
  isSaving: boolean;
  shouldShowBanner: boolean;
  isPreferencesOpen: boolean;
  acceptAll: () => Promise<void>;
  rejectNonEssential: () => Promise<void>;
  savePreferences: (analyticsEnabled: boolean) => Promise<void>;
  openPreferences: () => void;
  closePreferences: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

async function syncConsentToUserConfig(analytics: CookieConsentAnalyticsChoice) {
  const response = await fetch('/api/v1/app/user-config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      DISABLE_ANONYMOUS_TRACKING: analytics === 'denied' ? 'true' : null,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    return;
  }

  if (!response.ok) {
    throw new Error(`Failed to sync cookie preferences (${response.status})`);
  }
}

function getInitialConsentSnapshot() {
  const stored = readStoredCookieConsent();
  if (stored) {
    return {
      consentState: stored.analytics,
      isResolved: true,
    } as const;
  }

  return {
    consentState: 'pending',
    isResolved: false,
  } as const;
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const initialSnapshot = getInitialConsentSnapshot();
  const [consentState, setConsentState] = useState<CookieConsentState>(initialSnapshot.consentState);
  const [isResolved, setIsResolved] = useState(initialSnapshot.isResolved);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  useEffect(() => {
    syncTelemetryConsentState(initialSnapshot.consentState);
  }, [initialSnapshot.consentState]);

  useEffect(() => {
    if (initialSnapshot.isResolved) {
      return;
    }

    let cancelled = false;

    const bootstrapConsent = async () => {
      syncTelemetryConsentState('pending');

      try {
        const response = await fetch('/api/v1/app/bootstrap', { cache: 'no-store' });
        const data = await response.json() as { telemetryEnabled?: boolean };

        if (cancelled || hasStoredCookieConsent()) {
          return;
        }

        if (data.telemetryEnabled === false) {
          writeCookieConsent('denied');
          setConsentState('denied');
          syncTelemetryConsentState('denied');
          return;
        }

        setConsentState('pending');
      } catch (error) {
        if (!cancelled) {
          log.warn('privacy', 'Bootstrap consent fetch failed; leaving cookie consent pending', {
            message: error instanceof Error ? error.message : String(error),
          });
          setConsentState(getCookieConsentState());
        }
      } finally {
        if (!cancelled) {
          setIsResolved(true);
        }
      }
    };

    void bootstrapConsent();

    return () => {
      cancelled = true;
    };
  }, [initialSnapshot.isResolved]);

  const applyConsent = useCallback(async (analytics: CookieConsentAnalyticsChoice) => {
    writeCookieConsent(analytics);
    setConsentState(analytics);
    setIsResolved(true);
    syncTelemetryConsentState(analytics);
    setIsSaving(true);

    try {
      await syncConsentToUserConfig(analytics);
    } catch (error) {
      log.warn('privacy', 'Failed to sync cookie preferences to user config', {
        analytics,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
      setIsPreferencesOpen(false);
    }
  }, []);

  const acceptAll = useCallback(async () => {
    await applyConsent('granted');
  }, [applyConsent]);

  const rejectNonEssential = useCallback(async () => {
    await applyConsent('denied');
  }, [applyConsent]);

  const savePreferences = useCallback(async (analyticsEnabled: boolean) => {
    await applyConsent(analyticsEnabled ? 'granted' : 'denied');
  }, [applyConsent]);

  const openPreferences = useCallback(() => {
    setIsPreferencesOpen(true);
  }, []);

  const closePreferences = useCallback(() => {
    setIsPreferencesOpen(false);
  }, []);

  const value = useMemo<CookieConsentContextValue>(() => ({
    consentState,
    analyticsEnabled: consentState === 'granted',
    isResolved,
    isSaving,
    shouldShowBanner: isResolved && consentState === 'pending' && !isPreferencesOpen,
    isPreferencesOpen,
    acceptAll,
    rejectNonEssential,
    savePreferences,
    openPreferences,
    closePreferences,
  }), [
    acceptAll,
    closePreferences,
    consentState,
    isPreferencesOpen,
    isResolved,
    isSaving,
    openPreferences,
    rejectNonEssential,
    savePreferences,
  ]);

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsent must be used within CookieConsentProvider');
  }
  return context;
}
