/**
 * Schema & Structured Data Validation Tests
 *
 * Guards against schema bugs that suppress rich results in Google Search.
 * Covers fixes from: PRD: Schema & Structured Data Fixes (seo-schema-structured-data-fixes.md)
 *
 * Phase 1: Organization.logo must be a string URL (not ImageObject)
 * Phase 2: Layout Organization must have @id matching schema-generator pattern
 * Phase 3: Pricing page must not emit schema via metadata.other (double-emission)
 * Phase 4: SearchAction must use /blog?q= (not /search?q= which doesn't exist)
 * Phase 5: No hardcoded AggregateRating (spam risk without verified data)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const appDir = path.resolve(__dirname, '../../../app');
const libDir = path.resolve(__dirname, '../../../lib');

const localeLayoutSource = fs.readFileSync(path.join(appDir, '[locale]', 'layout.tsx'), 'utf-8');
const blogPageSource = fs.readFileSync(
  path.join(appDir, '[locale]', 'blog', '[slug]', 'page.tsx'),
  'utf-8'
);
const pricingPageSource = fs.readFileSync(
  path.join(appDir, '[locale]', 'pricing', 'page.tsx'),
  'utf-8'
);
const pseoLayoutSource = fs.readFileSync(path.join(appDir, '(pseo)', 'layout.tsx'), 'utf-8');
const schemaGeneratorSource = fs.readFileSync(
  path.join(libDir, 'seo', 'schema-generator.ts'),
  'utf-8'
);

// ============================================================================
// Phase 1: Organization.logo must be a string URL
// ============================================================================

describe('Phase 1: Organization.logo — string URL (not ImageObject)', () => {
  it('locale layout should not use ImageObject for logo', () => {
    // The logo property must be a plain string, not { @type: ImageObject, url: ... }
    expect(localeLayoutSource).not.toMatch(/logo\s*:\s*\{[\s\S]*?'@type'\s*:\s*'ImageObject'/);
    expect(localeLayoutSource).not.toMatch(/logo\s*:\s*\{[\s\S]*?"@type"\s*:\s*"ImageObject"/);
  });

  it('locale layout Organization.logo should be a string URL', () => {
    // Should match: logo: `${serverEnv.BASE_URL}/logo/...`
    expect(localeLayoutSource).toMatch(/logo\s*:\s*`\$\{[^}]+\}\/logo\//);
  });

  it('blog page publisher logo should not use ImageObject', () => {
    expect(blogPageSource).not.toMatch(/logo\s*:\s*\{[\s\S]*?'@type'\s*:\s*'ImageObject'/);
    expect(blogPageSource).not.toMatch(/logo\s*:\s*\{[\s\S]*?"@type"\s*:\s*"ImageObject"/);
  });

  it('blog page publisher logo should use the site logo, not og-image', () => {
    // The publisher logo must reference /logo/ path, not /og-image.png
    const logoMatch = blogPageSource.match(/publisher\s*:\s*\{[\s\S]*?logo\s*:\s*`([^`]+)`/);
    expect(logoMatch).not.toBeNull();
    if (logoMatch) {
      expect(logoMatch[1]).toContain('/logo/');
      expect(logoMatch[1]).not.toContain('og-image');
    }
  });

  it('blog page publisher logo should reference horizontal-logo-full.png', () => {
    expect(blogPageSource).toMatch(/logo\/horizontal-logo-full\.png/);
  });
});

// ============================================================================
// Phase 2: Layout Organization must have @id
// ============================================================================

describe('Phase 2: Organization @id — entity deduplication', () => {
  it('locale layout Organization should have @id', () => {
    expect(localeLayoutSource).toMatch(/'@id'\s*:\s*`[^`]+#organization`/);
  });

  it('locale layout Organization @id should match schema-generator pattern', () => {
    // Must be: `${BASE_URL}#organization`
    expect(localeLayoutSource).toMatch(/'@id'\s*:/);
    expect(localeLayoutSource).toMatch(/#organization/);
  });

  it('pSEO layout Organization should also have consistent @id or logo string', () => {
    // pSEO layout already uses string logo — verify it hasn't regressed
    expect(pseoLayoutSource).not.toMatch(/logo\s*:\s*\{[\s\S]*?'@type'\s*:\s*'ImageObject'/);
  });
});

// ============================================================================
// Phase 3: Pricing page — single schema emission
// ============================================================================

describe('Phase 3: Pricing page — no double schema emission', () => {
  it('generateMetadata should not emit schema via metadata.other', () => {
    // Remove 'application/ld+json' from metadata.other to avoid double emission
    const generateMetadataBlock = pricingPageSource.match(
      /export\s+async\s+function\s+generateMetadata[\s\S]*?^}/m
    );
    expect(generateMetadataBlock).not.toBeNull();
    if (generateMetadataBlock) {
      expect(generateMetadataBlock[0]).not.toMatch(/other\s*:\s*\{/);
      expect(generateMetadataBlock[0]).not.toMatch(/application\/ld\+json/);
    }
  });

  it('pricing page should still emit schema via JSX script tag', () => {
    // The JSX default export must keep the <script type="application/ld+json"> tag
    expect(pricingPageSource).toMatch(/type="application\/ld\+json"/);
    expect(pricingPageSource).toMatch(/generatePricingSchema/);
  });
});

// ============================================================================
// Phase 4: SearchAction URL consistency
// ============================================================================

describe('Phase 4: SearchAction URL — /blog?q= (not /search?q=)', () => {
  it('locale layout SearchAction should use /blog?q=', () => {
    expect(localeLayoutSource).toMatch(/\/blog\?q=\{search_term_string\}/);
  });

  it('locale layout SearchAction must not reference /search (nonexistent route)', () => {
    expect(localeLayoutSource).not.toMatch(/\/search\?q=/);
  });

  it('pSEO layout SearchAction should use /blog?q= (already correct)', () => {
    expect(pseoLayoutSource).toMatch(/\/blog\?q=\{search_term_string\}/);
    expect(pseoLayoutSource).not.toMatch(/\/search\?q=/);
  });

  it('SearchAction URL should be consistent across both layouts', () => {
    const localeMatch = localeLayoutSource.match(/urlTemplate\s*:\s*`([^`]+)`/);
    const pseoMatch = pseoLayoutSource.match(/urlTemplate\s*:\s*`([^`]+)`/);

    expect(localeMatch).not.toBeNull();
    expect(pseoMatch).not.toBeNull();

    if (localeMatch && pseoMatch) {
      // Both should have the same path pattern (/blog?q=)
      expect(localeMatch[1]).toMatch(/\/blog\?q=/);
      expect(pseoMatch[1]).toMatch(/\/blog\?q=/);
    }
  });
});

// ============================================================================
// Phase 5: No hardcoded AggregateRating
// ============================================================================

describe('Phase 5: AggregateRating — no fabricated data', () => {
  it('schema-generator should not contain hardcoded ratingValue: 4.8', () => {
    // Hardcoded fake ratings are schema spam and risk manual action from Google
    expect(schemaGeneratorSource).not.toMatch(/ratingValue\s*:\s*4\.8/);
  });

  it('schema-generator should not contain hardcoded ratingCount: 1250', () => {
    expect(schemaGeneratorSource).not.toMatch(/ratingCount\s*:\s*1250/);
  });

  it('schema-generator should not contain hardcoded reviewCount: 1250', () => {
    expect(schemaGeneratorSource).not.toMatch(/reviewCount\s*:\s*1250/);
  });

  it('generatePricingSchema should not emit AggregateRating', async () => {
    const { generatePricingSchema } = await import('@lib/seo/schema-generator');
    const schema = generatePricingSchema() as Record<string, unknown>;
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toContain('AggregateRating');
    expect(schemaStr).not.toContain('ratingValue');
  });

  it('generateHomepageSchema should not emit AggregateRating', async () => {
    const { generateHomepageSchema } = await import('@lib/seo/schema-generator');
    const schema = generateHomepageSchema('en');
    const schemaStr = JSON.stringify(schema);
    expect(schemaStr).not.toContain('AggregateRating');
    expect(schemaStr).not.toContain('ratingValue');
  });
});
