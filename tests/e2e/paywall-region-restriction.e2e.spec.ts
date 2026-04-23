import { test, expect } from '@playwright/test';

/**
 * E2E tests for paywall region restriction feature (PRD #90)
 *
 * Tests the paywall functionality that blocks free-tier access for non-converting countries:
 * - Paywall warning banner on pricing page
 * - Paywall warning banner on checkout page
 * - Analytics tracking for paywall hits
 * - Region-based tier classification
 *
 * Note: Tests run against the parent project's code. The PR adds more paywalled
 * countries (ID, TH, NG, KE, PK, BD, etc.), but only PH and VN are paywalled
 * in the parent project at the time of testing.
 */

// Countries based on parent project's region-classifier.ts
const PAYWALLED_COUNTRIES = ['PH', 'VN'];
const STANDARD_COUNTRIES = ['US', 'GB', 'JP', 'DE'];
const RESTRICTED_COUNTRIES = ['IN', 'BR', 'RU'];

test.describe('Paywall - Pricing Page', () => {
  test('shows paywall warning banner for paywalled countries (PH)', async ({ page }) => {
    // Use context to set headers before page load
    await page.setExtraHTTPHeaders({
      'x-test-country': 'PH',
    });

    await page.goto('/pricing', {
      waitUntil: 'domcontentloaded',
    });

    // Wait for geo detection to complete
    await page.waitForTimeout(1500);

    // Check for paywall warning banner
    const paywallBanner = page.getByText('Free tier not available in your region').first();
    await expect(paywallBanner).toBeVisible({ timeout: 15000 }).catch(() => {
      // Debug: check what's actually on the page
      return page.screenshot({ path: 'qa-artifacts/pricing-ph-debug.png' }).then(() => {
        throw new Error('Paywall banner not found - screenshot saved');
      });
    });
  });

  test('does NOT show paywall banner for standard countries', async ({ page }) => {
    await page.setExtraHTTPHeaders({
      'x-test-country': 'US',
    });

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const paywallBanner = page.getByText('Free tier not available in your region');
    await expect(paywallBanner).not.toBeVisible();
  });

  test('restricted country (IN) does NOT show paywall', async ({ page }) => {
    await page.setExtraHTTPHeaders({
      'x-test-country': 'IN',
    });

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const paywallBanner = page.getByText('Free tier not available in your region');
    await expect(paywallBanner).not.toBeVisible();
  });

  test('shows pricing cards for paywalled users', async ({ page }) => {
    await page.setExtraHTTPHeaders({
      'x-test-country': 'VN',
    });

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Pricing cards should be visible
    const subscribeTab = page.getByRole('button', { name: 'Subscribe' });
    await subscribeTab.click();
    await page.waitForTimeout(500);

    const planButtons = page.getByRole('button', {
      name: /get started|subscribe/i,
    });
    await expect(planButtons.first()).toBeVisible();
  });
});

test.describe('Paywall - Checkout Page', () => {
  test('shows paywall warning banner for paywalled countries', async ({ page }) => {
    await page.setExtraHTTPHeaders({
      'x-test-country': 'PH',
    });

    await page.goto('/checkout?priceId=test_price', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const paywallBanner = page.getByText('Free tier not available in your region').first();
    await expect(paywallBanner).toBeVisible({ timeout: 15000 }).catch(() => {
      return page.screenshot({ path: 'qa-artifacts/checkout-ph-debug.png' }).then(() => {
        throw new Error('Paywall banner not found on checkout - screenshot saved');
      });
    });
  });

  test('does NOT show paywall banner for standard countries', async ({ page }) => {
    await page.setExtraHTTPHeaders({
      'x-test-country': 'GB',
    });

    await page.goto('/checkout?priceId=test_price', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const paywallBanner = page.getByText('Free tier not available in your region');
    await expect(paywallBanner).not.toBeVisible();
  });
});

test.describe('Paywall - API Endpoint Verification', () => {
  test('geo API correctly identifies paywalled countries', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: {
        'x-test-country': 'PH',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      tier: 'paywalled',
      country: 'PH',
      isPaywalled: true,
    });
  });

  test('geo API correctly identifies standard countries', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: {
        'x-test-country': 'US',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      tier: 'standard',
      country: 'US',
      isPaywalled: false,
    });
  });

  test('geo API correctly identifies restricted countries', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: {
        'x-test-country': 'IN',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data).toMatchObject({
      tier: 'restricted',
      country: 'IN',
      isPaywalled: false,
    });
  });

  test('geo API: VN is paywalled', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: {
        'x-test-country': 'VN',
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.tier).toBe('paywalled');
    expect(data.country).toBe('VN');
    expect(data.isPaywalled).toBe(true);
  });

  // Test a few countries that should NOT be paywalled
  for (const country of [...STANDARD_COUNTRIES.slice(0, 2), ...RESTRICTED_COUNTRIES.slice(0, 2)]) {
    test(`geo API: ${country} is NOT paywalled`, async ({ request }) => {
      const response = await request.get('/api/geo', {
        headers: {
          'x-test-country': country,
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();

      expect(data.tier).not.toBe('paywalled');
      expect(data.isPaywalled).toBe(false);
    });
  }
});

test.describe('Paywall - Unit Test Verification', () => {
  // These verify the core region classifier logic
  test('region classifier: PH returns paywalled tier', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: { 'x-test-country': 'PH' },
    });

    const data = await response.json();
    expect(data.tier).toBe('paywalled');
  });

  test('region classifier: VN returns paywalled tier', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: { 'x-test-country': 'VN' },
    });

    const data = await response.json();
    expect(data.tier).toBe('paywalled');
  });

  test('region classifier: US returns standard tier', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: { 'x-test-country': 'US' },
    });

    const data = await response.json();
    expect(data.tier).toBe('standard');
  });

  test('region classifier: IN returns restricted tier', async ({ request }) => {
    const response = await request.get('/api/geo', {
      headers: { 'x-test-country': 'IN' },
    });

    const data = await response.json();
    expect(data.tier).toBe('restricted');
  });
});
