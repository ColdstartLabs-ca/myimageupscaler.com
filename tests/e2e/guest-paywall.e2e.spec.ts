#!/usr/bin/env tsx
/**
 * E2E Tests for Guest Paywall Functionality
 *
 * Tests the country-based paywall for the guest upscaler.
 *
 * Related PR: feat(anti-freeloader): add IP cross-account flagging + country paywall
 *
 * Note: The core paywall logic is thoroughly tested via unit tests in:
 * - tests/unit/anti-freeloader/guest-paywall.unit.spec.ts (API blocking)
 * - tests/unit/anti-freeloader/region-classifier.unit.spec.ts (tier classification)
 * - tests/unit/anti-freeloader/users-setup.unit.spec.ts (user setup with paywalled tier)
 *
 * This E2E test verifies the page loads correctly and the API endpoint exists.
 */

import { test, expect } from '../test-fixtures';

test.describe('Guest Paywall E2E Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify the page loaded
    await expect(page).toHaveTitle(/Upscale/i);
  });

  test('tools page loads successfully', async ({ page }) => {
    await page.goto('/tools/ai-image-upscaler');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify the page loaded (check for any heading or content)
    const pageContent = page.locator('body');
    await expect(pageContent).toBeVisible();
  });

  test('geo API endpoint is accessible', async ({ request }) => {
    // Make a direct API request to verify the endpoint exists
    const response = await request.get('/api/geo');

    // The endpoint should respond (even if it returns null country in test env)
    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify the response structure includes the isPaywalled field
    expect(data).toHaveProperty('isPaywalled');
    expect(typeof data.isPaywalled).toBe('boolean');
    expect(data).toHaveProperty('tier');
    expect(data).toHaveProperty('pricingRegion');
    expect(data).toHaveProperty('discountPercent');
  });

  test('geo API returns correct structure for test environment', async ({ request }) => {
    const response = await request.get('/api/geo');
    expect(response.status()).toBe(200);

    const data = await response.json();

    // In test environment without CF-IPCountry header, should return default values
    expect(data).toMatchObject({
      isPaywalled: false,
      tier: expect.any(String),
      pricingRegion: expect.any(String),
      discountPercent: expect.any(Number),
    });
  });
});
