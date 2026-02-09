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
import { LOCALIZED_CATEGORIES } from '@/lib/seo/localization-config';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

// English-only categories (no locale-specific sitemaps)
const ENGLISH_ONLY_SITEMAP_CATEGORIES = [
  'static',
  'blog',
  'compare',
  'platforms',
  'images',
  // 'ai-features' excluded: 0 pages, no route handler (zombie category)
  'content',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'bulk-tools',
];

/**
 * Generate sitemap index with:
 * - One sitemap per English-only category
 * - One English sitemap per localized category
 * - One locale-specific sitemap per localized category × non-English locale
 */
export async function GET() {
  const sitemapEntries: Array<{ name: string; lastmod: string }> = [];
  const lastmod = new Date().toISOString();

  // English-only categories: single sitemap each
  for (const category of ENGLISH_ONLY_SITEMAP_CATEGORIES) {
    sitemapEntries.push({ name: `sitemap-${category}.xml`, lastmod });
  }

  // Localized categories: English + per-locale sitemaps
  for (const category of LOCALIZED_CATEGORIES) {
    // English (canonical) sitemap
    sitemapEntries.push({ name: `sitemap-${category}.xml`, lastmod });

    // Locale-specific sitemaps for non-English locales
    for (const locale of SUPPORTED_LOCALES) {
      if (locale !== DEFAULT_LOCALE) {
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
