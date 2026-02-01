/**
 * Device × Use Case Sitemap Route - English (en)
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * Phase 4: Added hreflang links for all 7 languages
 */

import { NextResponse } from 'next/server';
import { getAllDeviceUse } from '@/lib/seo/data-loader';
import { generateSitemapUrlEntry, getSitemapResponseHeaders } from '@/lib/seo/sitemap-generator';
import type { Locale } from '@/i18n/config';
const CATEGORY = 'device-use' as const;

const LOCALE: Locale = 'en';

export async function GET() {
  const deviceUsePages = await getAllDeviceUse();

  // Generate category index entry
  const categoryEntry = generateSitemapUrlEntry({
    path: '/device-use',
    locale: LOCALE,
    changeFrequency: 'weekly',
    priority: 0.8,
    category: CATEGORY,
    includeHreflang: true,
  });

  // Generate device-use page entries with hreflang
  const pageEntries = deviceUsePages.map(page =>
    generateSitemapUrlEntry({
      path: `/device-use/${page.slug}`,
      locale: LOCALE,
      lastModified: page.lastUpdated,
      changeFrequency: 'weekly',
      priority: 0.8,
      includeHreflang: true,
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${categoryEntry}
${pageEntries.join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
