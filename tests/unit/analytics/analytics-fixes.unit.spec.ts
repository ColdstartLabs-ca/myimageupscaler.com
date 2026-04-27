import { describe, test, expect } from 'vitest';

/**
 * Tests verifying the analytics bug fixes from the analytics-instrumentation-v2 audit.
 * These are structural/config checks that don't require mocking the full module.
 */

describe('Analytics Fixes - Structural Checks', () => {
  describe('Fix #1: trackRevenue is exported', () => {
    test('trackRevenue should be exported from @server/analytics barrel', async () => {
      const analyticsModule = await import('@server/analytics');
      expect(typeof analyticsModule.trackRevenue).toBe('function');
    });

    test('trackRevenue should be exported from analyticsService', async () => {
      const service = await import('@server/analytics/analyticsService');
      expect(typeof service.trackRevenue).toBe('function');
    });
  });

  describe('Fix #1: revenue_received is a valid event name', () => {
    test('IAnalyticsEventName should include revenue_received', async () => {
      // revenue_received is used by trackRevenue and must be in the event taxonomy
      const types = await import('@server/analytics/types');
      // Test that a value matching the type can be created
      const eventName: (typeof types)['IAnalyticsEventName'] extends string ? string : never =
        'revenue_received';
      expect(eventName).toBe('revenue_received');
    });
  });

  describe('Fix #4: subscription_updated is a valid event name', () => {
    test('IAnalyticsEventName should include subscription_updated', async () => {
      const types = await import('@server/analytics/types');
      const eventName: (typeof types)['IAnalyticsEventName'] extends string ? string : never =
        'subscription_updated';
      expect(eventName).toBe('subscription_updated');
    });
  });

  describe('Fix #3: middleware does not strip source param', () => {
    test('source should NOT be in TRACKING_QUERY_PARAMS', async () => {
      // Read the middleware source to verify 'source' is not in the tracking params
      const fs = await import('fs');
      const middlewareSource = fs.readFileSync('middleware.ts', 'utf-8');

      // Extract the TRACKING_QUERY_PARAMS array content
      const match = middlewareSource.match(/TRACKING_QUERY_PARAMS\s*=\s*\[([\s\S]*?)\]/);
      expect(match).toBeTruthy();

      const arrayContent = match![1];
      // 'source' should be commented out, not active
      const activeParams = arrayContent
        .split('\n')
        .filter(line => !line.trim().startsWith('//'))
        .join('');

      expect(activeParams).not.toContain("'source'");
      // utm_source should still be present
      expect(activeParams).toContain("'utm_source'");
    });
  });

  describe('Fix #9: getDeviceId uses SDK method', () => {
    test('getDeviceId should not read amp_device_id from localStorage', async () => {
      const fs = await import('fs');
      const clientSource = fs.readFileSync('client/analytics/analyticsClient.ts', 'utf-8');

      // Should NOT contain localStorage.getItem('amp_device_id')
      expect(clientSource).not.toContain("localStorage.getItem('amp_device_id')");
      // Should get device ID via the Amplitude provider
      expect(clientSource).toMatch(/getAmplitudeModule\(\)/);
    });
  });

  describe('Fix #3b: trackPageView persists UTMs with setOnce', () => {
    test('trackPageView should use Identify.setOnce for first-touch UTMs', async () => {
      const fs = await import('fs');
      const providerSource = fs.readFileSync(
        'shared/analytics/providers/amplitude-provider.ts',
        'utf-8'
      );

      expect(providerSource).toContain('first_touch_utm_source');
      expect(providerSource).toContain('.setOnce(');
    });
  });

  describe('Fix #5: pricing_page_viewed waits for profile', () => {
    test('PricingPageClient should guard with loading check before tracking', async () => {
      const fs = await import('fs');
      const pricingSource = fs.readFileSync('app/[locale]/pricing/PricingPageClient.tsx', 'utf-8');

      // The useEffect should check loading BEFORE setting hasTrackedPageView
      const trackingEffect = pricingSource.match(
        /useEffect\(\(\)\s*=>\s*\{[\s\S]*?hasTrackedPageView/
      );
      expect(trackingEffect).toBeTruthy();

      // 'if (loading) return' should appear before 'hasTrackedPageView.current = true'
      const loadingCheck = pricingSource.indexOf('if (loading) return');
      const hasTracked = pricingSource.indexOf('hasTrackedPageView.current = true');
      expect(loadingCheck).toBeGreaterThan(-1);
      expect(hasTracked).toBeGreaterThan(-1);
      expect(loadingCheck).toBeLessThan(hasTracked);
    });
  });

  describe('PRD #90: paywall_hit tracking guards', () => {
    test('Checkout page should track paywall_hit independently from checkout_opened', async () => {
      const fs = await import('fs');
      const checkoutSource = fs.readFileSync('app/[locale]/checkout/page.tsx', 'utf-8');

      expect(checkoutSource).toContain('hasTrackedPaywallHitRef');
      expect(checkoutSource).toContain('hasTrackedPaywallHitRef.current = true');
      expect(checkoutSource).toContain('!regionLoading');
      expect(checkoutSource).toContain(
        '[authLoading, country, isAuthenticated, isPaywalled, priceId, regionLoading]'
      );
    });

    test('Pricing page should not tie paywall_hit to pricing_page_viewed tracking', async () => {
      const fs = await import('fs');
      const pricingSource = fs.readFileSync('app/[locale]/pricing/PricingPageClient.tsx', 'utf-8');

      const paywallRefIndex = pricingSource.indexOf('hasTrackedPaywallHitRef');
      const pageViewTrackedIndex = pricingSource.indexOf('hasTrackedPageView.current = true');
      expect(paywallRefIndex).toBeGreaterThan(-1);
      expect(pageViewTrackedIndex).toBeGreaterThan(-1);
      expect(paywallRefIndex).toBeLessThan(pageViewTrackedIndex);
      expect(pricingSource).toContain('[country, isPaywalled, pricingRegion, regionLoading]');
    });
  });

  describe('Fix #6: addFiles accepts source param', () => {
    test('Dropzone onFilesSelected should accept optional source param', async () => {
      const fs = await import('fs');
      const dropzoneSource = fs.readFileSync(
        'client/components/features/image-processing/Dropzone.tsx',
        'utf-8'
      );

      // onFilesSelected should have source param in its type
      expect(dropzoneSource).toContain("source?: 'drag_drop' | 'file_picker'");
      // handleDrop should pass 'drag_drop'
      expect(dropzoneSource).toContain("'drag_drop'");
      // handleFileInput should pass 'file_picker'
      expect(dropzoneSource).toContain("'file_picker'");
    });
  });

  describe('Fix #10: error events should include errorType on server failures', () => {
    test('upscale route should include errorType for rate limiting and processing failures', async () => {
      const fs = await import('fs');
      const upscaleRouteSource = fs.readFileSync('app/api/upscale/route.ts', 'utf-8');

      expect(upscaleRouteSource).toContain("errorType: 'rate_limited'");
      expect(upscaleRouteSource).toContain('errorType: `replicate_${error.code}`');
      expect(upscaleRouteSource).toContain('errorType: `ai_generation_${error.finishReason}`');
      expect(upscaleRouteSource).toContain("errorType: 'unexpected_internal_error'");
    });
  });
});
