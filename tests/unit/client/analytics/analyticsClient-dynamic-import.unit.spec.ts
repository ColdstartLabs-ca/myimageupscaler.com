import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('Analytics Client - Dynamic Amplitude Import', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('does not evaluate @amplitude/analytics-browser on module import until init with granted consent', async () => {
    let amplitudeEvaluated = false;

    vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
      if (key === 'pp_analytics_consent') {
        return JSON.stringify({ analytics: 'denied', updatedAt: Date.now() });
      }
      return null;
    });

    vi.doMock('@amplitude/analytics-browser', () => {
      amplitudeEvaluated = true;
      return {
        init: vi.fn(),
        track: vi.fn(),
        identify: vi.fn(),
        setUserId: vi.fn(),
        reset: vi.fn(),
      };
    });

    // 1. Static import of analyticsClient must NOT evaluate Amplitude SDK
    const { analytics } = await import('../../../../client/analytics/analyticsClient');
    expect(amplitudeEvaluated).toBe(false);

    // 2. Calling init() without granted consent still does NOT evaluate Amplitude SDK
    await analytics.init('test-api-key');
    expect(amplitudeEvaluated).toBe(false);

    // 3. Granted consent + init() triggers the dynamic import and evaluation
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
      if (key === 'pp_analytics_consent') {
        return JSON.stringify({ analytics: 'granted', updatedAt: Date.now() });
      }
      return null;
    });

    await analytics.init('test-api-key');
    expect(amplitudeEvaluated).toBe(true);
  });
});
