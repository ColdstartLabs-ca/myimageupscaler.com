/**
 * SEO Safeguards — CI Gate
 *
 * These tests guard against critical SEO regressions that could cause traffic drops.
 * They run as part of `yarn verify` to block deploys that break SEO invariants.
 *
 * What they guard:
 * 1. Root layout must NOT set a canonical (prevents inheritance pollution)
 * 2. Locale layout must NOT set alternates.canonical (intentionally delegated to pages)
 * 3. Homepage must set its own explicit canonical
 * 4. Metadata factory must generate self-referencing canonicals
 * 5. Robots.txt must allow / and disallow private routes
 * 6. Sitemap index must reference all required child sitemaps
 * 7. Localization config consistency (no duplicates, proper categorization)
 * 8. No global robots.index=false in layouts
 *
 * If any of these tests fail, do NOT deploy. Fix the issue first.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ============================================================================
// A) Structural Guards — Source scanning, no mocking needed
// ============================================================================

describe('SEO Safeguards — Structural', () => {
  const appDir = path.resolve(__dirname, '../../../app');

  describe('Root layout canonical', () => {
    it('must NOT set alternates.canonical to prevent inheritance pollution', () => {
      const layoutPath = path.join(appDir, 'layout.tsx');
      const layoutSource = fs.readFileSync(layoutPath, 'utf-8');

      // Root layout should be a minimal passthrough (no metadata)
      expect(layoutSource).toContain('return children');
      expect(layoutSource).not.toMatch(/alternates\s*:/);
      expect(layoutSource).not.toMatch(/canonical/);
    });
  });

  describe('Locale layout canonical', () => {
    it('must NOT set alternates.canonical (intentionally delegated to pages)', () => {
      const layoutPath = path.join(appDir, '[locale]', 'layout.tsx');
      const layoutSource = fs.readFileSync(layoutPath, 'utf-8');

      // Extract the metadata export block
      const metadataMatch = layoutSource.match(
        /export\s+async\s+function\s+generateMetadata[\s\S]*?^\}/m
      );

      expect(metadataMatch).toBeTruthy();
      const metadataBlock = metadataMatch![0];

      // Must NOT contain alternates.canonical — pages set their own
      expect(metadataBlock).not.toMatch(/alternates\s*:\s*\{[^}]*canonical/);

      // Should have a comment explaining this is intentional
      expect(layoutSource).toMatch(/alternates are NOT set here/);
    });
  });

  describe('Homepage canonical', () => {
    it('must set its own explicit canonical', () => {
      const pagePath = path.join(appDir, '[locale]', 'page.tsx');
      const pageSource = fs.readFileSync(pagePath, 'utf-8');

      // Homepage must have alternates with canonical
      expect(pageSource).toMatch(/alternates\s*:\s*\{[\s\S]*?canonical/);
    });
  });

  describe('Global indexing safety', () => {
    it('root layout metadata must not set robots.index=false', () => {
      const layoutPath = path.join(appDir, '[locale]', 'layout.tsx');
      const layoutSource = fs.readFileSync(layoutPath, 'utf-8');

      const metadataMatch = layoutSource.match(
        /export\s+async\s+function\s+generateMetadata[\s\S]*?^\}/m
      );

      expect(metadataMatch).toBeTruthy();
      const metadataBlock = metadataMatch![0];
      expect(metadataBlock).not.toMatch(/robots\s*:\s*\{[\s\S]*?index\s*:\s*false/);
    });

    it('metadata factory must set robots.index=true by default', () => {
      const factoryPath = path.resolve(__dirname, '../../../lib/seo/metadata-factory.ts');
      const factorySource = fs.readFileSync(factoryPath, 'utf-8');

      // Should have robots: { index: true, follow: true }
      expect(factorySource).toMatch(/robots\s*:\s*\{[\s\S]*?index\s*:\s*true/);
    });
  });

  describe('Robots.txt structure', () => {
    it('robots route must allow / and disallow private routes', () => {
      const robotsPath = path.join(appDir, 'robots.ts');
      const robotsSource = fs.readFileSync(robotsPath, 'utf-8');

      // Should allow root
      expect(robotsSource).toMatch(/allow\s*:\s*['"]\/['"]/);

      // Should disallow private areas
      expect(robotsSource).toMatch(/['"]\/api\/['"]|['"]\/dashboard\/['"]|['"]\/admin\/['"]/);

      // Should reference sitemap
      expect(robotsSource).toMatch(/sitemap/);
    });

    it('robots route must use clientEnv.BASE_URL', () => {
      const robotsPath = path.join(appDir, 'robots.ts');
      const robotsSource = fs.readFileSync(robotsPath, 'utf-8');

      // Should import from @shared/config/env
      expect(robotsSource).toMatch(/from\s+['"]@shared\/config\/env['"]/);
      expect(robotsSource).toMatch(/clientEnv/);
    });
  });

  describe('Sitemap index structure', () => {
    it('sitemap index route must exist', () => {
      const sitemapIndexPath = path.join(appDir, 'sitemap.xml', 'route.ts');
      expect(fs.existsSync(sitemapIndexPath)).toBe(true);
    });

    it('sitemap index must reference static and blog sitemaps', () => {
      const sitemapIndexPath = path.join(appDir, 'sitemap.xml', 'route.ts');
      const source = fs.readFileSync(sitemapIndexPath, 'utf-8');

      // Should have 'static' and 'blog' in ENGLISH_ONLY_SITEMAP_CATEGORIES
      expect(source).toContain("'static'");
      expect(source).toContain("'blog'");
    });

    it('sitemap index must use correct BASE_URL (PRIMARY_DOMAIN)', () => {
      const sitemapIndexPath = path.join(appDir, 'sitemap.xml', 'route.ts');
      const source = fs.readFileSync(sitemapIndexPath, 'utf-8');

      // Should use PRIMARY_DOMAIN from clientEnv
      expect(source).toMatch(/PRIMARY_DOMAIN/);
    });
  });

  describe('Canonical URL consistency', () => {
    it('hreflang generator must use getCanonicalUrl for canonical generation', () => {
      const hreflangPath = path.resolve(__dirname, '../../../lib/seo/hreflang-generator.ts');
      const hreflangSource = fs.readFileSync(hreflangPath, 'utf-8');

      // Should export getCanonicalUrl function
      expect(hreflangSource).toMatch(/export\s+function\s+getCanonicalUrl/);

      // getCanonicalUrl should return BASE_URL for root path with default locale
      expect(hreflangSource).toMatch(/return\s+clientEnv\.BASE_URL/);
    });

    it('metadata factory must use getCanonicalUrl for canonical generation', () => {
      const factoryPath = path.resolve(__dirname, '../../../lib/seo/metadata-factory.ts');
      const factorySource = fs.readFileSync(factoryPath, 'utf-8');

      // Should import getCanonicalUrl
      expect(factorySource).toMatch(/getCanonicalUrl/);

      // Should use getCanonicalUrl for alternates.canonical
      expect(factorySource).toMatch(/canonical\s*:\s*canonicalUrl/);
    });
  });
});

// ============================================================================
// B) Metadata Factory Guards — Unit tests with mocked env
// ============================================================================

// Mock env before importing metadata factory
vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    TWITTER_HANDLE: 'myimageupscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
  },
  serverEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
  },
}));

describe('SEO Safeguards — Metadata Factory', () => {
  let generateMetadata: (page: any, category: any, locale?: string) => any;
  let generateCategoryMetadata: (category: any, locale?: string) => any;

  beforeEach(async () => {
    // Dynamic import so mocks are applied
    const metadataModule = await import('@/lib/seo/metadata-factory');
    generateMetadata = metadataModule.generateMetadata;
    generateCategoryMetadata = metadataModule.generateCategoryMetadata;
  });

  it('must return self-referencing canonical for pSEO page', () => {
    const page = {
      slug: 'ai-image-upscaler',
      title: 'AI Image Upscaler',
      metaTitle: 'AI Image Upscaler | Enhance Quality',
      metaDescription: 'Professional AI image upscaling tool.',
      ogImage: '/og-image.png',
      secondaryKeywords: ['upscaler', 'enhancer'],
    };

    const result = generateMetadata(page, 'tools', 'en');

    expect(result.alternates?.canonical).toBe('https://myimageupscaler.com/tools/ai-image-upscaler');
    expect(result.robots?.index).toBe(true);
    expect(result.robots?.follow).toBe(true);
  });

  it('must return locale-specific canonical for non-English page', () => {
    const page = {
      slug: 'ai-image-upscaler',
      title: 'AI Image Upscaler',
      metaTitle: 'AI Image Upscaler | Enhance Quality',
      metaDescription: 'Professional AI image upscaling tool.',
      ogImage: '/og-image.png',
      secondaryKeywords: ['upscaler', 'enhancer'],
    };

    const result = generateMetadata(page, 'tools', 'es');

    expect(result.alternates?.canonical).toBe('https://myimageupscaler.com/es/tools/ai-image-upscaler');
  });

  it('must include hreflang alternates with x-default', () => {
    const page = {
      slug: 'ai-image-upscaler',
      title: 'AI Image Upscaler',
      metaTitle: 'AI Image Upscaler | Enhance Quality',
      metaDescription: 'Professional AI image upscaling tool.',
      ogImage: '/og-image.png',
      secondaryKeywords: ['upscaler', 'enhancer'],
    };

    const result = generateMetadata(page, 'tools', 'en');

    expect(result.alternates?.languages).toBeDefined();
    expect(result.alternates?.languages['en']).toBeDefined();
    expect(result.alternates?.languages['x-default']).toBeDefined();
  });

  it('must return self-referencing canonical for category page', () => {
    const result = generateCategoryMetadata('tools', 'en');

    expect(result.alternates?.canonical).toBe('https://myimageupscaler.com/tools');
    expect(result.robots?.index).toBe(true);
    expect(result.robots?.follow).toBe(true);
  });

  it('canonical must NEVER equal the homepage URL for category pages', () => {
    const result = generateCategoryMetadata('tools', 'en');

    expect(result.alternates?.canonical).not.toBe('https://myimageupscaler.com');
    expect(result.alternates?.canonical).not.toBe('https://myimageupscaler.com/');
  });

  it('canonical must use https protocol', () => {
    const page = {
      slug: 'test-tool',
      title: 'Test Tool',
      metaTitle: 'Test Tool',
      metaDescription: 'Test description',
      secondaryKeywords: [],
    };

    const result = generateMetadata(page, 'tools', 'en');

    expect(result.alternates?.canonical).toMatch(/^https:\/\//);
  });
});

// ============================================================================
// C) Localization Config Guards — Import checks
// ============================================================================

describe('SEO Safeguards — Localization Config', () => {
  const configPath = path.resolve(__dirname, '../../../lib/seo/localization-config.ts');
  const configSource = fs.readFileSync(configPath, 'utf-8');

  // Extract constants from the file for validation
  const LOCALIZED_CATEGORIES_MATCH = configSource.match(
    /export\s+const\s+LOCALIZED_CATEGORIES.*?=\s*\[([\s\S]*?)\];/
  );
  const ENGLISH_ONLY_CATEGORIES_MATCH = configSource.match(
    /export\s+const\s+ENGLISH_ONLY_CATEGORIES.*?=\s*\[([\s\S]*?)\];/
  );

  it('LOCALIZED_CATEGORIES must have exactly 10 entries', () => {
    expect(LOCALIZED_CATEGORIES_MATCH).toBeTruthy();
    const categories = LOCALIZED_CATEGORIES_MATCH![1];
    // Count the number of array entries (each entry is like 'tools', 'formats', etc.)
    const categoryCount = (categories.match(/'[^']+'/g) || []).length;
    expect(categoryCount).toBe(10);
  });

  it('ENGLISH_ONLY_CATEGORIES must have exactly 13 entries', () => {
    expect(ENGLISH_ONLY_CATEGORIES_MATCH).toBeTruthy();
    const categories = ENGLISH_ONLY_CATEGORIES_MATCH![1];
    // Count the number of array entries
    const categoryCount = (categories.match(/'[^']+'/g) || []).length;
    expect(categoryCount).toBe(13);
  });

  it('ALL_CATEGORIES must be union of LOCALIZED and ENGLISH_ONLY', () => {
    expect(configSource).toMatch(/export\s+const\s+ALL_CATEGORIES.*?LOCALIZED_CATEGORIES.*?ENGLISH_ONLY_CATEGORIES/);
  });

  it('isCategoryLocalized must return true for English locale', () => {
    expect(configSource).toMatch(/if\s+\(locale\s+===\s+['"]en['"]\)\s*\{[\s\S]*?return\s+true/);
  });

  it('LOCALIZATION_STATUS must have all categories defined', () => {
    // Should have LOCALIZATION_STATUS constant with all categories
    expect(configSource).toMatch(/export\s+const\s+LOCALIZATION_STATUS/);

    // Check for some key categories
    expect(configSource).toMatch(/tools\s*:\s*\{/);
    expect(configSource).toMatch(/formats\s*:\s*\{/);
    expect(configSource).toMatch(/compare\s*:\s*\{/);
  });

  it('LOCALIZATION_STATUS entries must have required properties', () => {
    // Should check for localized property and supportedLocales
    expect(configSource).toMatch(/localized\s*:/);
    expect(configSource).toMatch(/supportedLocales\s*:/);
  });
});

// ============================================================================
// D) Hreflang Generator Guards — Import checks
// ============================================================================

describe('SEO Safeguards — Hreflang Generator', () => {
  const hreflangPath = path.resolve(__dirname, '../../../lib/seo/hreflang-generator.ts');
  const hreflangSource = fs.readFileSync(hreflangPath, 'utf-8');

  it('must export getCanonicalUrl function', () => {
    expect(hreflangSource).toMatch(/export\s+function\s+getCanonicalUrl/);
  });

  it('must export generateHreflangAlternates function', () => {
    expect(hreflangSource).toMatch(/export\s+function\s+generateHreflangAlternates/);
  });

  it('getCanonicalUrl must return BASE_URL for root path with default locale', () => {
    expect(hreflangSource).toMatch(/if\s+\(localizedPath\s+===\s+['"]\/['"]|localizedPath\s+===\s+['"]['"]\)[\s\S]*?return\s+clientEnv\.BASE_URL/);
  });

  it('getCanonicalUrl must handle locale prefixes for non-English locales', () => {
    expect(hreflangSource).toMatch(/getLocalizedPath/);
    expect(hreflangSource).toMatch(/BASE_URL.*localizedPath/);
  });

  it('generateHreflangAlternates must include x-default', () => {
    expect(hreflangSource).toMatch(/alternates\[['"]x-default['"]\]/);
  });

  it('x-default must point to English version (BASE_URL)', () => {
    // x-default should be set using clientEnv.BASE_URL
    // Check that alternates['x-default'] exists and BASE_URL is used in the function
    expect(hreflangSource).toContain("alternates['x-default']");
    expect(hreflangSource).toMatch(/clientEnv\.BASE_URL/);
  });
});

// ============================================================================
// E) Environment Variable Safety
// ============================================================================

describe('SEO Safeguards — Environment Variables', () => {
  const envPath = path.resolve(__dirname, '../../../shared/config/env.ts');
  const envSource = fs.readFileSync(envPath, 'utf-8');

  it('clientEnv must have BASE_URL', () => {
    expect(envSource).toMatch(/BASE_URL/);
  });

  it('clientEnv must have PRIMARY_DOMAIN', () => {
    expect(envSource).toMatch(/PRIMARY_DOMAIN/);
  });

  it('clientEnv must have APP_NAME', () => {
    expect(envSource).toMatch(/APP_NAME/);
  });

  it('clientEnv.BASE_URL should use https protocol', () => {
    // Check that BASE_URL is defined with https
    expect(envSource).toMatch(/https:\/\//);
  });
});

// ============================================================================
// F) Page Metadata Guards — Check pSEO pages set proper metadata
// ============================================================================

describe('SEO Safeguards — Page Metadata', () => {
  const appDir = path.resolve(__dirname, '../../../app');

  it('homepage must use getCanonicalUrl for canonical', () => {
    const pagePath = path.join(appDir, '[locale]', 'page.tsx');
    const pageSource = fs.readFileSync(pagePath, 'utf-8');

    expect(pageSource).toMatch(/getCanonicalUrl/);
    expect(pageSource).toMatch(/canonical\s*:\s*canonicalUrl/);
  });

  it('homepage must use generateHreflangAlternates for languages', () => {
    const pagePath = path.join(appDir, '[locale]', 'page.tsx');
    const pageSource = fs.readFileSync(pagePath, 'utf-8');

    expect(pageSource).toMatch(/generateHreflangAlternates/);
    expect(pageSource).toMatch(/languages\s*:\s*hreflangAlternates/);
  });

  it('pSEO tool page must use SeoMetaTags component', () => {
    const pagePath = path.join(appDir, '[locale]', '(pseo)', 'tools', '[slug]', 'page.tsx');
    const pageSource = fs.readFileSync(pagePath, 'utf-8');

    expect(pageSource).toMatch(/SeoMetaTags/);
  });

  it('pSEO tool page must use HreflangLinks component', () => {
    const pagePath = path.join(appDir, '[locale]', '(pseo)', 'tools', '[slug]', 'page.tsx');
    const pageSource = fs.readFileSync(pagePath, 'utf-8');

    expect(pageSource).toMatch(/HreflangLinks/);
  });
});

// ============================================================================
// G) Schema Markup Guards
// ============================================================================

describe('SEO Safeguards — Schema Markup', () => {
  const schemaPath = path.resolve(__dirname, '../../../lib/seo/schema-generator.ts');
  const schemaSource = fs.readFileSync(schemaPath, 'utf-8');

  it('must export generateHomepageSchema function', () => {
    expect(schemaSource).toMatch(/export\s+(async\s+)?function\s+generateHomepageSchema/);
  });

  it('must export generateToolSchema function', () => {
    expect(schemaSource).toMatch(/export\s+(async\s+)?function\s+generateToolSchema/);
  });

  it('homepage schema must include WebSite type', () => {
    expect(schemaSource).toMatch(/WebSite/);
  });

  it('tool schema must include SoftwareApplication type', () => {
    expect(schemaSource).toMatch(/SoftwareApplication/);
  });

  it('schema must include inLanguage property for localization', () => {
    expect(schemaSource).toMatch(/inLanguage/);
  });
});
