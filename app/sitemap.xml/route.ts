/**
 * Sitemap Index Route
 * Based on PRD-PSEO-04 Section 1.2: Sitemap Index Implementation
 * Phase 5: Added multi-language sitemap support with hreflang
 */

import { NextResponse } from 'next/server';
import { clientEnv } from '@shared/config/env';
import { SUPPORTED_LOCALES } from '@/i18n/config';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

const sitemaps = [
  { name: 'sitemap-static.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-blog.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-tools.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-formats.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-scale.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-use-cases.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-compare.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-alternatives.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-guides.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-free.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-platforms.xml', lastmod: new Date().toISOString() },
  { name: 'sitemap-images.xml', lastmod: new Date().toISOString() },
];

/**
 * Generate sitemap index with locale-specific sitemaps
 * Each category now has sitemaps for each supported locale
 */
export async function GET() {
  // Generate sitemap entries for each locale
  const localeSitemaps: Array<{ name: string; lastmod: string }> = [];

  for (const locale of SUPPORTED_LOCALES) {
    // Skip default locale (English) as it's the root path
    if (locale === 'en') {
      // Add base sitemaps for English (default locale)
      for (const sitemap of sitemaps) {
        localeSitemaps.push(sitemap);
      }
    } else {
      // Add locale-prefixed sitemaps for other languages
      for (const sitemap of sitemaps) {
        // Insert locale prefix before the filename
        const localeName = sitemap.name.replace('.xml', `-${locale}.xml`);
        localeSitemaps.push({
          name: localeName,
          lastmod: sitemap.lastmod,
        });
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${localeSitemaps
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
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
