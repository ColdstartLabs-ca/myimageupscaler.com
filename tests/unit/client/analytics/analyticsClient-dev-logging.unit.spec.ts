import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

interface IEnvMockOptions {
  isDevelopment: boolean;
  isTest: boolean;
}

async function loadAnalyticsClient(env: IEnvMockOptions) {
  vi.resetModules();
  vi.doMock('@shared/config/env', () => ({
    isDevelopment: () => env.isDevelopment,
    isTest: () => env.isTest,
  }));

  return import('../../../../client/analytics/analyticsClient');
}

describe('Analytics Client - Dev Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(
      {},
      '',
      'http://localhost:3000/pricing?utm_source=reddit&utm_campaign=spring-launch'
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@shared/config/env');
  });

  test('logs tracked events in development even when Amplitude is disabled', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(1_712_345_678_901);

    const { analytics } = await loadAnalyticsClient({
      isDevelopment: true,
      isTest: false,
    });

    analytics.track('checkout_opened', {
      trigger: 'model_gate',
      pricingRegion: 'standard',
    });

    expect(infoSpy).toHaveBeenCalledWith('[Analytics:dev] track', {
      name: 'checkout_opened',
      properties: expect.objectContaining({
        trigger: 'model_gate',
        pricingRegion: 'standard',
        timestamp: 1_712_345_678_901,
        session_id: expect.any(String),
      }),
    });

    const loggedPayload = infoSpy.mock.calls[0]?.[1] as {
      properties: { session_id: string };
    };

    expect(loggedPayload.properties.session_id).toBe(sessionStorage.getItem('pp_session_id'));
  });

  test('logs page_view payloads in development with page context', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(1_712_345_678_901);

    const { analytics } = await loadAnalyticsClient({
      isDevelopment: true,
      isTest: false,
    });

    analytics.trackPageView('/pricing', {
      locale: 'en',
    });

    expect(infoSpy).toHaveBeenCalledWith('[Analytics:dev] track', {
      name: 'page_view',
      properties: expect.objectContaining({
        path: '/pricing',
        locale: 'en',
        entry_page: '/pricing',
        utmSource: 'reddit',
        utmCampaign: 'spring-launch',
        timestamp: 1_712_345_678_901,
        session_id: expect.any(String),
      }),
    });
  });

  test('does not log client analytics in test mode', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { analytics } = await loadAnalyticsClient({
      isDevelopment: true,
      isTest: true,
    });

    analytics.track('checkout_opened', {
      trigger: 'model_gate',
    });

    expect(infoSpy).not.toHaveBeenCalled();
  });
});
