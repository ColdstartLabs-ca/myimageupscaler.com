/**
 * Guides Sitemap Route - English (en)
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * Phase 4: Added hreflang links for all 7 languages
 * Localized category
 */

import { NextResponse } from 'next/server';
import { getAllGuides } from '@/lib/seo/data-loader';
import { clientEnv } from '@shared/config/env';
import {
  generateSitemapHreflangLinks,
  getSitemapResponseHeaders,
  getMostRecentLastUpdated,
} from '@/lib/seo/sitemap-generator';

const CATEGORY = 'guides' as const;
const BASE_URL = `https://${clientEnv.PRIMARY_DOMAIN}`;

export async function GET() {
  const guides = await getAllGuides();

  // Get the most recent lastUpdated date from all guides for the category page
  const categoryLastmod = getMostRecentLastUpdated(guides);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${BASE_URL}/guides</loc>
    <lastmod>${categoryLastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
${generateSitemapHreflangLinks('/guides', CATEGORY).join('\n')}
  </url>
${guides
  .map(guide => {
    const hreflangLinks = generateSitemapHreflangLinks(`/guides/${guide.slug}`, CATEGORY).join(
      '\n'
    );
    return `  <url>
    <loc>${BASE_URL}/guides/${guide.slug}</loc>
    <lastmod>${guide.lastUpdated}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
${hreflangLinks}${
      guide.ogImage
        ? `
    <image:image>
      <image:loc>${guide.ogImage.startsWith('http') ? guide.ogImage : `${BASE_URL}${guide.ogImage}`}</image:loc>
      <image:title>${guide.title}</image:title>
    </image:image>`
        : ''
    }
  </url>`;
  })
  .join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
