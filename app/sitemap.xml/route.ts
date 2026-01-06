/**
 * Sitemap Index Route
 * Based on PRD-PSEO-04 Section 1.2: Sitemap Index Implementation
 */

import { NextResponse } from 'next/server';
import { clientEnv } from '@shared/config/env';

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

export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
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
