/**
 * Sitemap Index Route
 * Based on PRD-PSEO-04 Section 1.2: Sitemap Index Implementation
 *
 * Generates a sitemap index with one sitemap per category.
 * Each sitemap contains canonical URLs with hreflang links for multi-language support.
 */

import { NextResponse } from 'next/server';
import { clientEnv } from '@shared/config/env';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

// Categories that should have sitemaps
const CATEGORIES = [
  'static',
  'blog',
  'tools',
  'formats',
  'scale',
  'use-cases',
  'compare',
  'alternatives',
  'guides',
  'free',
  'platforms',
  'images',
  'format-scale',
  'platform-format',
  'device-use',
  'ai-features',
  'content',
  'photo-restoration',
  'camera-raw',
  'industry-insights',
  'device-optimization',
  'bulk-tools',
];

/**
 * Generate sitemap index with one sitemap per category
 * Each sitemap contains hreflang links for all available locales
 */
export async function GET() {
  const sitemapEntries: Array<{ name: string; lastmod: string }> = [];

  // Generate one sitemap per category
  for (const category of CATEGORIES) {
    sitemapEntries.push({
      name: `sitemap-${category}.xml`,
      lastmod: new Date().toISOString(),
    });
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
