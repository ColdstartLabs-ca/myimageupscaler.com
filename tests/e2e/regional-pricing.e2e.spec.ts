import { test, expect } from '@playwright/test';

test.describe('Regional Pricing & Bandit', () => {
  test('Brazil (BR) gets LATAM pricing with discount - API level', async ({ request }) => {
    const geoResponse = await request.get('/api/geo', {
      headers: { 'x-test-country': 'BR' },
    });
    const geoData = await geoResponse.json();

    expect(geoData).toMatchObject({
      country: 'BR',
      pricingRegion: 'latam',
      tier: 'restricted',
    });
    expect(geoData.discountPercent).toBeGreaterThan(0);
    expect(geoData.banditArmId).toBeTruthy();
  });

  test('India (IN) gets South Asia pricing with higher discount - API level', async ({ request }) => {
    const geoResponse = await request.get('/api/geo', {
      headers: { 'x-test-country': 'IN' },
    });
    const geoData = await geoResponse.json();

    expect(geoData).toMatchObject({
      country: 'IN',
      pricingRegion: 'south_asia',
      tier: 'paywalled',
    });
    expect(geoData.discountPercent).toBeGreaterThan(0);
    expect(geoData.banditArmId).toBeTruthy();
  });

  test('US gets standard pricing with no discount - API level', async ({ request }) => {
    const geoResponse = await request.get('/api/geo', {
      headers: { 'x-test-country': 'US' },
    });
    const geoData = await geoResponse.json();

    expect(geoData).toMatchObject({
      country: 'US',
      pricingRegion: 'standard',
      tier: 'standard',
      discountPercent: 0,
      banditArmId: null,
    });
  });

  test('pricing page loads and displays title', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByTestId('pricing-page-title')).toBeVisible();
  });

  test('Brazil (BR) sees discounted prices via cookie - UI level', async ({ page }) => {
    // First, get the correct pricing data via API with test header
    const apiResponse = await page.request.get('/api/geo', {
      headers: { 'x-test-country': 'BR' },
    });
    const geoData = await apiResponse.json();
    const expectedDiscount = geoData.discountPercent;
    const expectedRegion = geoData.pricingRegion;

    console.log(`Brazil: region=${expectedRegion}, discount=${expectedDiscount}%, banditArm=${geoData.banditArmId}`);

    // Set the pricing_geo_v1 cookie directly (bypassing client fetch)
    const cookieValue = JSON.stringify({
      country: 'BR',
      tier: 'restricted',
      pricingRegion: expectedRegion,
      discountPercent: expectedDiscount,
      banditArmId: geoData.banditArmId,
    });

    await page.context().addCookies([
      {
        name: 'pricing_geo_v1',
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        sameSite: 'Lax',
      },
    ]);

    // KEY: Also set CF-IPCountry header so server uses the cookie (see pricing/page.tsx:55)
    await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'BR' });

    // Now navigate to pricing page - it will use the cookie
    await page.goto('/pricing');

    // Wait for the page to load
    await expect(page.getByTestId('pricing-page-title')).toBeVisible();

    // Check that discount badges are showing
    const discountBadges = page.locator('text=/\\d+% OFF/');
    const count = await discountBadges.count();
    console.log(`Found ${count} discount badges on page`);

    // The cookie should trigger regional pricing display
    expect(count).toBeGreaterThan(0);
  });
});
