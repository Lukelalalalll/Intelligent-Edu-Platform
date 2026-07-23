import { beforeEach, describe, expect, it, vi } from 'vitest';

import { writeCookieConsent } from '@/shared/privacy/cookieConsent';

const initMock = vi.fn();
const trackMock = vi.fn();
const identifyMock = vi.fn();
const getDistinctIdMock = vi.fn(() => 'distinct-id');
const optInTrackingMock = vi.fn();
const optOutTrackingMock = vi.fn();

vi.mock('mixpanel-browser', () => ({
  default: {
    init: (...args: unknown[]) => initMock(...args),
    track: (...args: unknown[]) => trackMock(...args),
    identify: (...args: unknown[]) => identifyMock(...args),
    get_distinct_id: () => getDistinctIdMock(),
    opt_in_tracking: (...args: unknown[]) => optInTrackingMock(...args),
    opt_out_tracking: (...args: unknown[]) => optOutTrackingMock(...args),
    register: vi.fn(),
  },
}));

describe('mixpanel consent gating', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MIXPANEL_TOKEN', 'test-mixpanel-token');
    window.localStorage.clear();
    initMock.mockReset();
    trackMock.mockReset();
    identifyMock.mockReset();
    getDistinctIdMock.mockClear();
    optInTrackingMock.mockReset();
    optOutTrackingMock.mockReset();
    delete window.__mixpanel_initialized;
    delete window.__mixpanel_telemetry_enabled;
    vi.resetModules();
  });

  it('does not initialize or track while consent is pending', async () => {
    const { trackEvent, MixpanelEvent } = await import('./mixpanel');

    trackEvent(MixpanelEvent.Navigation, { from: '/login', to: '/' });

    expect(initMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('initializes with opt-out-by-default and starts tracking after consent is granted', async () => {
    writeCookieConsent('granted');
    const { trackEvent, MixpanelEvent, syncTelemetryConsentState } = await import('./mixpanel');

    syncTelemetryConsentState('granted');
    trackEvent(MixpanelEvent.Navigation, { from: '/login', to: '/' });

    expect(initMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      track_pageview: false,
      api_host: 'https://api-eu.mixpanel.com',
      opt_out_tracking_by_default: true,
    }));
    expect(optInTrackingMock).toHaveBeenCalled();
    expect(trackMock).toHaveBeenCalledWith(MixpanelEvent.Navigation, { from: '/login', to: '/' });
  });

  it('opts out and clears persistence when consent is denied after initialization', async () => {
    writeCookieConsent('granted');
    const { syncTelemetryConsentState } = await import('./mixpanel');

    syncTelemetryConsentState('granted');
    syncTelemetryConsentState('denied');

    expect(optOutTrackingMock).toHaveBeenCalledWith({ clear_persistence: true });
  });
});
