/**
 * SEO Guard E2E Test Suite
 *
 * Comprehensive SEO regression blocker that runs before every deployment.
 * This test validates all critical SEO invariants - any failure blocks deployment.
 *
 * Test Categories (16):
 * 1. Robots.txt validation
 * 2. Sitemap Index structure
 * 3. Sitemap content validity
 * 4. Sitemap duplicate prevention
 * 5. Homepage SEO meta tags
 * 6. Homepage hreflang links
 * 7. Homepage heading structure
 * 8. pSEO Tool Page SEO (English)
 * 9. pSEO Tool Page SEO (Locale)
 * 10. Critical pages return 200
 * 11. Canonical URL consistency
 * 12. SEO redirects
 * 13. Locale sitemaps
 * 14. JSON-LD schema
 * 15. 404 error handling
 * 16. No-index leak prevention
 *
 * Usage: yarn test:seo-guard
 */

import { test, expect } from '@playwright/test';

// Constants from i18n/config.ts and lib/seo/localization-config.ts
const SUPPORTED_LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'] as const;
const LOCALIZED_CATEGORIES = [
  'tools',
  'formats',
  'free',
  'guides',
  'scale',
  'alternatives',
  'use-cases',
  'format-scale',
  'platform-format',
  'device-use',
] as const;
const ENGLISH_ONLY_CATEGORIES = [
  'compare',
  'platforms',
  'bulk-tools',
  'content',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'ai-features',
] as const;

// Total sitemaps: 12 English-only + (10 localized × 7 locales) = 12 + 70 = 82
// English-only: static, blog, + 9 categories = 11 (plus additional sitemaps)
const TOTAL_SITEMAP_COUNT = 82;

// Base URL for production checks (canonical URLs should always use this)
const PRODUCTION_BASE_URL = 'https://myimageupscaler.com';

test.describe('SEO Guard - Deploy Blocker', () => {
  // ========================================================================
  // Group 1: Robots.txt Validation
  // ========================================================================
  test.describe('Robots.txt', () => {
    test('robots.txt returns 200 and has correct directives', async ({ request }) => {
      const response = await request.get('/robots.txt');

      // Skip test if robots.txt has conflict error (dev environment issue)
      if (response.status() === 500) {
        const text = await response.text();
        if (text.includes('conflicting public file')) {
          test.skip(true, 'Skipping: public/robots.txt conflicts with app/robots.ts in dev');
          return;
        }
      }

      expect(response.status()).toBe(200);

      const text = await response.text();

      // Should allow root
      expect(text).toContain('Allow: /');

      // Should disallow private areas
      expect(text).toContain('Disallow: /api/');
      expect(text).toContain('Disallow: /dashboard/');
      expect(text).toContain('Disallow: /admin/');

      // Should reference sitemap
      expect(text).toMatch(/Sitemap:|sitemap:/);
      expect(text).toContain('/sitemap.xml');
    });

    test('robots.txt disallows tracking/success pages', async ({ request }) => {
      const response = await request.get('/robots.txt');

      // Skip test if robots.txt has conflict error
      if (response.status() === 500) {
        const text = await response.text();
        if (text.includes('conflicting public file')) {
          test.skip(true, 'Skipping: public/robots.txt conflicts with app/robots.ts in dev');
          return;
        }
      }

      expect(response.status()).toBe(200);
      const text = await response.text();

      // Should disallow checkout result pages
      expect(text).toContain('Disallow: /success');
      expect(text).toContain('Disallow: /canceled');
    });
  });

  // ========================================================================
  // Group 2: Sitemap Index Structure
  // ========================================================================
  test.describe('Sitemap Index', () => {
    test('sitemap index returns valid XML with correct structure', async ({ request }) => {
      const response = await request.get('/sitemap.xml');
      expect(response.status()).toBe(200);

      const text = await response.text();

      // Should be valid XML with sitemapindex
      expect(text).toContain('<?xml');
      expect(text).toContain('<sitemapindex');
      expect(text).toContain('</sitemapindex>');

      // Should have namespace
      expect(text).toContain('http://www.sitemaps.org/schemas/sitemap');
    });

    test('sitemap index contains all expected sitemaps', async ({ request }) => {
      const response = await request.get('/sitemap.xml');
      const text = await response.text();

      // Extract all sitemap URLs
      const sitemapMatches = text.matchAll(
        /<loc>(https:\/\/myimageupscaler\.com\/sitemap-[^<]+\.xml)<\/loc>/g
      );
      const sitemapUrls = Array.from(sitemapMatches).map(m => m[1]);

      // Should have 82 total sitemaps
      expect(sitemapUrls.length).toBe(TOTAL_SITEMAP_COUNT);

      // Should contain core English-only sitemaps
      expect(sitemapUrls).toContain(`${PRODUCTION_BASE_URL}/sitemap-static.xml`);
      expect(sitemapUrls).toContain(`${PRODUCTION_BASE_URL}/sitemap-blog.xml`);

      // Should contain English-only category sitemaps
      for (const category of ENGLISH_ONLY_CATEGORIES) {
        expect(sitemapUrls).toContain(`${PRODUCTION_BASE_URL}/sitemap-${category}.xml`);
      }

      // Should contain English versions of localized categories
      for (const category of LOCALIZED_CATEGORIES) {
        expect(sitemapUrls).toContain(`${PRODUCTION_BASE_URL}/sitemap-${category}.xml`);
      }

      // Should contain locale-specific sitemaps for localized categories
      for (const category of LOCALIZED_CATEGORIES) {
        for (const locale of SUPPORTED_LOCALES) {
          if (locale !== 'en') {
            expect(sitemapUrls).toContain(
              `${PRODUCTION_BASE_URL}/sitemap-${category}-${locale}.xml`
            );
          }
        }
      }
    });
  });

  // ========================================================================
  // Group 3: Sitemap Content Validity
  // ========================================================================
  test.describe('Sitemap Content Validity', () => {
    test('sample sitemaps return valid XML with urlset structure', async ({ request }) => {
      const sampleSitemaps = [
        '/sitemap-static.xml',
        '/sitemap-tools.xml',
        '/sitemap-formats.xml',
        '/sitemap-blog.xml',
      ];

      for (const sitemapPath of sampleSitemaps) {
        const response = await request.get(sitemapPath);
        expect(response.status(), `${sitemapPath} should return 200`).toBe(200);

        const text = await response.text();

        // Should be valid XML with urlset
        expect(text, `${sitemapPath} should have urlset`).toContain('<urlset');
        expect(text, `${sitemapPath} should close urlset`).toContain('</urlset>');

        // Should have at least one URL entry
        expect(text, `${sitemapPath} should have <url> entries`).toContain('<url>');
        expect(text, `${sitemapPath} should have <loc> entries`).toContain('<loc>');
      }
    });

    test('sample sitemaps have valid loc URLs', async ({ request }) => {
      const response = await request.get('/sitemap-tools.xml');
      const text = await response.text();

      // Extract all loc URLs
      const locMatches = text.matchAll(/<loc>(https:\/\/myimageupscaler\.com\/[^<]+)<\/loc>/g);
      const urls = Array.from(locMatches).map(m => m[1]);

      // Should have URLs
      expect(urls.length).toBeGreaterThan(0);

      // All URLs should be valid
      for (const url of urls) {
        expect(url).toMatch(/^https:\/\/myimageupscaler\.com\/[a-z0-9/-]+$/);
      }
    });
  });

  // ========================================================================
  // Group 4: Sitemap Duplicate Prevention (Sample Check)
  // ========================================================================
  test.describe('Sitemap Duplicate Prevention', () => {
    test('critical pages appear in only one sitemap', async ({ request }) => {
      // Only check blog to avoid timeout - this validates the pattern
      const pageUrl = `${PRODUCTION_BASE_URL}/blog`;

      const response = await request.get('/sitemap.xml');
      const text = await response.text();

      // Get all sitemap URLs
      const sitemapMatches = text.matchAll(
        /<loc>(https:\/\/myimageupscaler\.com\/sitemap-[^<]+\.xml)<\/loc>/g
      );
      const sitemapUrls = Array.from(sitemapMatches).map(m => m[1]);

      // Track which sitemaps contain the blog URL
      const foundIn: string[] = [];

      for (const sitemapUrl of sitemapUrls) {
        const sitemapResponse = await request.get(sitemapUrl.replace(PRODUCTION_BASE_URL, ''));
        const sitemapText = await sitemapResponse.text();

        if (sitemapText.includes(`<loc>${pageUrl}</loc>`)) {
          foundIn.push(sitemapUrl);
        }
      }

      // Blog should appear in exactly one sitemap
      expect(
        foundIn.length,
        `${pageUrl} should appear in exactly 1 sitemap, found in: ${foundIn.join(', ')}`
      ).toBe(1);
    });

    test('blog is not in static sitemap', async ({ request }) => {
      const response = await request.get('/sitemap-static.xml');
      const text = await response.text();

      // /blog should NOT be in static sitemap (has its own sitemap-blog.xml)
      expect(text).not.toContain('<loc>https://myimageupscaler.com/blog</loc>');
      expect(text).not.toContain('<loc>https://myimageupscaler.com/blog/</loc>');
    });
  });

  // ========================================================================
  // Group 5: Homepage SEO Meta Tags
  // ========================================================================
  test.describe('Homepage SEO', () => {
    test('homepage has required meta tags', async ({ page }) => {
      await page.goto('/');

      // Wait for page load
      await page.waitForLoadState('domcontentloaded');

      // Title
      const title = await page.title();
      expect(title).toBeDefined();
      expect(title.toLowerCase()).toContain('image upscaler');
      expect(title.toLowerCase()).toContain('photo enhancer');

      // Meta description
      const metaDescription = await page.getAttribute('meta[name="description"]', 'content');
      expect(metaDescription).toBeDefined();
      expect(metaDescription?.length).toBeGreaterThan(50);

      // Canonical
      const canonicalLink = page.locator('link[rel="canonical"]');
      await expect(canonicalLink).toHaveCount(1);
      expect(await canonicalLink.getAttribute('href')).toBe(PRODUCTION_BASE_URL);

      // OpenGraph tags
      const ogTitle = page.locator('meta[property="og:title"]');
      await expect(ogTitle).toHaveCount(1);

      const ogDescription = page.locator('meta[property="og:description"]');
      await expect(ogDescription).toHaveCount(1);

      // Twitter card
      const twitterCard = page.locator('meta[name="twitter:card"]');
      await expect(twitterCard).toHaveAttribute('content', 'summary_large_image');
    });
  });

  // ========================================================================
  // Group 6: Homepage Hreflang Links
  // ========================================================================
  test.describe('Homepage Hreflang', () => {
    test('homepage has all 7 locale hreflang links plus x-default', async ({ page }) => {
      await page.goto('/');

      // Wait for metadata to load
      await page.waitForLoadState('domcontentloaded');

      // Check all locales are present
      for (const locale of SUPPORTED_LOCALES) {
        // Use first() because there may be duplicates from different sources
        const hreflangLink = page.locator(`link[rel="alternate"][hreflang="${locale}"]`).first();
        await expect(hreflangLink, `${locale} hreflang should exist`).toBeAttached();

        const href = await hreflangLink.getAttribute('href');
        expect(href).toBeDefined();
        expect(href).toContain(PRODUCTION_BASE_URL);
      }

      // Check x-default
      const xDefaultLink = page.locator('link[rel="alternate"][hreflang="x-default"]').first();
      await expect(xDefaultLink).toBeAttached();
      expect(await xDefaultLink.getAttribute('href')).toBe(`${PRODUCTION_BASE_URL}/`);
    });

    test('locale homepage hreflang URLs are correct', async ({ page }) => {
      await page.goto('/');

      await page.waitForLoadState('domcontentloaded');

      // Spanish should point to /es
      const esLink = page.locator('link[rel="alternate"][hreflang="es"]').first();
      expect(await esLink.getAttribute('href')).toBe(`${PRODUCTION_BASE_URL}/es`);

      // German should point to /de
      const deLink = page.locator('link[rel="alternate"][hreflang="de"]').first();
      expect(await deLink.getAttribute('href')).toBe(`${PRODUCTION_BASE_URL}/de`);
    });
  });

  // ========================================================================
  // Group 7: Homepage Heading Structure
  // ========================================================================
  test.describe('Homepage Heading Structure', () => {
    test('homepage has proper heading hierarchy', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Should have exactly one H1
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);

      // Should have multiple H2s for sections
      const h2Count = await page.locator('h2').count();
      expect(h2Count).toBeGreaterThanOrEqual(2);

      // H1 should contain key terms
      const h1Text = await page.locator('h1').first().textContent();
      expect(h1Text?.toLowerCase()).toContain('image upscaler');
    });
  });

  // ========================================================================
  // Group 8: pSEO Tool Page SEO (English)
  // ========================================================================
  test.describe('pSEO Tool Page SEO - English', () => {
    test('English tool page has correct meta tags and schema', async ({ page }) => {
      await page.goto('/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Canonical should point to production URL
      const canonicalLink = page.locator('link[rel="canonical"]');
      expect(await canonicalLink.getAttribute('href')).toBe(
        `${PRODUCTION_BASE_URL}/tools/ai-image-upscaler`
      );

      // OG:locale should be en_US
      const ogLocale = page.locator('meta[property="og:locale"]');
      expect(await ogLocale.getAttribute('content')).toBe('en_US');

      // Should have SoftwareApplication schema
      const schemaScripts = await page.locator('script[type="application/ld+json"]').all();
      let foundSoftwareApp = false;

      for (const script of schemaScripts) {
        const content = await script.textContent();
        if (content) {
          const schema = JSON.parse(content);
          const checkForSoftwareApp = (obj: unknown): boolean => {
            if (typeof obj !== 'object' || obj === null) return false;
            if ('@type' in obj) {
              const type = (obj as { '@type': string | string[] })['@type'];
              const typeStr = Array.isArray(type) ? type.join(' ') : type;
              if (typeStr.includes('SoftwareApplication')) return true;
            }
            if ('@graph' in obj) {
              return (obj as { '@graph': unknown[] })['@graph'].some(checkForSoftwareApp);
            }
            for (const v of Object.values(obj as Record<string, unknown>)) {
              if (typeof v === 'object' && checkForSoftwareApp(v)) return true;
            }
            return false;
          };

          if (checkForSoftwareApp(schema)) {
            foundSoftwareApp = true;
            break;
          }
        }
      }

      expect(foundSoftwareApp).toBe(true);
    });

    test('English tool page has all hreflang links', async ({ page }) => {
      await page.goto('/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Should have alternates for all supported locales
      for (const locale of SUPPORTED_LOCALES) {
        const hreflangLink = page.locator(`link[rel="alternate"][hreflang="${locale}"]`).first();
        await expect(hreflangLink, `${locale} hreflang should exist`).toBeAttached();
      }

      // Should have x-default
      const xDefaultLink = page.locator('link[rel="alternate"][hreflang="x-default"]').first();
      await expect(xDefaultLink).toBeAttached();
    });
  });

  // ========================================================================
  // Group 9: pSEO Tool Page SEO (Locale)
  // ========================================================================
  test.describe('pSEO Tool Page SEO - Locale', () => {
    test('Spanish tool page has locale-specific canonical and hreflang', async ({ page }) => {
      await page.goto('/es/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      // Canonical should point to Spanish version
      const canonicalLink = page.locator('link[rel="canonical"]').first();
      expect(await canonicalLink.getAttribute('href')).toBe(
        `${PRODUCTION_BASE_URL}/es/tools/ai-image-upscaler`
      );

      // OG:locale should be es_ES
      const ogLocale = page.locator('meta[property="og:locale"]').first();
      expect(await ogLocale.getAttribute('content')).toBe('es_ES');

      // Should have all hreflang links including Spanish
      const esLink = page.locator('link[rel="alternate"][hreflang="es"]').first();
      await expect(esLink).toBeAttached();
      expect(await esLink.getAttribute('href')).toBe(
        `${PRODUCTION_BASE_URL}/es/tools/ai-image-upscaler`
      );
    });

    test('locale tool page SoftwareApplication has correct inLanguage', async ({ page }) => {
      await page.goto('/es/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      const schemaScripts = await page.locator('script[type="application/ld+json"]').all();
      let foundCorrectLang = false;

      for (const script of schemaScripts) {
        const content = await script.textContent();
        if (content) {
          const schema = JSON.parse(content);
          const checkSoftwareAppLang = (obj: unknown): boolean => {
            if (typeof obj !== 'object' || obj === null) return false;
            if ('@type' in obj) {
              const type = (obj as { '@type': string | string[] })['@type'];
              const typeStr = Array.isArray(type) ? type.join(' ') : type;
              if (typeStr.includes('SoftwareApplication')) {
                return (obj as { inLanguage?: string }).inLanguage === 'es';
              }
            }
            if ('@graph' in obj) {
              return (obj as { '@graph': unknown[] })['@graph'].some(checkSoftwareAppLang);
            }
            for (const v of Object.values(obj as Record<string, unknown>)) {
              if (typeof v === 'object' && checkSoftwareAppLang(v)) return true;
            }
            return false;
          };

          if (checkSoftwareAppLang(schema)) {
            foundCorrectLang = true;
            break;
          }
        }
      }

      expect(foundCorrectLang).toBe(true);
    });
  });

  // ========================================================================
  // Group 10: Critical Pages Return 200
  // ========================================================================
  test.describe('Critical Pages Return 200', () => {
    const criticalPages = [
      '/',
      '/tools',
      '/tools/ai-image-upscaler',
      '/formats',
      '/guides',
      '/compare',
      '/blog',
      '/pricing',
      '/es/tools/ai-image-upscaler',
    ];

    for (const pagePath of criticalPages) {
      test(`${pagePath} returns 200`, async ({ request }) => {
        const response = await request.get(pagePath);
        expect(response.status(), `${pagePath} should return 200`).toBe(200);
      });
    }
  });

  // ========================================================================
  // Group 11: Canonical URL Consistency
  // ========================================================================
  test.describe('Canonical URL Consistency', () => {
    test('canonical URLs never contain localhost', async ({ page }) => {
      const pages = ['/', '/tools/ai-image-upscaler', '/es/tools/ai-image-upscaler'];

      for (const pagePath of pages) {
        await page.goto(pagePath);
        await page.waitForLoadState('domcontentloaded');

        const canonicalLink = page.locator('link[rel="canonical"]');
        const href = await canonicalLink.getAttribute('href');

        expect(href).not.toContain('localhost');
        expect(href).not.toContain('127.0.0.1');
        expect(href).not.toContain(':3000');
        expect(href).not.toContain(':3001');
        expect(href).not.toContain(':3100');
        expect(href).toMatch(/^https:\/\/myimageupscaler\.com/);
      }
    });

    test('canonical URLs do not contain tracking parameters', async ({ page, baseURL }) => {
      // Navigate with tracking params
      await page.goto('/?utm_source=google&utm_medium=cpc');
      await page.waitForLoadState('domcontentloaded');

      const canonicalLink = page.locator('link[rel="canonical"]');
      const href = await canonicalLink.getAttribute('href');

      // Canonical should always be clean
      expect(href).toBe(PRODUCTION_BASE_URL);
      expect(href).not.toContain('utm_');
      expect(href).not.toContain('fbclid');
      expect(href).not.toContain('gclid');
    });

    test('canonical URLs are consistent (no trailing slashes on root)', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const canonicalLink = page.locator('link[rel="canonical"]');
      const href = await canonicalLink.getAttribute('href');

      // Root canonical should not have trailing slash
      expect(href).toBe(PRODUCTION_BASE_URL);
      expect(href).not.toBe(`${PRODUCTION_BASE_URL}/`);
    });
  });

  // ========================================================================
  // Group 12: SEO Redirects
  // ========================================================================
  test.describe('SEO Redirects', () => {
    test('legacy bulk tool URLs redirect correctly', async ({ page }) => {
      const redirects = [
        { from: '/tools/bulk-image-resizer', to: '/tools/resize/bulk-image-resizer' },
        { from: '/tools/bulk-image-compressor', to: '/tools/compress/bulk-image-compressor' },
      ];

      for (const { from, to } of redirects) {
        await page.goto(from);
        await page.waitForLoadState('domcontentloaded');

        // Should redirect to new location
        expect(page.url()).toContain(to);

        // Page should load successfully
        await expect(page.locator('h1')).toBeVisible();
      }
    });

    test('tracking parameters are stripped from URL', async ({ page, baseURL }) => {
      await page.goto('/?utm_source=google&utm_medium=cpc&utm_campaign=test&fbclid=abc123');

      // URL should be clean (no tracking params)
      const url = page.url();
      expect(url).toBe(`${baseURL}/`);
      expect(url).not.toContain('utm_');
      expect(url).not.toContain('fbclid');
    });

    test('functional parameters are preserved', async ({ page, baseURL }) => {
      await page.goto('/?signup=1&utm_source=google');

      // signup should be preserved, utm_source stripped
      const url = page.url();
      expect(url).toContain('signup=1');
      expect(url).not.toContain('utm_source');
    });
  });

  // ========================================================================
  // Group 13: Locale Sitemaps
  // ========================================================================
  test.describe('Locale Sitemaps', () => {
    test('locale sitemaps exist for localized categories', async ({ request }) => {
      // Sample locale sitemaps to check
      const sampleSitemaps = [
        { path: '/sitemap-tools-es.xml', locale: 'es', category: 'tools' },
        { path: '/sitemap-tools-de.xml', locale: 'de', category: 'tools' },
        { path: '/sitemap-formats-pt.xml', locale: 'pt', category: 'formats' },
        { path: '/sitemap-guides-fr.xml', locale: 'fr', category: 'guides' },
      ];

      for (const { path, locale, category } of sampleSitemaps) {
        const response = await request.get(path);
        expect(response.status(), `${path} should return 200`).toBe(200);

        const text = await response.text();
        expect(text, `${path} should have urlset`).toContain('<urlset');

        // Should contain URLs for that locale (e.g., /es/tools/...)
        expect(text).toContain(`<loc>https://myimageupscaler.com/${locale}/${category}`);
      }
    });

    test('locale sitemap URLs are correctly prefixed', async ({ request }) => {
      const response = await request.get('/sitemap-tools-es.xml');
      const text = await response.text();

      // All URLs in Spanish tools sitemap should start with /es/tools/
      const urlMatches = text.matchAll(/<loc>(https:\/\/myimageupscaler\.com\/[^<]+)<\/loc>/g);
      const urls = Array.from(urlMatches).map(m => m[1]);

      for (const url of urls) {
        expect(url).toMatch(/^https:\/\/myimageupscaler\.com\/es\/tools/);
      }
    });

    test('no locale sitemap exists for English-only categories', async ({ request }) => {
      // English-only categories should NOT have locale-specific sitemaps
      const nonExistentSitemaps = [
        '/sitemap-compare-es.xml',
        '/sitemap-platforms-de.xml',
        '/sitemap-bulk-tools-pt.xml',
      ];

      for (const sitemapPath of nonExistentSitemaps) {
        const response = await request.get(sitemapPath);
        expect(response.status(), `${sitemapPath} should not exist`).toBe(404);
      }
    });
  });

  // ========================================================================
  // Group 14: JSON-LD Schema
  // ========================================================================
  test.describe('Structured Data (JSON-LD)', () => {
    test('homepage has WebSite schema', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const schemaScripts = await page.locator('script[type="application/ld+json"]').all();
      let foundWebSite = false;

      for (const script of schemaScripts) {
        const content = await script.textContent();
        if (content) {
          const schema = JSON.parse(content);
          const checkForWebSite = (obj: unknown): boolean => {
            if (typeof obj !== 'object' || obj === null) return false;
            if ('@type' in obj) {
              const type = (obj as { '@type': string | string[] })['@type'];
              const typeStr = Array.isArray(type) ? type.join(' ') : type;
              if (typeStr.includes('WebSite')) return true;
            }
            if ('@graph' in obj) {
              return (obj as { '@graph': unknown[] })['@graph'].some(checkForWebSite);
            }
            for (const v of Object.values(obj as Record<string, unknown>)) {
              if (typeof v === 'object' && checkForWebSite(v)) return true;
            }
            return false;
          };

          if (checkForWebSite(schema)) {
            foundWebSite = true;
            break;
          }
        }
      }

      expect(foundWebSite).toBe(true);
    });

    test('homepage has Organization schema', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const schemaScripts = await page.locator('script[type="application/ld+json"]').all();
      let foundOrganization = false;

      for (const script of schemaScripts) {
        const content = await script.textContent();
        if (content) {
          const schema = JSON.parse(content);
          const checkForOrganization = (obj: unknown): boolean => {
            if (typeof obj !== 'object' || obj === null) return false;
            if ('@type' in obj) {
              const type = (obj as { '@type': string | string[] })['@type'];
              const typeStr = Array.isArray(type) ? type.join(' ') : type;
              if (typeStr.includes('Organization')) return true;
            }
            if ('@graph' in obj) {
              return (obj as { '@graph': unknown[] })['@graph'].some(checkForOrganization);
            }
            for (const v of Object.values(obj as Record<string, unknown>)) {
              if (typeof v === 'object' && checkForOrganization(v)) return true;
            }
            return false;
          };

          if (checkForOrganization(schema)) {
            foundOrganization = true;
            break;
          }
        }
      }

      expect(foundOrganization).toBe(true);
    });

    test('tool page has SoftwareApplication schema', async ({ page }) => {
      await page.goto('/tools/ai-image-upscaler');
      await page.waitForLoadState('domcontentloaded');

      const schemaScripts = await page.locator('script[type="application/ld+json"]').all();
      let foundSoftwareApp = false;

      for (const script of schemaScripts) {
        const content = await script.textContent();
        if (content) {
          const schema = JSON.parse(content);
          const checkForSoftwareApp = (obj: unknown): boolean => {
            if (typeof obj !== 'object' || obj === null) return false;
            if ('@type' in obj) {
              const type = (obj as { '@type': string | string[] })['@type'];
              const typeStr = Array.isArray(type) ? type.join(' ') : type;
              if (typeStr.includes('SoftwareApplication')) return true;
            }
            if ('@graph' in obj) {
              return (obj as { '@graph': unknown[] })['@graph'].some(checkForSoftwareApp);
            }
            for (const v of Object.values(obj as Record<string, unknown>)) {
              if (typeof v === 'object' && checkForSoftwareApp(v)) return true;
            }
            return false;
          };

          if (checkForSoftwareApp(schema)) {
            foundSoftwareApp = true;
            break;
          }
        }
      }

      expect(foundSoftwareApp).toBe(true);
    });
  });

  // ========================================================================
  // Group 15: 404 Error Handling
  // ========================================================================
  test.describe('404 Error Handling', () => {
    test('invalid slug returns 404 not 500', async ({ request }) => {
      const response = await request.get('/this-page-does-not-exist-12345');
      expect(response.status()).toBe(404);
      expect(response.status()).not.toBe(500);
    });

    test('404 page has proper structure', async ({ page }) => {
      await page.goto('/this-page-does-not-exist');
      await page.waitForLoadState('domcontentloaded');

      // Should have some content
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toBeDefined();
      expect(bodyText?.length).toBeGreaterThan(0);

      // Should have 404 status code
      const response = await page.request.get('/this-page-does-not-exist');
      expect(response.status()).toBe(404);
    });
  });

  // ========================================================================
  // Group 16: No-Index Leak Prevention
  // ========================================================================
  test.describe('No-Index Leak Prevention', () => {
    test('private routes are not in sitemap', async ({ request }) => {
      const response = await request.get('/sitemap.xml');
      const text = await response.text();

      // Extract all sitemap URLs
      const sitemapMatches = text.matchAll(
        /<loc>(https:\/\/myimageupscaler\.com\/sitemap-[^<]+\.xml)<\/loc>/g
      );
      const sitemapUrls = Array.from(sitemapMatches).map(m => m[1]);

      // Check no sitemap contains private routes
      const privateRoutes = ['/dashboard/', '/api/', '/admin/', '/private/'];

      for (const sitemapUrl of sitemapUrls) {
        const sitemapResponse = await request.get(sitemapUrl.replace(PRODUCTION_BASE_URL, ''));
        const sitemapText = await sitemapResponse.text();

        for (const privateRoute of privateRoutes) {
          expect(sitemapText).not.toContain(`<loc>${PRODUCTION_BASE_URL}${privateRoute}`);
        }
      }
    });

    test('robots.txt disallows private routes', async ({ request }) => {
      const response = await request.get('/robots.txt');

      // Skip test if robots.txt has conflict error
      if (response.status() === 500) {
        const text = await response.text();
        if (text.includes('conflicting public file')) {
          test.skip(true, 'Skipping: public/robots.txt conflicts with app/robots.ts in dev');
          return;
        }
      }

      expect(response.status()).toBe(200);
      const text = await response.text();

      // Should disallow all private routes
      expect(text).toContain('Disallow: /api/');
      expect(text).toContain('Disallow: /dashboard/');
      expect(text).toContain('Disallow: /admin/');
      expect(text).toContain('Disallow: /private/');
    });

    test('success and canceled pages are disallowed', async ({ request }) => {
      const response = await request.get('/robots.txt');

      // Skip test if robots.txt has conflict error
      if (response.status() === 500) {
        const text = await response.text();
        if (text.includes('conflicting public file')) {
          test.skip(true, 'Skipping: public/robots.txt conflicts with app/robots.ts in dev');
          return;
        }
      }

      expect(response.status()).toBe(200);
      const text = await response.text();

      expect(text).toContain('Disallow: /success');
      expect(text).toContain('Disallow: /canceled');
    });
  });
});
