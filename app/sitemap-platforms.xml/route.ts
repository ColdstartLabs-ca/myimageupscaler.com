/**
 * Platforms Sitemap Route
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 */

import { NextResponse } from 'next/server';
import { getAllPlatforms } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const platforms = await getAllPlatforms();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/platforms</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
${platforms
  .map(
    platform => `  <url>
    <loc>${BASE_URL}/platforms/${platform.slug}</loc>
    <lastmod>${platform.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${
      platform.ogImage
        ? `
    <image:image>
      <image:loc>${platform.ogImage}</image:loc>
      <image:title>${platform.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
