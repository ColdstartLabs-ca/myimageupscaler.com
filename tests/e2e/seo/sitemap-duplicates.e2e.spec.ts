/**
 * Sitemap Duplicate Detection E2E Tests
 * Verifies that URLs appear in only ONE sitemap
 */

import { test, expect } from '@playwright/test';

test.describe('Sitemap Duplicates', () => {
  test('should not have duplicate URLs across sitemaps', async ({ request }) => {
    // Fetch the sitemap index
    const sitemapIndexResponse = await request.get('https://myimageupscaler.com/sitemap.xml');
    expect(sitemapIndexResponse.ok()).toBe(true);

    const sitemapIndexText = await sitemapIndexResponse.text();

    // Extract all sitemap URLs from the index
    const sitemapUrlMatches = sitemapIndexText.matchAll(
      /<loc>(https:\/\/myimageupscaler\.com\/sitemap-[^<]+\.xml)<\/loc>/g
    );
    const sitemapUrls = Array.from(sitemapUrlMatches).map(match => match[1]);

    expect(sitemapUrls.length).toBeGreaterThan(0);

    // Track all URLs across all sitemaps
    const urlMap = new Map<string, string[]>(); // URL -> list of sitemaps it appears in

    // Fetch each sitemap and collect URLs
    for (const sitemapUrl of sitemapUrls) {
      const sitemapResponse = await request.get(sitemapUrl);
      expect(sitemapResponse.ok()).toBe(true);

      const sitemapText = await sitemapResponse.text();

      // Extract all URLs from this sitemap
      const urlMatches = sitemapText.matchAll(
        /<loc>(https:\/\/myimageupscaler\.com\/[^<]+)<\/loc>/g
      );

      for (const match of urlMatches) {
        const url = match[1];
        if (!urlMap.has(url)) {
          urlMap.set(url, []);
        }
        urlMap.get(url)!.push(sitemapUrl);
      }
    }

    // Find duplicates
    const duplicates: Array<{ url: string; sitemaps: string[] }> = [];

    for (const [url, sitemaps] of urlMap.entries()) {
      // Note: hreflang links (xhtml:link) are not duplicates - they're required for SEO
      // We only check for actual <url> entry duplicates across sitemaps
      const uniqueSitemaps = [...new Set(sitemaps)];
      if (uniqueSitemaps.length > 1) {
        duplicates.push({ url, sitemaps: uniqueSitemaps });
      }
    }

    // Assert no duplicates (excluding hreflang which is intentional)
    expect(duplicates.length).toBe(0);
  });

  test('should not include /blog in sitemap-static.xml', async ({ request }) => {
    const staticSitemapResponse = await request.get(
      'https://myimageupscaler.com/sitemap-static.xml'
    );
    expect(staticSitemapResponse.ok()).toBe(true);

    const staticSitemapText = await staticSitemapResponse.text();

    // Extract all URLs from static sitemap
    const urlMatches = staticSitemapText.matchAll(
      /<loc>(https:\/\/myimageupscaler\.com\/[^<]+)<\/loc>/g
    );
    const urls = Array.from(urlMatches).map(match => match[1]);

    // /blog should NOT be in static sitemap (it has its own sitemap-blog.xml)
    expect(urls).not.toContain('https://myimageupscaler.com/blog');
  });

  test('should not include platform pages in sitemap-images.xml', async ({ request }) => {
    const imagesSitemapResponse = await request.get(
      'https://myimageupscaler.com/sitemap-images.xml'
    );
    expect(imagesSitemapResponse.ok()).toBe(true);

    const imagesSitemapText = await imagesSitemapResponse.text();

    // Extract all URLs from images sitemap
    const urlMatches = imagesSitemapText.matchAll(
      /<loc>(https:\/\/myimageupscaler\.com\/[^<]+)<\/loc>/g
    );
    const urls = Array.from(urlMatches).map(match => match[1]);

    // Platform pages should NOT be in images sitemap (they have their own sitemap-platforms.xml)
    const platformUrls = urls.filter(url => url.includes('/platforms/'));
    expect(platformUrls.length).toBe(0);
  });

  test('should include platform pages only in sitemap-platforms.xml', async ({ request }) => {
    const platformsSitemapResponse = await request.get(
      'https://myimageupscaler.com/sitemap-platforms.xml'
    );
    expect(platformsSitemapResponse.ok()).toBe(true);

    const platformsSitemapText = await platformsSitemapResponse.text();

    // Extract all URLs from platforms sitemap
    const urlMatches = platformsSitemapText.matchAll(
      /<loc>(https:\/\/myimageupscaler\.com\/[^<]+)<\/loc>/g
    );
    const urls = Array.from(urlMatches).map(match => match[1]);

    // Should have platform pages
    const platformUrls = urls.filter(url => url.includes('/platforms/'));
    expect(platformUrls.length).toBeGreaterThan(0);

    // Should include /platforms index page
    expect(urls).toContain('https://myimageupscaler.com/platforms');
  });
});
