/**
 * Comparisons Expanded Sitemap Route
 * English-only category
 */

import { NextResponse } from 'next/server';
import { getAllComparisonsExpandedPages } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
} from '@/lib/seo/sitemap-generator';

const CATEGORY = 'comparisons-expanded' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const pages = await getAllComparisonsExpandedPages();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages
  .map(
    page => `  <url>
    <loc>${BASE_URL}/comparisons-expanded/${page.slug}</loc>
    <lastmod>${page.lastUpdated}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
${generateSitemapHreflangLinks(`/comparisons-expanded/${page.slug}`, CATEGORY).join('\n')}
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
