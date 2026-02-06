/**
 * Formats Sitemap Route - English (en)
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * Phase 4: Added hreflang links for all 7 languages
 * Localized category
 */

import { NextResponse } from 'next/server';
import { getAllFormats } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
  getMostRecentLastUpdated,
} from '@/lib/seo/sitemap-generator';

const CATEGORY = 'formats' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const formats = await getAllFormats();

  // Get the most recent lastUpdated date from all formats for the category page
  const categoryLastmod = getMostRecentLastUpdated(formats);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/formats</loc>
    <lastmod>${categoryLastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${generateSitemapHreflangLinks('/formats', CATEGORY).join('\n')}
  </url>
${formats
  .map(format => {
    const hreflangLinks = generateSitemapHreflangLinks(`/formats/${format.slug}`, CATEGORY).join(
      '\n'
    );
    return `  <url>
    <loc>${BASE_URL}/formats/${format.slug}</loc>
    <lastmod>${format.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${hreflangLinks}${
      format.ogImage
        ? `
    <image:image>
      <image:loc>${format.ogImage.startsWith('http') ? format.ogImage : `${BASE_URL}${format.ogImage}`}</image:loc>
      <image:title>${format.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
