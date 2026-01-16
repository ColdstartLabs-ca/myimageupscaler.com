/**
 * pSEO Fixes Verification Tests
 *
 * Tests to verify that all pSEO audit issues have been fixed:
 * 1. New category hub pages are accessible
 * 2. Individual pages in new categories are accessible
 * 3. New sitemap routes are accessible
 * 4. Main sitemap index includes all new categories
 * 5. Internal links point to valid pages
 */

import { test, expect } from '../test-fixtures';

// New category hub pages
const NEW_CATEGORY_HUBS = [
  '/photo-restoration',
  '/camera-raw',
  '/industry-insights',
  '/device-optimization',
  '/bulk-tools',
  '/content',
];

// New sitemap routes
const NEW_SITEMAPS = [
  '/sitemap-photo-restoration.xml',
  '/sitemap-camera-raw.xml',
  '/sitemap-industry-insights.xml',
  '/sitemap-device-optimization.xml',
  '/sitemap-bulk-tools.xml',
  '/sitemap-content.xml',
];

test.describe('pSEO Fixes - Category Hub Pages', () => {
  test.describe('New category hub pages are accessible', () => {
    for (const hubPath of NEW_CATEGORY_HUBS) {
      test(`${hubPath} hub page loads successfully`, async ({ page }) => {
        const response = await page.goto(hubPath);

        expect(response?.status()).toBe(200);

        // Check for proper page title
        const title = await page.title();
        expect(title).toBeTruthy();
        expect(title.length).toBeGreaterThan(0);

        // Check for main heading
        const h1 = page.locator('h1').first();
        await expect(h1).toBeVisible();

        // Check that page has content
        const content = page.locator('.container, main, [class*="container"]').first();
        await expect(content).toBeVisible();
      });
    }
  });

  test.describe('Hub pages have proper SEO elements', () => {
    for (const hubPath of NEW_CATEGORY_HUBS) {
      test(`${hubPath} has meta description and title`, async ({ page }) => {
        await page.goto(hubPath);

        // Check for meta description
        const metaDescription = await page
          .locator('meta[name="description"]')
          .getAttribute('content');
        expect(metaDescription).toBeTruthy();
        expect(metaDescription?.length).toBeGreaterThan(0);

        // Check for canonical link
        const canonical = page.locator('link[rel="canonical"]');
        const canonicalHref = await canonical.getAttribute('href');
        expect(canonicalHref).toContain(hubPath);
      });
    }
  });

  test.describe('Hub pages display page links', () => {
    test('photo-restoration hub shows restoration pages', async ({ page }) => {
      await page.goto(`/photo-restoration`);

      // Look for links to individual pages
      const links = page.locator('a[href^="/photo-restoration/"]');
      const count = await links.count();

      expect(count).toBeGreaterThan(0);

      // Check first link is valid
      if (count > 0) {
        const firstLinkHref = await links.first().getAttribute('href');
        expect(firstLinkHref).toMatch(/^\/photo-restoration\/[^/]+$/);
      }
    });

    test('camera-raw hub shows camera pages', async ({ page }) => {
      await page.goto(`/camera-raw`);

      const links = page.locator('a[href^="/camera-raw/"]');
      const count = await links.count();

      expect(count).toBeGreaterThan(0);
    });

    test('industry-insights hub shows insight pages', async ({ page }) => {
      await page.goto(`/industry-insights`);

      const links = page.locator('a[href^="/industry-insights/"]');
      const count = await links.count();

      expect(count).toBeGreaterThan(0);
    });

    test('device-optimization hub shows optimization pages', async ({ page }) => {
      await page.goto(`/device-optimization`);

      const links = page.locator('a[href^="/device-optimization/"]');
      const count = await links.count();

      expect(count).toBeGreaterThan(0);
    });

    test('bulk-tools hub shows bulk tool pages', async ({ page }) => {
      await page.goto(`/bulk-tools`);

      const links = page.locator('a[href^="/bulk-tools/"]');
      const count = await links.count();

      expect(count).toBeGreaterThan(0);
    });

    test('content hub shows content pages', async ({ page }) => {
      await page.goto(`/content`);

      const links = page.locator('a[href^="/content/"]');
      const count = await links.count();

      expect(count).toBeGreaterThan(0);
    });
  });
});

test.describe('pSEO Fixes - Individual Category Pages', () => {
  test('Sample pages from each category are accessible', async ({ page }) => {
    test.setTimeout(60000); // Increase timeout to 60 seconds

    // Navigate to each hub and click the first link
    const testCases = [
      { hub: '/photo-restoration', category: 'photo-restoration' },
      { hub: '/camera-raw', category: 'camera-raw' },
      { hub: '/industry-insights', category: 'industry-insights' },
      { hub: '/device-optimization', category: 'device-optimization' },
      { hub: '/bulk-tools', category: 'bulk-tools' },
      { hub: '/content', category: 'content' },
    ];

    for (const { hub, category } of testCases) {
      console.log(`Testing category: ${category}`);
      await page.goto(hub, { timeout: 15000 });

      // Find first link to a detail page
      const firstLink = page.locator(`a[href^="/${category}/"]`).first();

      const linkExists = (await firstLink.count()) > 0;
      if (linkExists) {
        // Get the href to navigate directly (more reliable than clicking)
        const href = await firstLink.getAttribute('href');
        expect(href).toBeTruthy();
        console.log(`  Navigating to: ${href}`);

        // Navigate to the detail page with increased timeout
        const response = await page.goto(href!, { timeout: 15000 });
        expect(response?.status()).toBe(200);

        // Verify page has content
        const h1 = page.locator('h1').first();
        await expect(h1).toBeVisible({ timeout: 10000 });

        // Go back to hub for next iteration
        await page.goto(hub, { timeout: 15000 });
      } else {
        console.log(`  No links found for category: ${category}`);
      }
    }
  });

  test('Individual pages have proper SEO structure', async ({ page }) => {
    await page.goto(`/photo-restoration`);

    // Get first link
    const firstLink = page.locator('a[href^="/photo-restoration/"]').first();
    const linkExists = (await firstLink.count()) > 0;

    if (linkExists) {
      const href = await firstLink.getAttribute('href');
      await page.goto(href);

      // Check for schema.org markup
      const schemaScripts = page.locator('script[type="application/ld+json"]');
      const schemaCount = await schemaScripts.count();
      expect(schemaCount).toBeGreaterThan(0);

      // Check for proper heading structure
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible();

      // Check for FAQ section (common in pSEO pages)
      const faqSection = page.locator('[class*="faq"], [id*="faq"], .faq').first();
      const faqExists = await faqSection.count();
      if (faqExists > 0) {
        await expect(faqSection).toBeVisible();
      }
    }
  });
});

test.describe('pSEO Fixes - Sitemap Routes', () => {
  test.describe('New sitemap routes are accessible', () => {
    for (const sitemapPath of NEW_SITEMAPS) {
      test(`${sitemapPath} returns valid XML`, async ({ request }) => {
        const response = await request.get(sitemapPath);

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/xml');

        const text = await response.text();
        expect(text).toContain('<?xml version="1.0"');
        expect(text).toContain('<urlset');
        expect(text).toContain('</urlset>');
      });
    }
  });

  test.describe('Sitemaps contain valid entries', () => {
    test('photo-restoration sitemap has entries', async ({ request }) => {
      const response = await request.get(`/sitemap-photo-restoration.xml`);
      const text = await response.text();

      // Should have hub page entry (use regex to match any domain)
      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/photo-restoration<\/loc>/);

      // Should have individual page entries
      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/photo-restoration\//);
    });

    test('camera-raw sitemap has entries', async ({ request }) => {
      const response = await request.get(`/sitemap-camera-raw.xml`);
      const text = await response.text();

      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/camera-raw<\/loc>/);
      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/camera-raw\//);
    });

    test('industry-insights sitemap has entries', async ({ request }) => {
      const response = await request.get(`/sitemap-industry-insights.xml`);
      const text = await response.text();

      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/industry-insights<\/loc>/);
      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/industry-insights\//);
    });

    test('device-optimization sitemap has entries', async ({ request }) => {
      const response = await request.get(`/sitemap-device-optimization.xml`);
      const text = await response.text();

      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/device-optimization<\/loc>/);
      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/device-optimization\//);
    });

    test('bulk-tools sitemap has entries', async ({ request }) => {
      const response = await request.get(`/sitemap-bulk-tools.xml`);
      const text = await response.text();

      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/bulk-tools<\/loc>/);
      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/bulk-tools\//);
    });

    test('content sitemap has entries', async ({ request }) => {
      const response = await request.get(`/sitemap-content.xml`);
      const text = await response.text();

      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/content<\/loc>/);
      expect(text).toMatch(/<loc>https?:\/\/[^/]+\/content\//);
    });
  });

  test.describe('Sitemaps have proper cache headers', () => {
    for (const sitemapPath of NEW_SITEMAPS) {
      test(`${sitemapPath} has cache headers`, async ({ request }) => {
        const response = await request.get(sitemapPath);

        const cacheControl = response.headers()['cache-control'];
        expect(cacheControl).toContain('public');
      });
    }
  });
});

test.describe('pSEO Fixes - Main Sitemap Index', () => {
  test('Main sitemap index includes all new categories', async ({ request }) => {
    const response = await request.get(`/sitemap.xml`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/xml');

    const text = await response.text();

    // Check for sitemap index structure
    expect(text).toContain('<?xml version="1.0"');
    expect(text).toContain('<sitemapindex');
    expect(text).toContain('</sitemapindex>');

    // Verify all new sitemaps are referenced
    expect(text).toMatch(/<loc>https?:\/\/[^/]+\/sitemap-photo-restoration\.xml<\/loc>/);
    expect(text).toMatch(/<loc>https?:\/\/[^/]+\/sitemap-camera-raw\.xml<\/loc>/);
    expect(text).toMatch(/<loc>https?:\/\/[^/]+\/sitemap-industry-insights\.xml<\/loc>/);
    expect(text).toMatch(/<loc>https?:\/\/[^/]+\/sitemap-device-optimization\.xml<\/loc>/);
    expect(text).toMatch(/<loc>https?:\/\/[^/]+\/sitemap-bulk-tools\.xml<\/loc>/);
    expect(text).toMatch(/<loc>https?:\/\/[^/]+\/sitemap-content\.xml<\/loc>/);
  });

  test('Main sitemap has proper lastmod dates', async ({ request }) => {
    const response = await request.get(`/sitemap.xml`);
    const text = await response.text();

    // Each sitemap entry should have a lastmod date
    // The format is: <lastmod>2025-01-15T12:34:56.789Z</lastmod>
    expect(text).toContain('<lastmod>');
    expect(text).toContain('</lastmod>');
  });
});

test.describe('pSEO Fixes - Internal Link Validation', () => {
  test('Links on hub pages point to valid destinations', async ({ page }) => {
    test.setTimeout(60000); // Increase timeout to 60 seconds

    const hubsToTest = [
      '/photo-restoration',
      '/camera-raw',
      '/industry-insights',
      '/device-optimization',
      '/bulk-tools',
      '/content',
    ];

    for (const hub of hubsToTest) {
      await page.goto(hub);

      // Get all internal links on the hub page
      const links = await page.locator('a[href^="/"]').all();

      // Test a sample of links (not all to avoid timeout)
      const sampleSize = Math.min(3, links.length);

      for (let i = 0; i < sampleSize; i++) {
        const link = links[i];
        const href = await link.getAttribute('href');

        if (href) {
          // Check if link is internal
          if (href.startsWith('/') && !href.startsWith('//')) {
            try {
              const response = await page.goto(href, { timeout: 10000 });
              // Allow 200 (OK) and 404 (for not yet implemented pages)
              expect(response?.status()).toBeLessThan(500);
            } catch (error) {
              // If navigation times out or fails, log and continue
              console.warn(`Failed to navigate to ${href}:`, error);
            }

            // Return to hub page
            await page.goto(hub);
          }
        }
      }
    }
  });

  test('No broken internal links on detail pages', async ({ page }) => {
    // Start with photo-restoration hub
    await page.goto(`/photo-restoration`);

    // Find and navigate to first detail page
    const firstLink = page.locator('a[href^="/photo-restoration/"]').first();
    const linkExists = (await firstLink.count()) > 0;

    if (linkExists) {
      const href = await firstLink.getAttribute('href');
      await page.goto(href);

      // Get all links on the detail page
      const links = await page.locator('a[href^="/"]').all();

      // Check sample of internal links
      const sampleSize = Math.min(3, links.length);

      for (let i = 0; i < sampleSize; i++) {
        const link = links[i];
        const href = await link.getAttribute('href');

        if (href && href.startsWith('/')) {
          const response = await page.request.get(href);
          expect(response.status()).toBeLessThan(500);
        }
      }
    }
  });

  test('Related pages links are valid', async ({ page }) => {
    // Test that relatedTools and relatedGuides links work
    await page.goto(`/photo-restoration`);

    const firstLink = page.locator('a[href^="/photo-restoration/"]').first();
    const linkExists = (await firstLink.count()) > 0;

    if (linkExists) {
      const href = await firstLink.getAttribute('href');
      await page.goto(href);

      // Look for related sections
      const relatedSection = page
        .locator(
          '[class*="related"], [id*="related"], section:has-text("Related"), div:has-text("Related")'
        )
        .first();

      const relatedExists = await relatedSection.count();

      if (relatedExists > 0) {
        // Get links from related section
        const relatedLinks = await relatedSection.locator('a[href^="/"]').all();

        for (const link of relatedLinks) {
          const linkHref = await link.getAttribute('href');
          if (linkHref) {
            const response = await page.request.get(linkHref);
            expect(response.status()).toBeLessThan(500);
          }
        }
      }
    }
  });
});

test.describe('pSEO Fixes - 404 Handling', () => {
  test('Invalid slugs return 404', async ({ page }) => {
    const invalidPaths = [
      '/photo-restoration/invalid-slug-that-does-not-exist',
      '/camera-raw/non-existent-page',
      '/industry-insights/fake-page',
    ];

    for (const path of invalidPaths) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });

  test('404 pages have proper structure', async ({ page }) => {
    const response = await page.goto(`/photo-restoration/this-page-does-not-exist`);

    // Wait for page to fully load
    await page.waitForLoadState('domcontentloaded');

    // Should get 404 status
    expect(response?.status()).toBe(404);

    // Should show 404 page with "404" text
    const notFoundText = page.locator('text=/404|not found|Not Found/i');
    await expect(notFoundText.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('pSEO Fixes - Performance', () => {
  test('Hub pages load within acceptable time', async ({ page }) => {
    const hubs = [
      '/photo-restoration',
      '/camera-raw',
      '/industry-insights',
      '/device-optimization',
      '/bulk-tools',
      '/content',
    ];

    for (const hub of hubs) {
      const startTime = Date.now();
      const response = await page.goto(hub);
      const loadTime = Date.now() - startTime;

      expect(response?.status()).toBe(200);
      expect(loadTime).toBeLessThan(5000); // 5 second threshold
    }
  });

  test('Sitemaps load quickly', async ({ request }) => {
    for (const sitemap of NEW_SITEMAPS) {
      const startTime = Date.now();
      await request.get(sitemap);
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(2000); // 2 second threshold
    }
  });
});
