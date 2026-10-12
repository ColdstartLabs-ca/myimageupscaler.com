/**
 * Sitemap Index Route
 * Based on PRD-PSEO-04 Section 1.2: Sitemap Index Implementation
 *
 * Generates a sitemap index with one sitemap per category.
 * Localized categories have additional per-locale sitemaps for explicit URL submission.
 * Each sitemap contains URLs with hreflang links for multi-language support.
 */

import { NextResponse } from 'next/server';
import { clientEnv } from '@shared/config/env';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/i18n/config';
import {
  ALL_CATEGORIES,
  LOCALIZED_CATEGORIES,
  isTranslatedPair,
} from '@/lib/seo/localization-config';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

/** Child sitemaps outside the pSEO category list. */
const NON_PSEO_SITEMAPS = ['static', 'blog'];

/**
 * Generate sitemap index with:
 * - One English sitemap per category that has a routed child sitemap
 * - One locale-specific sitemap per localized category × non-English locale
 */
export async function GET() {
  const sitemapEntries: Array<{ name: string; lastmod: string }> = [];
  const lastmod = new Date().toISOString();

  // English (canonical) sitemap for every category whose pages are indexable,
  // plus the non-pSEO sitemaps. Derived from ALL_CATEGORIES so a category with
  // no translated locale pair (scale, free, guides) still gets listed.
  for (const category of ALL_CATEGORIES) {
    sitemapEntries.push({ name: `sitemap-${category}.xml`, lastmod });
  }

  for (const category of NON_PSEO_SITEMAPS) {
    sitemapEntries.push({ name: `sitemap-${category}.xml`, lastmod });
  }

  // Locale-specific sitemaps for non-English locales with a measured translation
  for (const category of LOCALIZED_CATEGORIES) {
    for (const locale of SUPPORTED_LOCALES) {
      if (locale !== DEFAULT_LOCALE && isTranslatedPair(category, locale)) {
        sitemapEntries.push({ name: `sitemap-${category}-${locale}.xml`, lastmod });
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries
  .map(
    sitemap => `  <sitemap>
    <loc>${BASE_URL}/${sitemap.name}</loc>
    <lastmod>${sitemap.lastmod}</lastmod>
  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
