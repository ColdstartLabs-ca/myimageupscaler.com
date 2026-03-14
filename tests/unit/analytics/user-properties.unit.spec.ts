import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for setPricingRegionUserProperty helper function.
 * This function sets pricing_region as a user property via $identify
 * to enable regional cohort analysis.
 */

describe('setPricingRegionUserProperty', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Function Export', () => {
    test('setPricingRegionUserProperty should be exported from @server/analytics barrel', async () => {
      const analyticsModule = await import('@server/analytics');
      expect(typeof analyticsModule.setPricingRegionUserProperty).toBe('function');
    });

    test('setPricingRegionUserProperty should be exported from analyticsService', async () => {
      const service = await import('@server/analytics/analyticsService');
      expect(typeof service.setPricingRegionUserProperty).toBe('function');
    });
  });

  describe('$setOnce Usage', () => {
    test('should use $setOnce (not $set) to avoid overwriting existing region', async () => {
      const fs = await import('fs');
      const serviceSource = fs.readFileSync('server/analytics/analyticsService.ts', 'utf-8');

      // The function should use $setOnce, not $set
      expect(serviceSource).toContain('$setOnce: { pricing_region:');
      expect(serviceSource).toContain('setPricingRegionUserProperty');
    });

    test('function should call trackServerEvent with $identify event type', async () => {
      const fs = await import('fs');
      const serviceSource = fs.readFileSync('server/analytics/analyticsService.ts', 'utf-8');

      // Extract the setPricingRegionUserProperty function
      const funcMatch = serviceSource.match(
        /export async function setPricingRegionUserProperty[\s\S]*?^}/m
      );
      expect(funcMatch).toBeTruthy();

      const funcBody = funcMatch![0];

      // Should call trackServerEvent with '$identify'
      expect(funcBody).toContain("'$identify'");
      expect(funcBody).toContain('trackServerEvent');
    });
  });

  describe('Function Signature', () => {
    test('should accept userId, pricingRegion, and options parameters', async () => {
      const fs = await import('fs');
      const serviceSource = fs.readFileSync('server/analytics/analyticsService.ts', 'utf-8');

      // Check function signature
      expect(serviceSource).toMatch(
        /setPricingRegionUserProperty\s*\(\s*userId:\s*string\s*,\s*pricingRegion:\s*string\s*,\s*options:\s*IServerTrackOptions\s*\)/
      );
    });

    test('should return Promise<boolean>', async () => {
      const fs = await import('fs');
      const serviceSource = fs.readFileSync('server/analytics/analyticsService.ts', 'utf-8');

      // Check return type
      expect(serviceSource).toMatch(/setPricingRegionUserProperty[\s\S]*?:\s*Promise<boolean>/);
    });
  });

  describe('Client-side $identify', () => {
    test('useRegionTier should track $identify with pricing_region', async () => {
      const fs = await import('fs');
      const hookSource = fs.readFileSync('client/hooks/useRegionTier.ts', 'utf-8');

      // Should track $identify event with $setOnce
      expect(hookSource).toContain("'$identify'");
      expect(hookSource).toContain('$setOnce');
      expect(hookSource).toContain('pricing_region');
    });

    test('useRegionTier should only identify once per session', async () => {
      const fs = await import('fs');
      const hookSource = fs.readFileSync('client/hooks/useRegionTier.ts', 'utf-8');

      // Should have a guard to prevent multiple identifications
      expect(hookSource).toMatch(/hasIdentified(Ref|PricingRegion)/);
    });

    test('useRegionTier should check analytics.isEnabled before tracking', async () => {
      const fs = await import('fs');
      const hookSource = fs.readFileSync('client/hooks/useRegionTier.ts', 'utf-8');

      // Should check if analytics is enabled before tracking
      expect(hookSource).toContain('analytics.isEnabled()');
    });
  });

  describe('Integration with trackServerEvent', () => {
    test('should pass userId in options to trackServerEvent', async () => {
      const fs = await import('fs');
      const serviceSource = fs.readFileSync('server/analytics/analyticsService.ts', 'utf-8');

      // Extract the setPricingRegionUserProperty function
      const funcMatch = serviceSource.match(
        /export async function setPricingRegionUserProperty[\s\S]*?^}/m
      );
      expect(funcMatch).toBeTruthy();

      const funcBody = funcMatch![0];

      // Should spread options and add userId
      expect(funcBody).toContain('{ ...options, userId }');
    });
  });
});

describe('User Property Coverage Tracking', () => {
  test('pricing_region should be documented in dashboard spec', async () => {
    const fs = await import('fs');
    const dashboardSpec = fs.readFileSync('docs/analysis/regional-pricing-dashboard.md', 'utf-8');

    // Should document pricing_region user property
    expect(dashboardSpec).toContain('pricing_region');
    expect(dashboardSpec).toContain('$setOnce');
    expect(dashboardSpec).toContain('$identify');
  });

  test('dashboard spec should include coverage alert threshold', async () => {
    const fs = await import('fs');
    const dashboardSpec = fs.readFileSync('docs/analysis/regional-pricing-dashboard.md', 'utf-8');

    // Should have 95% coverage threshold
    expect(dashboardSpec).toContain('95%');
    expect(dashboardSpec).toContain('Region Coverage Alert');
  });
});
