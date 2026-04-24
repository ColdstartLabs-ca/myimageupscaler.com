/**
 * AI Photo Editor Hub Sitemap Route
 * English-only, single hub page (no sub-pages)
 */

import { NextResponse } from 'next/server';
import { clientEnv } from '@shared/config/env';
import { getSitemapResponseHeaders } from '@/lib/seo/sitemap-generator';

const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const lastmod = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/ai-photo-editor</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
