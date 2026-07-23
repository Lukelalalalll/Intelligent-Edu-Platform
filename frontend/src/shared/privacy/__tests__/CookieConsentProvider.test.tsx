import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/shared/i18n';
import CookieConsentBanner from '../CookieConsentBanner';
import { CookieConsentProvider } from '../CookieConsentContext';
import { COOKIE_CONSENT_STORAGE_KEY } from '../cookieConsent';

const syncTelemetryConsentStateMock = vi.fn();

vi.mock('@/utils/mixpanel', () => ({
  syncTelemetryConsentState: (...args: unknown[]) => syncTelemetryConsentStateMock(...args),
}));

describe('CookieConsentProvider and banner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    syncTelemetryConsentStateMock.mockReset();
    vi.restoreAllMocks();
  });

  it('shows the banner for first-time visitors and saves acceptance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ telemetryEnabled: true }),
    }));

    render(
      <I18nProvider>
        <CookieConsentProvider>
          <MemoryRouter>
            <CookieConsentBanner />
          </MemoryRouter>
        </CookieConsentProvider>
      </I18nProvider>,
    );

    expect(await screen.findByRole('region', { name: /cookie consent banner/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /accept all/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toContain('"analytics":"granted"');
    });
    expect(syncTelemetryConsentStateMock).toHaveBeenLastCalledWith('granted');
  });

  it('prefills denied when bootstrap says telemetry is disabled server-side', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ telemetryEnabled: false }),
    }));

    render(
      <I18nProvider>
        <CookieConsentProvider>
          <MemoryRouter>
            <CookieConsentBanner />
          </MemoryRouter>
        </CookieConsentProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toContain('"analytics":"denied"');
    });

    expect(screen.queryByRole('region', { name: /cookie consent banner/i })).not.toBeInTheDocument();
    expect(syncTelemetryConsentStateMock).toHaveBeenLastCalledWith('denied');
  });

  it('lets the visitor reject analytics from the customize modal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ telemetryEnabled: true }),
    }));

    render(
      <I18nProvider>
        <CookieConsentProvider>
          <MemoryRouter>
            <CookieConsentBanner />
          </MemoryRouter>
        </CookieConsentProvider>
      </I18nProvider>,
    );

    expect(await screen.findByRole('button', { name: /customize/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    fireEvent.click(screen.getByRole('button', { name: /reject non-essential/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toContain('"analytics":"denied"');
    });
  });
});
