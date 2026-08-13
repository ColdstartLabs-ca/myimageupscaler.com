/**
 * Personas Expanded Sitemap Route
 * English-only category
 */

import { NextResponse } from 'next/server';
import { getAllPersonasExpandedPages } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
} from '@/lib/seo/sitemap-generator';
import { filterEligibleSitemapEntries } from '@/lib/seo/page-eligibility';

const CATEGORY = 'personas-expanded' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const pages = await getAllPersonasExpandedPages();
  const eligiblePages = filterEligibleSitemapEntries(
    pages,
    CATEGORY,
    'en',
    page => `/personas-expanded/${page.slug}`,
    page => page.lastUpdated
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${eligiblePages
  .map(
    page => `  <url>
    <loc>${BASE_URL}/personas-expanded/${page.slug}</loc>
    <lastmod>${page.lastUpdated}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
${generateSitemapHreflangLinks(`/personas-expanded/${page.slug}`, CATEGORY).join('\n')}
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
