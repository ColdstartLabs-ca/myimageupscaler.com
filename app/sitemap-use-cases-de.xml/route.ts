/**
 * Use Cases Sitemap Route - German (de)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllUseCases } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllUseCases();
  return generateLocaleCategorySitemapResponse('de', 'use-cases', 'use-cases', pages, 0.75);
}
