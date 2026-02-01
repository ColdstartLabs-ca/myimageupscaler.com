/**
 * SEO Metadata E2E Tests
 * Phase 5: Metadata & SEO with hreflang
 *
 * Tests that SEO tags are correctly rendered in the HTML head
 */

import { test, expect } from '@playwright/test';

test.describe('SEO Metadata', () => {
  test('should have correct SEO metadata on English tool page', async ({ page }) => {
    await page.goto('/tools/ai-image-upscaler');

    // Wait for page to be loaded and metadata to be present
    await page.waitForLoadState('domcontentloaded');

    // Hreflang links - wait for them to be present in DOM
    const enLink = page.locator('head link[rel="alternate"][hrefLang="en"]');
    const esLink = page.locator('head link[rel="alternate"][hrefLang="es"]');
    const xDefaultLink = page.locator('head link[rel="alternate"][hrefLang="x-default"]');

    // Wait for elements to exist in DOM before checking counts
    await enLink.waitFor({ state: 'attached', timeout: 5000 });
    await esLink.waitFor({ state: 'attached', timeout: 5000 });
    await xDefaultLink.waitFor({ state: 'attached', timeout: 5000 });

    await expect(enLink).toHaveCount(1);
    await expect(esLink).toHaveCount(1);
    await expect(xDefaultLink).toHaveCount(1);

    // Note: hreflang URLs are generated without trailing slashes
    expect(await enLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/tools/ai-image-upscaler'
    );
    expect(await esLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/es/tools/ai-image-upscaler'
    );
    expect(await xDefaultLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/tools/ai-image-upscaler'
    );

    // Canonical
    const canonicalLink = page.locator('head link[rel="canonical"]');
    await canonicalLink.waitFor({ state: 'attached', timeout: 5000 });
    expect(await canonicalLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/tools/ai-image-upscaler'
    );

    // OpenGraph locale
    const ogLocale = page.locator('head meta[property="og:locale"]');
    await ogLocale.waitFor({ state: 'attached', timeout: 5000 });
    expect(await ogLocale.getAttribute('content')).toBe('en_US');
  });

  test('should have correct SEO metadata on Spanish tool page', async ({ page }) => {
    await page.goto('/es/tools/ai-image-upscaler');

    // Wait for page to be loaded
    await page.waitForLoadState('domcontentloaded');

    // Hreflang links - wait for them to be present in DOM
    const enLink = page.locator('head link[rel="alternate"][hrefLang="en"]');
    const esLink = page.locator('head link[rel="alternate"][hrefLang="es"]');
    const xDefaultLink = page.locator('head link[rel="alternate"][hrefLang="x-default"]');

    await enLink.waitFor({ state: 'attached', timeout: 5000 });
    await esLink.waitFor({ state: 'attached', timeout: 5000 });
    await xDefaultLink.waitFor({ state: 'attached', timeout: 5000 });

    await expect(enLink).toHaveCount(1);
    await expect(esLink).toHaveCount(1);
    await expect(xDefaultLink).toHaveCount(1);

    // Canonical should point to Spanish version (locale-specific canonicals)
    // This was changed to fix "hreflang to non-canonical pages" SEO issue
    const canonicalLink = page.locator('head link[rel="canonical"]');
    await canonicalLink.waitFor({ state: 'attached', timeout: 5000 });
    expect(await canonicalLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/es/tools/ai-image-upscaler'
    );

    // OpenGraph locale should be Spanish
    const ogLocale = page.locator('head meta[property="og:locale"]');
    await ogLocale.waitFor({ state: 'attached', timeout: 5000 });
    expect(await ogLocale.getAttribute('content')).toBe('es_ES');
  });

  test('should have correct hreflang on category page', async ({ page }) => {
    await page.goto('/tools');

    // Wait for network idle to ensure all metadata is loaded
    await page.waitForLoadState('networkidle');

    // Get all alternate links from head and check them
    const alternates = await page.locator('head link[rel="alternate"]').all();

    // Should have at least 3 alternates (en, es, x-default)
    expect(alternates.length).toBeGreaterThanOrEqual(3);

    // Find the specific alternates we need
    let enHref: string | null = null;
    let esHref: string | null = null;
    let xDefaultHref: string | null = null;

    for (const link of alternates) {
      const hreflang = await link.getAttribute('hreflang');
      const href = await link.getAttribute('href');

      if (hreflang === 'en') enHref = href;
      if (hreflang === 'es') esHref = href;
      if (hreflang === 'x-default') xDefaultHref = href;
    }

    // Metadata API generates URLs without trailing slashes
    expect(enHref).toBe('https://myimageupscaler.com/tools');
    expect(esHref).toBe('https://myimageupscaler.com/es/tools');
    expect(xDefaultHref).toBe('https://myimageupscaler.com/tools');
  });

  test('should have correct hreflang on homepage', async ({ page }) => {
    await page.goto('/');

    // Wait for network idle to ensure all metadata is loaded
    await page.waitForLoadState('networkidle');

    // Get all alternate links from head and check them
    const alternates = await page.locator('head link[rel="alternate"]').all();

    // Should have at least 3 alternates (en, es, x-default)
    expect(alternates.length).toBeGreaterThanOrEqual(3);

    // Find the specific alternates we need
    let enHref: string | null = null;
    let esHref: string | null = null;
    let xDefaultHref: string | null = null;

    for (const link of alternates) {
      const hreflang = await link.getAttribute('hreflang');
      const href = await link.getAttribute('href');

      if (hreflang === 'en') enHref = href;
      if (hreflang === 'es') esHref = href;
      if (hreflang === 'x-default') xDefaultHref = href;
    }

    // Homepage URLs - HreflangLinks component adds / for root path
    expect(enHref).toBe('https://myimageupscaler.com/');
    expect(esHref).toBe('https://myimageupscaler.com/es');
    expect(xDefaultHref).toBe('https://myimageupscaler.com/');
  });

  test('should have correct JSON-LD inLanguage on English tool page', async ({ page }) => {
    await page.goto('/tools/ai-image-upscaler');

    // Wait for page to be loaded and scripts to be present
    await page.waitForLoadState('domcontentloaded');

    const schemaScripts = page.locator('script[type="application/ld+json"]');
    // Wait for at least one script to be present
    await schemaScripts.first().waitFor({ state: 'attached', timeout: 5000 });

    const count = await schemaScripts.count();
    expect(count).toBeGreaterThan(0);

    let foundSoftwareApp = false;
    for (let i = 0; i < count; i++) {
      const content = await schemaScripts.nth(i).textContent();
      if (!content) continue;

      const schema = JSON.parse(content);
      if (schema['@graph']) {
        const softwareApp = schema['@graph'].find(
          (item: { '@type'?: string }) => item['@type'] === 'SoftwareApplication'
        );

        if (softwareApp) {
          foundSoftwareApp = true;
          expect(softwareApp.inLanguage).toBe('en');
          break;
        }
      }
    }

    expect(foundSoftwareApp).toBe(true);
  });

  test('should have correct JSON-LD inLanguage on Spanish tool page', async ({ page }) => {
    await page.goto('/es/tools/ai-image-upscaler');

    // Wait for page to be loaded and scripts to be present
    await page.waitForLoadState('domcontentloaded');

    const schemaScripts = page.locator('script[type="application/ld+json"]');
    // Wait for at least one script to be present
    await schemaScripts.first().waitFor({ state: 'attached', timeout: 5000 });

    const count = await schemaScripts.count();
    expect(count).toBeGreaterThan(0);

    let foundSoftwareApp = false;
    for (let i = 0; i < count; i++) {
      const content = await schemaScripts.nth(i).textContent();
      if (!content) continue;

      const schema = JSON.parse(content);
      if (schema['@graph']) {
        const softwareApp = schema['@graph'].find(
          (item: { '@type'?: string }) => item['@type'] === 'SoftwareApplication'
        );

        if (softwareApp) {
          foundSoftwareApp = true;
          expect(softwareApp.inLanguage).toBe('es');
          break;
        }
      }
    }

    expect(foundSoftwareApp).toBe(true);
  });
});
