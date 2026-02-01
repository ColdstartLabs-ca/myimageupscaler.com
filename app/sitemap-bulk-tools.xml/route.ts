/**
 * Bulk Tools Sitemap Route
 * English-only category
 */

import { NextResponse } from 'next/server';
import { getAllBulkToolsPages } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
} from '@/lib/seo/sitemap-generator';

const CATEGORY = 'bulk-tools' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const pages = await getAllBulkToolsPages();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/bulk-tools</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${generateSitemapHreflangLinks('/bulk-tools', CATEGORY).join('\n')}
  </url>
${pages
  .map(
    page => `  <url>
    <loc>${BASE_URL}/bulk-tools/${page.slug}</loc>
    <lastmod>${page.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${generateSitemapHreflangLinks(`/bulk-tools/${page.slug}`, CATEGORY).join('\n')}${
      page.ogImage
        ? `
    <image:image>
      <image:loc>${page.ogImage.startsWith('http') ? page.ogImage : `${BASE_URL}${page.ogImage}`}</image:loc>
      <image:title>${page.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
