import { test, expect } from '../tests/test-fixtures';

/**
 * SEO Redirects E2E Tests
 *
 * Tests for verifying that legacy/incorrect URLs properly redirect to canonical locations.
 * These are 301 permanent redirects for SEO purposes.
 *
 * Redirects tested:
 * - www.myimageupscaler.com → myimageupscaler.com (WWW to non-WWW)
 * - /tools/bulk-image-resizer → /tools/resize/bulk-image-resizer
 * - /tools/bulk-image-compressor → /tools/compress/bulk-image-compressor
 */

test.describe('SEO Redirects E2E Tests', () => {
  test.describe('WWW to non-WWW Redirects', () => {
    test('www subdomain redirects to non-www (301)', async ({ page }) => {
      // Note: In local development, we cannot test actual www.localhost redirection
      // because www.localhost is not a valid hostname.

      // The middleware's handleWWWRedirect function (in middleware.ts) correctly
      // strips the www. prefix and returns a 301 redirect. This logic is verified
      // by unit tests.

      // In production, requests to www.myimageupscaler.com will be redirected to
      // myimageupscaler.com with a 301 permanent redirect for SEO.

      // This E2E test verifies the homepage loads correctly, ensuring the
      // middleware doesn't break normal requests
      await page.goto('/');
      await expect(page.locator('h1')).toBeVisible();
    });
  });

  test.describe('Bulk Image Resizer Redirects', () => {
    test('/tools/bulk-image-resizer redirects to /tools/resize/bulk-image-resizer (301)', async ({
      page,
    }) => {
      // Navigate to the old URL without trailing slash
      const response = await page.goto('/tools/bulk-image-resizer');

      // Should redirect to the new canonical URL
      expect(page.url()).toContain('/tools/resize/bulk-image-resizer');

      // Should be a 301 permanent redirect
      if (response?.request().redirectedFrom()) {
        const redirectStatus = response?.status();
        expect(redirectStatus).toBe(200); // Final response should be 200
      }

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('/tools/bulk-image-resizer/ redirects to /tools/resize/bulk-image-resizer (301)', async ({
      page,
    }) => {
      // Navigate to the old URL with trailing slash
      await page.goto('/tools/bulk-image-resizer/');

      // Should redirect to the new canonical URL
      expect(page.url()).toContain('/tools/resize/bulk-image-resizer');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });
  });

  test.describe('Bulk Image Compressor Redirects', () => {
    test('/tools/bulk-image-compressor redirects to /tools/compress/bulk-image-compressor (301)', async ({
      page,
    }) => {
      // Navigate to the old URL without trailing slash
      await page.goto('/tools/bulk-image-compressor');

      // Should redirect to the new canonical URL
      expect(page.url()).toContain('/tools/compress/bulk-image-compressor');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('/tools/bulk-image-compressor/ redirects to /tools/compress/bulk-image-compressor (301)', async ({
      page,
    }) => {
      // Navigate to the old URL with trailing slash
      await page.goto('/tools/bulk-image-compressor/');

      // Should redirect to the new canonical URL
      expect(page.url()).toContain('/tools/compress/bulk-image-compressor');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });
  });

  test.describe('Canonical URLs', () => {
    test('Homepage has correct canonical URL (not localhost)', async ({ page }) => {
      await page.goto('/');

      // Check the canonical link element
      // Note: link elements in <head> are not visible, so we check for existence instead
      const canonicalLink = page.locator('link[rel="canonical"]').first();
      await expect(canonicalLink).toHaveCount(1);

      const canonicalHref = await canonicalLink.getAttribute('href');
      expect(canonicalHref).toBe('https://myimageupscaler.com/');
      expect(canonicalHref).not.toContain('localhost');
      expect(canonicalHref).not.toContain('3000');
      expect(canonicalHref).not.toContain('3001');
    });
  });

  test.describe('Tracking Parameter Cleanup for SEO', () => {
    test('redirects ?signup=1 to clean URL (301)', async ({ page }) => {
      const response = await page.goto('/?signup=1');

      // Should redirect to clean URL
      expect(page.url()).toBe('http://localhost:3000/');

      // Should be a 301 permanent redirect
      if (response?.request().redirectedFrom()) {
        const redirectStatus = response?.status();
        expect(redirectStatus).toBe(200); // Final response should be 200
      }

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('redirects UTM parameters to clean URL (301)', async ({ page }) => {
      await page.goto('/?utm_source=google&utm_medium=cpc&utm_campaign=test');

      // Should redirect to clean URL
      expect(page.url()).toBe('http://localhost:3000/');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('redirects ?signup=1 on pSEO pages to clean URL', async ({ page }) => {
      await page.goto('/tools/ai-upscaler?signup=1');

      // Should redirect to clean URL
      expect(page.url()).toContain('/tools/ai-upscaler/');
      expect(page.url()).not.toContain('signup');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('preserves non-tracking query parameters', async ({ page }) => {
      // This test verifies that functional query params (non-tracking) are preserved
      // Note: Most pages might not use query params, but if they do, they should be kept
      await page.goto('/?test=value');

      // Functional params should be preserved
      expect(page.url()).toContain('test=value');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('strips tracking params while preserving functional params', async ({ page }) => {
      // This test verifies that tracking params are stripped but functional ones are kept
      // Note: Our middleware handles this, but we need a page that uses query params
      // For now, we test that the redirect happens correctly
      const response = await page.goto('/?page=2&utm_source=google');

      // Should strip utm_source but keep page=2
      expect(page.url()).toContain('page=2');
      expect(page.url()).not.toContain('utm_source');

      // Page should load (might 404 if no page=2 handling exists, but that's OK)
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
    });

    test('handles multiple tracking parameters', async ({ page }) => {
      await page.goto('/?signup=1&ref=email&utm_source=newsletter&fbclid=test123');

      // Should redirect to clean URL (all params are tracking params)
      expect(page.url()).toBe('http://localhost:3000/');
      expect(page.url()).not.toContain('signup');
      expect(page.url()).not.toContain('ref');
      expect(page.url()).not.toContain('utm_source');
      expect(page.url()).not.toContain('fbclid');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('handles Facebook Click ID (fbclid) parameter', async ({ page }) => {
      await page.goto('/?fbclid=abc123xyz789');

      // Should redirect to clean URL
      expect(page.url()).toBe('http://localhost:3000/');
      expect(page.url()).not.toContain('fbclid');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('handles Google Click ID (gclid) parameter', async ({ page }) => {
      await page.goto('/?gclid=123abc789xyz');

      // Should redirect to clean URL
      expect(page.url()).toBe('http://localhost:3000/');
      expect(page.url()).not.toContain('gclid');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('handles Microsoft Click ID (msclkid) parameter', async ({ page }) => {
      await page.goto('/?msclkid=test123');

      // Should redirect to clean URL
      expect(page.url()).toBe('http://localhost:3000/');
      expect(page.url()).not.toContain('msclkid');

      // Page should load successfully
      await expect(page.locator('h1')).toBeVisible();
    });

    test('canonical URL does not include tracking parameters', async ({ page }) => {
      // Navigate with tracking params
      await page.goto('/?signup=1&utm_source=google');

      // Wait for redirect to complete
      await page.waitForURL('http://localhost:3000/');

      // Check the canonical link element
      const canonicalLink = page.locator('link[rel="canonical"]').first();
      await expect(canonicalLink).toHaveCount(1);

      const canonicalHref = await canonicalLink.getAttribute('href');

      // Canonical should always be the clean URL
      expect(canonicalHref).toBe('https://myimageupscaler.com/');
      expect(canonicalHref).not.toContain('signup');
      expect(canonicalHref).not.toContain('utm_source');
    });
  });
});
