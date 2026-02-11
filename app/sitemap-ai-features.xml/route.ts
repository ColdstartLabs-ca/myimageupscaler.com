/**
 * AI Features Sitemap Route
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * English-only category
 */

import { NextResponse } from 'next/server';
import { getAllAIFeaturePages } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
} from '@/lib/seo/sitemap-generator';

const CATEGORY = 'ai-features' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const aiFeatures = await getAllAIFeaturePages();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/ai-features</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${generateSitemapHreflangLinks('/ai-features', CATEGORY).join('\n')}
  </url>
${aiFeatures
  .map(
    feature => `  <url>
    <loc>${BASE_URL}/ai-features/${feature.slug}</loc>
    <lastmod>${feature.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${generateSitemapHreflangLinks(`/ai-features/${feature.slug}`, CATEGORY).join('\n')}${
      feature.ogImage
        ? `
    <image:image>
      <image:loc>${feature.ogImage.startsWith('http') ? feature.ogImage : `${BASE_URL}${feature.ogImage}`}</image:loc>
      <image:title>${feature.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
