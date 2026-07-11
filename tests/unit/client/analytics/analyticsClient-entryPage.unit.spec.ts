import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the analytics client entry page tracking.
 *
 * These tests verify that the entry page tracking methods correctly
 * store and retrieve the first page visited for session attribution.
 */

// Mock sessionStorage: entry-page attribution is scoped to a browser session.
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    sessionStorage: sessionStorageMock,
    location: { pathname: '/', href: 'http://localhost/' },
  },
  writable: true,
});

describe('Analytics Client - Entry Page Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getEntryPage method', () => {
    test('should return null when no entry page is set', async () => {
      sessionStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const entryPage = analytics.getEntryPage();

      expect(entryPage).toBeNull();
    });

    test('should return existing entry page from sessionStorage', async () => {
      sessionStorageMock.setItem('miu_entry_page', '/pricing');

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const entryPage = analytics.getEntryPage();

      expect(entryPage).toBe('/pricing');
    });

    test('should return null in server environment (no window)', async () => {
      const originalWindow = global.window;
      // @ts-expect-error - intentionally removing window for test
      delete global.window;

      vi.resetModules();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      const entryPage = analytics.getEntryPage();

      expect(entryPage).toBeNull();

      // Restore window
      global.window = originalWindow;
    });

    test('should handle sessionStorage errors gracefully', async () => {
      sessionStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      // Should not throw
      const entryPage = analytics.getEntryPage();

      expect(entryPage).toBeNull();
    });
  });

  describe('initEntryPage method', () => {
    test('should set entry page if not already set', async () => {
      sessionStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      analytics.initEntryPage('/dashboard');

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith('miu_entry_page', '/dashboard');
      expect(analytics.getEntryPage()).toBe('/dashboard');
    });

    test('should NOT overwrite existing entry page', async () => {
      sessionStorageMock.setItem('miu_entry_page', '/landing-page');
      sessionStorageMock.setItem.mockClear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      // Try to set a different entry page
      analytics.initEntryPage('/other-page');

      // Should NOT have been called since entry page already exists
      expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
      expect(analytics.getEntryPage()).toBe('/landing-page');
    });

    test('should handle sessionStorage errors gracefully', async () => {
      sessionStorageMock.clear();
      sessionStorageMock.getItem.mockReturnValueOnce(null);
      sessionStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage quota exceeded');
      });

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      // Should not throw
      expect(() => analytics.initEntryPage('/test')).not.toThrow();
    });
  });

  describe('Entry page persistence', () => {
    test('should persist entry page across multiple calls', async () => {
      sessionStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      // First call sets it
      analytics.initEntryPage('/first-page');
      expect(analytics.getEntryPage()).toBe('/first-page');

      // Subsequent calls should not change it
      analytics.initEntryPage('/second-page');
      expect(analytics.getEntryPage()).toBe('/first-page');

      analytics.initEntryPage('/third-page');
      expect(analytics.getEntryPage()).toBe('/first-page');
    });

    test('should use first-touch semantics for entry page', async () => {
      sessionStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      // Simulate user entering through SEO landing page
      analytics.initEntryPage('/ai-image-upscaler');
      expect(analytics.getEntryPage()).toBe('/ai-image-upscaler');

      // User navigates around
      analytics.initEntryPage('/pricing');
      analytics.initEntryPage('/dashboard');

      // Entry page should still be the first page
      expect(analytics.getEntryPage()).toBe('/ai-image-upscaler');
    });
  });

  describe('consent-independent initialization', () => {
    test('captures the landing page before analytics consent is granted', async () => {
      sessionStorageMock.clear();

      const { analytics } = await import('../../../../client/analytics/analyticsClient');

      analytics.trackPageView('/tools/ai-image-upscaler');

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'miu_entry_page',
        '/tools/ai-image-upscaler'
      );
      expect(analytics.getEntryPage()).toBe('/tools/ai-image-upscaler');
    });
  });
});
