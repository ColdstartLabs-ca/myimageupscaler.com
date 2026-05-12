import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const VALIDATOR_SOURCE = 'scripts/validate-sitemap-structure.ts';

describe('sitemap structure validator hreflang policy', () => {
  it('uses English-only pSEO category policy when checking required hreflang locales', () => {
    const source = readFileSync(VALIDATOR_SOURCE, 'utf-8');

    expect(source).toContain(
      "import { isCategoryEnglishOnly } from '@/lib/seo/localization-config'"
    );
    expect(source).toContain('function getCategoryFromSitemapName');
    expect(source).toContain('function getRequiredHreflangLocales');
    expect(source).toContain("return [DEFAULT_LOCALE, 'x-default']");
  });

  it('does not hard-code all locales as required for every sitemap with hreflang', () => {
    const source = readFileSync(VALIDATOR_SOURCE, 'utf-8');

    expect(source).toContain('const requiredLocales = getRequiredHreflangLocales(sitemapName)');
    expect(source).not.toContain("const requiredLocales = [...SUPPORTED_LOCALES, 'x-default']");
  });
});
