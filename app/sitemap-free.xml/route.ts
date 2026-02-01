/**
 * Free Tools Sitemap Route - English (en)
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * Phase 4: Added hreflang links for all 7 languages
 * Localized category
 */

import { NextResponse } from 'next/server';
import { getAllFreeTools } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
} from '@/lib/seo/sitemap-generator';

const CATEGORY = 'free' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const freeTools = await getAllFreeTools();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/free</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
${generateSitemapHreflangLinks('/free', CATEGORY).join('\n')}
  </url>
${freeTools
  .map(freeTool => {
    const hreflangLinks = generateSitemapHreflangLinks(`/free/${freeTool.slug}`, CATEGORY).join(
      '\n'
    );
    return `  <url>
    <loc>${BASE_URL}/free/${freeTool.slug}</loc>
    <lastmod>${freeTool.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
${hreflangLinks}${
      freeTool.ogImage
        ? `
    <image:image>
      <image:loc>${freeTool.ogImage.startsWith('http') ? freeTool.ogImage : `${BASE_URL}${freeTool.ogImage}`}</image:loc>
      <image:title>${freeTool.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
