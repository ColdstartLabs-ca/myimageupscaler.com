/**
 * Locale Homepage Meta Tests
 *
 * Tests for locale-specific homepage metadata generation.
 * Verifies that each locale uses appropriate meta titles and descriptions
 * targeting relevant keywords for that market.
 *
 * Phase 3: French Homepage Meta Optimization
 * - French targets "enhance quality", "quality enhancer", "ai image quality enhancer free"
 * - German targets "Bild vergrößern", "Bildqualität verbessern", "KI Bildauflösung erhöhen"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ============================================================================
// A) Locale Files Structure — Verify meta.homepage keys exist
// ============================================================================

describe('Locale Homepage Meta — File Structure', () => {
  const localesDir = path.resolve(__dirname, '../../../locales');

  describe('French locale meta', () => {
    it('must have meta.homepage.title in locales/fr/common.json', () => {
      const frCommonPath = path.join(localesDir, 'fr', 'common.json');
      const frCommon = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));

      expect(frCommon.meta).toBeDefined();
      expect(frCommon.meta.homepage).toBeDefined();
      expect(frCommon.meta.homepage.title).toBeDefined();
      expect(typeof frCommon.meta.homepage.title).toBe('string');
    });

    it('must have meta.homepage.description in locales/fr/common.json', () => {
      const frCommonPath = path.join(localesDir, 'fr', 'common.json');
      const frCommon = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));

      expect(frCommon.meta.homepage.description).toBeDefined();
      expect(typeof frCommon.meta.homepage.description).toBe('string');
    });

    it('French title must target "quality enhancer" keywords', () => {
      const frCommonPath = path.join(localesDir, 'fr', 'common.json');
      const frCommon = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));
      const title = frCommon.meta.homepage.title.toLowerCase();

      // Should contain quality enhancer related terms
      // Note: French title uses English keywords to target French users searching in English
      expect(title).toMatch(/quality/);
      expect(title).toMatch(/enhance|enhancer/);
    });

    it('French description must target relevant keywords', () => {
      const frCommonPath = path.join(localesDir, 'fr', 'common.json');
      const frCommon = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));
      const description = frCommon.meta.homepage.description.toLowerCase();

      // Should contain relevant keywords
      expect(description).toMatch(/quality/);
      expect(description.length).toBeGreaterThan(50);
    });
  });

  describe('German locale meta', () => {
    it('must have meta.homepage.title in locales/de/common.json', () => {
      const deCommonPath = path.join(localesDir, 'de', 'common.json');
      const deCommon = JSON.parse(fs.readFileSync(deCommonPath, 'utf-8'));

      expect(deCommon.meta).toBeDefined();
      expect(deCommon.meta.homepage).toBeDefined();
      expect(deCommon.meta.homepage.title).toBeDefined();
      expect(typeof deCommon.meta.homepage.title).toBe('string');
    });

    it('must have meta.homepage.description in locales/de/common.json', () => {
      const deCommonPath = path.join(localesDir, 'de', 'common.json');
      const deCommon = JSON.parse(fs.readFileSync(deCommonPath, 'utf-8'));

      expect(deCommon.meta.homepage.description).toBeDefined();
      expect(typeof deCommon.meta.homepage.description).toBe('string');
    });

    it('German title must target "Bild vergrößern" keywords', () => {
      const deCommonPath = path.join(localesDir, 'de', 'common.json');
      const deCommon = JSON.parse(fs.readFileSync(deCommonPath, 'utf-8'));
      const title = deCommon.meta.homepage.title;

      // Should contain German image upscaling keywords
      expect(title).toMatch(/bild|vergrößern|verbessern|qualität/i);
    });

    it('German description must target relevant keywords', () => {
      const deCommonPath = path.join(localesDir, 'de', 'common.json');
      const deCommon = JSON.parse(fs.readFileSync(deCommonPath, 'utf-8'));
      const description = deCommon.meta.homepage.description;

      // Should contain relevant German keywords
      expect(description).toMatch(/bild|qualität|verbessern/i);
      expect(description.length).toBeGreaterThan(50);
    });
  });

  describe('English locale meta', () => {
    it('must have meta.homepage in locales/en/common.json', () => {
      const enCommonPath = path.join(localesDir, 'en', 'common.json');
      const enCommon = JSON.parse(fs.readFileSync(enCommonPath, 'utf-8'));

      expect(enCommon.meta).toBeDefined();
      expect(enCommon.meta.homepage).toBeDefined();
    });

    it('must have title and defined', () => {
      const enCommonPath = path.join(localesDir, 'en', 'common.json');
      const enCommon = JSON.parse(fs.readFileSync(enCommonPath, 'utf-8'));

      expect(enCommon.meta.homepage.title).toBeDefined();
      expect(enCommon.meta.homepage.description).toBeDefined();
    });
  });
});

// ============================================================================
// B) Homepage Page Component — Verify metadata generation
// ============================================================================

describe('Locale Homepage Meta — Page Component', () => {
  const pagePath = path.resolve(__dirname, '../../../app/[locale]/page.tsx');
  const pageSource = fs.readFileSync(pagePath, 'utf-8');

  it('homepage must use getLocaleCommonTranslations helper', () => {
    expect(pageSource).toMatch(/getLocaleCommonTranslations/);
  });

  it('homepage must import locale translations dynamically', () => {
    // Should have dynamic import for locale files
    expect(pageSource).toMatch(/import\(`@\/locales\/\$\{locale\}\/common\.json`\)/);
  });

  it('homepage must use locale-specific title from translations', () => {
    // Should access meta.homepage.title from translations
    expect(pageSource).toMatch(/common\.meta\?\.homepage\?\.title/);
  });

  it('homepage must use locale-specific description from translations', () => {
    // Should access meta.homepage.description from translations
    expect(pageSource).toMatch(/common\.meta\?\.homepage\?\.description/);
  });

  it('homepage must have fallback to English defaults', () => {
    // Should use nullish coalescing for fallback
    expect(pageSource).toMatch(/\?\?/);
    expect(pageSource).toContain('AI Image Upscaler & Photo Enhancer');
  });

  it('homepage must still use getCanonicalUrl for canonical URLs', () => {
    expect(pageSource).toMatch(/getCanonicalUrl/);
  });

  it('homepage must still use generateHreflangAlternates', () => {
    expect(pageSource).toMatch(/generateHreflangAlternates/);
  });
});

// ============================================================================
// C) Canonical URL Tests — Verify correct locale-specific URLs
// ============================================================================

describe('Locale Homepage Meta — Canonical URLs', () => {
  const hreflangPath = path.resolve(__dirname, '../../../lib/seo/hreflang-generator.ts');
  const hreflangSource = fs.readFileSync(hreflangPath, 'utf-8');

  it('getCanonicalUrl must handle locale prefixes correctly', () => {
    // Function should handle locale parameter
    expect(hreflangSource).toMatch(/function\s+getCanonicalUrl/);
    expect(hreflangSource).toMatch(/locale/);
  });

  it('getCanonicalUrl must return BASE_URL for English (default locale)', () => {
    // English is default, so canonical should be just BASE_URL
    // Uses DEFAULT_LOCALE constant comparison
    expect(hreflangSource).toMatch(/locale\s+===\s+DEFAULT_LOCALE/);
  });

  it('getCanonicalUrl must return locale-prefixed URL for non-English locales', () => {
    // Non-English locales should have prefix
    expect(hreflangSource).toMatch(/getLocalizedPath/);
  });
});

// ============================================================================
// D) Keyword Targeting Verification
// ============================================================================

describe('Locale Homepage Meta — Keyword Targeting', () => {
  const localesDir = path.resolve(__dirname, '../../../locales');

  describe('French keyword targeting', () => {
    it('title should include "Enhance Image Quality"', () => {
      const frCommonPath = path.join(localesDir, 'fr', 'common.json');
      const frCommon = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));
      const title = frCommon.meta.homepage.title;

      // Targets "enhance quality" query
      expect(title).toMatch(/Enhance.*Quality/i);
    });

    it('title or description should include "Quality Enhancer"', () => {
      const frCommonPath = path.join(localesDir, 'fr', 'common.json');
      const frCommon = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));
      const title = frCommon.meta.homepage.title;
      const description = frCommon.meta.homepage.description;

      const combined = (title + ' ' + description).toLowerCase();
      expect(combined).toMatch(/quality.*enhancer|enhancer.*quality/);
    });

    it('should mention "free" for price-conscious users', () => {
      const frCommonPath = path.join(localesDir, 'fr', 'common.json');
      const frCommon = JSON.parse(fs.readFileSync(frCommonPath, 'utf-8'));
      const title = frCommon.meta.homepage.title;

      expect(title.toLowerCase()).toMatch(/free/);
    });
  });

  describe('German keyword targeting', () => {
    it('title should include "Bild vergrößern"', () => {
      const deCommonPath = path.join(localesDir, 'de', 'common.json');
      const deCommon = JSON.parse(fs.readFileSync(deCommonPath, 'utf-8'));
      const title = deCommon.meta.homepage.title;

      expect(title).toMatch(/Bild.*vergrößern|vergrößern.*Bild/i);
    });

    it('title or description should include "Bildqualität verbessern"', () => {
      const deCommonPath = path.join(localesDir, 'de', 'common.json');
      const deCommon = JSON.parse(fs.readFileSync(deCommonPath, 'utf-8'));
      const title = deCommon.meta.homepage.title;
      const description = deCommon.meta.homepage.description;

      const combined = title + ' ' + description;
      expect(combined).toMatch(/Bildqualität.*verbessern|verbessern.*Bildqualität|qualität.*verbessern/i);
    });

    it('should target "KI" (German for AI) users', () => {
      const deCommonPath = path.join(localesDir, 'de', 'common.json');
      const deCommon = JSON.parse(fs.readFileSync(deCommonPath, 'utf-8'));
      const description = deCommon.meta.homepage.description;

      expect(description).toMatch(/KI|Bildauflösung/i);
    });
  });
});

// ============================================================================
// E) Metadata Length Validation
// ============================================================================

describe('Locale Homepage Meta — Length Validation', () => {
  const localesDir = path.resolve(__dirname, '../../../locales');

  const testLocale = (locale: string) => {
    const commonPath = path.join(localesDir, locale, 'common.json');
    const common = JSON.parse(fs.readFileSync(commonPath, 'utf-8'));

    const title = common.meta?.homepage?.title ?? '';
    const description = common.meta?.homepage?.description ?? '';

    // Title should be 30-60 characters for optimal display
    expect(title.length).toBeGreaterThanOrEqual(30);
    expect(title.length).toBeLessThanOrEqual(70);

    // Description should be 120-158 characters for optimal display
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(160);
  };

  it('English title and description have optimal length', () => {
    testLocale('en');
  });

  it('French title and description have optimal length', () => {
    testLocale('fr');
  });

  it('German title and description have optimal length', () => {
    testLocale('de');
  });
});
