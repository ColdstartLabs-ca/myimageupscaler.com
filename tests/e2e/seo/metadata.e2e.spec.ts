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

    // Hreflang links
    const enLink = page.locator('link[rel="alternate"][hrefLang="en"]');
    const esLink = page.locator('link[rel="alternate"][hrefLang="es"]');
    const xDefaultLink = page.locator('link[rel="alternate"][hrefLang="x-default"]');

    await expect(enLink).toHaveCount(1);
    await expect(esLink).toHaveCount(1);
    await expect(xDefaultLink).toHaveCount(1);

    expect(await enLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/tools/ai-image-upscaler/'
    );
    expect(await esLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/es/tools/ai-image-upscaler/'
    );
    expect(await xDefaultLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/tools/ai-image-upscaler/'
    );

    // Canonical
    const canonicalLink = page.locator('head link[rel="canonical"]');
    expect(await canonicalLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/tools/ai-image-upscaler'
    );

    // OpenGraph locale
    const ogLocale = page.locator('head meta[property="og:locale"]');
    expect(await ogLocale.getAttribute('content')).toBe('en_US');
  });

  test('should have correct SEO metadata on Spanish tool page', async ({ page }) => {
    await page.goto('/es/tools/ai-image-upscaler');

    // Hreflang links
    const enLink = page.locator('link[rel="alternate"][hrefLang="en"]');
    const esLink = page.locator('link[rel="alternate"][hrefLang="es"]');
    const xDefaultLink = page.locator('link[rel="alternate"][hrefLang="x-default"]');

    await expect(enLink).toHaveCount(1);
    await expect(esLink).toHaveCount(1);
    await expect(xDefaultLink).toHaveCount(1);

    // Canonical should point to English version (primary language)
    const canonicalLink = page.locator('head link[rel="canonical"]');
    expect(await canonicalLink.getAttribute('href')).toBe(
      'https://myimageupscaler.com/tools/ai-image-upscaler'
    );

    // OpenGraph locale should be Spanish
    const ogLocale = page.locator('head meta[property="og:locale"]');
    expect(await ogLocale.getAttribute('content')).toBe('es_ES');
  });

  test('should have correct hreflang on category page', async ({ page }) => {
    await page.goto('/tools/');

    const enLink = page.locator('link[rel="alternate"][hrefLang="en"]');
    const esLink = page.locator('link[rel="alternate"][hrefLang="es"]');
    const xDefaultLink = page.locator('link[rel="alternate"][hrefLang="x-default"]');

    await expect(enLink).toHaveCount(1);
    await expect(esLink).toHaveCount(1);
    await expect(xDefaultLink).toHaveCount(1);

    // Metadata API generates URLs without trailing slashes
    expect(await enLink.getAttribute('href')).toBe('https://myimageupscaler.com/tools');
    expect(await esLink.getAttribute('href')).toBe('https://myimageupscaler.com/es/tools');
    expect(await xDefaultLink.getAttribute('href')).toBe('https://myimageupscaler.com/tools');
  });

  test('should have correct hreflang on homepage', async ({ page }) => {
    await page.goto('/');

    const enLink = page.locator('link[rel="alternate"][hrefLang="en"]');
    const esLink = page.locator('link[rel="alternate"][hrefLang="es"]');
    const xDefaultLink = page.locator('link[rel="alternate"][hrefLang="x-default"]');

    // Homepage uses Metadata API - root path generates URLs without trailing slash for English
    // but non-default locales get trailing slash (e.g., /es/)
    expect(await enLink.getAttribute('href')).toBe('https://myimageupscaler.com');
    expect(await esLink.getAttribute('href')).toBe('https://myimageupscaler.com/es/');
    expect(await xDefaultLink.getAttribute('href')).toBe('https://myimageupscaler.com');
  });

  test('should have correct JSON-LD inLanguage on English tool page', async ({ page }) => {
    await page.goto('/tools/ai-image-upscaler');

    const schemaScripts = page.locator('script[type="application/ld+json"]');
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

    const schemaScripts = page.locator('script[type="application/ld+json"]');
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
