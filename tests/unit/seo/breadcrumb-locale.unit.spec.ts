/**
 * Breadcrumb Locale Unit Tests
 *
 * Tests that English-only category templates do not generate locale-prefixed
 * breadcrumb URLs. This prevents GSC redirect errors caused by internal links
 * adding locale prefixes to categories that only exist in English.
 *
 * Related PRD: Fix GSC Redirect Errors - 104 pages with redirects
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// English-only categories from localization-config.ts
const ENGLISH_ONLY_CATEGORIES = [
  'compare',
  'comparisons-expanded',
  'platforms',
  'bulk-tools',
  'content',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'ai-features',
  'technical-guides',
  'personas-expanded',
  'use-cases-expanded',
];

// Localized categories from localization-config.ts
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
];

// Template files to check
const TEMPLATE_DIR = path.resolve(__dirname, '../../../app/(pseo)/_components/pseo/templates');
/**
 * Read a template file and extract BreadcrumbNav items
 * Returns the raw breadcrumb configuration text
 */
function extractBreadcrumbConfig(templatePath: string): string | null {
  if (!fs.existsSync(templatePath)) {
    return null;
  }
  const content = fs.readFileSync(templatePath, 'utf-8');
  // Find the BreadcrumbNav component usage
  const breadcrumbMatch = content.match(/<BreadcrumbNav[\s\S]*?\/>/);
  if (!breadcrumbMatch) {
    return null;
  }
  return breadcrumbMatch[0];
}
/**
 * Check if breadcrumb config contains locale-prefixed URLs
 * Returns true if locale prefixing pattern is found (e.g., `/${locale}/category`)
 */
function hasLocalePrefixing(breadcrumbConfig: string): boolean {
  // Match patterns like: `/${locale}` or `/${locale}/something`
  // This catches the problematic pattern: locale ? `/${locale}` : '/'
  return /locale\s*\?\s*`\/\$\{locale\}/.test(breadcrumbConfig);
}
describe('Breadcrumb Locale Handling for English-Only Categories', () => {
  describe('PlatformPageTemplate (platforms category)', () => {
    it('should not include locale prefix in breadcrumb hrefs', () => {
      const templatePath = path.join(TEMPLATE_DIR, 'PlatformPageTemplate.tsx');
      const breadcrumbConfig = extractBreadcrumbConfig(templatePath);
      expect(breadcrumbConfig).not.toBeNull();
      // Verify specific expected paths - NO locale prefix
      expect(breadcrumbConfig).toContain("label: 'Home', href: '/'");
      expect(breadcrumbConfig).toContain("label: 'Platforms', href: '/platforms'");
      expect(breadcrumbConfig).toContain('href: `/platforms/${data.slug}`');
      // Should NOT contain locale conditional logic
      expect(breadcrumbConfig).not.toContain('${locale}');
    });
  });
  describe('ComparePageTemplate (compare category)', () => {
    it('should not use locale prop (already correct)', () => {
      const templatePath = path.join(TEMPLATE_DIR, 'ComparePageTemplate.tsx');
      const content = fs.readFileSync(templatePath, 'utf-8');
      // ComparePageTemplate should NOT have a locale prop in its interface
      expect(content).not.toMatch(/locale\?.*:\s*string/);
      // BreadcrumbNav should use direct paths
      const breadcrumbConfig = extractBreadcrumbConfig(templatePath);
      if (breadcrumbConfig) {
        expect(hasLocalePrefixing(breadcrumbConfig)).toBe(false);
      }
    });
  });
  describe('GenericPSEOPageTemplate (fallback for many categories)', () => {
    it('should use BASE_URL without locale prefix', () => {
      const templatePath = path.join(TEMPLATE_DIR, 'GenericPSEOPageTemplate.tsx');
      const content = fs.readFileSync(templatePath, 'utf-8');
      // GenericPSEOPageTemplate uses BASE_URL for breadcrumbs
      // This is correct because BASE_URL is the full URL without locale
      const breadcrumbMatch = content.match(
        /breadcrumbItems:\s*IBreadcrumbItem\[\]\s*=\s*\[([\s\S]*?)\];/
      );
      expect(breadcrumbMatch).not.toBeNull();
      const breadcrumbDef = breadcrumbMatch![1];
      // Should use BASE_URL, not locale
      expect(breadcrumbDef).toContain('BASE_URL');
      expect(breadcrumbDef).not.toContain('${locale}');
    });
  });
  describe('All English-only templates audit', () => {
    it('should verify English-only templates do not use locale prefixing', () => {
      // Templates for English-only categories
      const englishOnlyTemplates = [
        { file: 'PlatformPageTemplate.tsx', category: 'platforms' },
        { file: 'ComparePageTemplate.tsx', category: 'compare' },
        { file: 'GenericPSEOPageTemplate.tsx', category: 'fallback' },
      ];
      for (const { file, category } of englishOnlyTemplates) {
        const templatePath = path.join(TEMPLATE_DIR, file);
        const breadcrumbConfig = extractBreadcrumbConfig(templatePath);
        if (breadcrumbConfig) {
          expect(
            hasLocalePrefixing(breadcrumbConfig),
            `${file} should not have locale prefixing for English-only category ${category}`
          ).toBe(false);
        }
      }
    });
    it('should verify localized templates DO use locale prefixing (control test)', () => {
      // Templates for localized categories - these SHOULD have locale prefixing
      const localizedTemplates = [
        { file: 'ToolPageTemplate.tsx', category: 'tools' },
        { file: 'GuidePageTemplate.tsx', category: 'guides' },
        { file: 'AlternativePageTemplate.tsx', category: 'alternatives' },
      ];
      let foundLocalizedWithPrefixing = false;
      for (const { file, category } of localizedTemplates) {
        const templatePath = path.join(TEMPLATE_DIR, file);
        const breadcrumbConfig = extractBreadcrumbConfig(templatePath);
        if (breadcrumbConfig && hasLocalePrefixing(breadcrumbConfig)) {
          foundLocalizedWithPrefixing = true;
        }
      }
      // At least one localized template should use locale prefixing
      expect(
        foundLocalizedWithPrefixing,
        'At least one localized template should use locale prefixing'
      ).toBe(true);
    });
  });
  describe('Breadcrumb URL format validation', () => {
    it('PlatformPageTemplate should generate correct static breadcrumb URLs', () => {
      const templatePath = path.join(TEMPLATE_DIR, 'PlatformPageTemplate.tsx');
      const breadcrumbConfig = extractBreadcrumbConfig(templatePath);
      expect(breadcrumbConfig).not.toBeNull();
      // Should contain these exact patterns (no locale interpolation)
      expect(breadcrumbConfig).toContain("label: 'Home', href: '/'");
      expect(breadcrumbConfig).toContain("label: 'Platforms', href: '/platforms'");
      expect(breadcrumbConfig).toContain('href: `/platforms/${data.slug}`');
    });
    it('should not have conditional locale logic in English-only templates', () => {
      const templatePath = path.join(TEMPLATE_DIR, 'PlatformPageTemplate.tsx');
      const breadcrumbConfig = extractBreadcrumbConfig(templatePath);
      expect(breadcrumbConfig).not.toBeNull();
      // Should NOT contain ternary operators with locale for href values
      expect(breadcrumbConfig).not.toMatch(/locale\s*\?\s*`\/\$\{locale\}/);
      // Should NOT contain locale variable in href template literals
      expect(breadcrumbConfig).not.toContain('${locale}');
    });
  });
});
describe('Localization Config Validation', () => {
  it('should verify platforms is in ENGLISH_ONLY_CATEGORIES', async () => {
    const { ENGLISH_ONLY_CATEGORIES } = await import('@/lib/seo/localization-config');
    expect(ENGLISH_ONLY_CATEGORIES).toContain('platforms');
    expect(ENGLISH_ONLY_CATEGORIES).toContain('compare');
    expect(ENGLISH_ONLY_CATEGORIES).toContain('bulk-tools');
    expect(ENGLISH_ONLY_CATEGORIES).toContain('ai-features');
  });
  it('should verify tools is NOT in ENGLISH_ONLY_CATEGORIES (it is localized)', async () => {
    const { ENGLISH_ONLY_CATEGORIES, LOCALIZED_CATEGORIES } =
      await import('@/lib/seo/localization-config');
    expect(ENGLISH_ONLY_CATEGORIES).not.toContain('tools');
    expect(LOCALIZED_CATEGORIES).toContain('tools');
  });
});
