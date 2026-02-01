/**
 * Use Cases Sitemap Route - English (en)
 * Based on PRD-PSEO-04 Section 1.3: Category Sitemap Implementation
 * Phase 4: Added hreflang links for all 7 languages
 */

import { NextResponse } from 'next/server';
import { getAllUseCases } from '@/lib/seo/data-loader';
import { generateSitemapUrlEntry, getSitemapResponseHeaders } from '@/lib/seo/sitemap-generator';
import type { Locale } from '@/i18n/config';
const CATEGORY = 'use-cases' as const;

const LOCALE: Locale = 'en';

export async function GET() {
  const useCases = await getAllUseCases();

  // Generate category index entry
  const categoryEntry = generateSitemapUrlEntry({
    path: '/use-cases',
    locale: LOCALE,
    changeFrequency: 'weekly',
    priority: 0.75,
    category: CATEGORY,
    includeHreflang: true,
  });

  // Generate use case page entries with hreflang
  const useCaseEntries = useCases.map(useCase =>
    generateSitemapUrlEntry({
      path: `/use-cases/${useCase.slug}`,
      locale: LOCALE,
      lastModified: useCase.lastUpdated,
      changeFrequency: 'weekly',
      priority: 0.75,
      includeHreflang: true,
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${categoryEntry}
${useCaseEntries.join('\n')}
</urlset>`;

  return new NextResponse(xml, { headers: getSitemapResponseHeaders() });
}
