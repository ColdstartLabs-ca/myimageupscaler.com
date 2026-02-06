/**
 * Alternatives Sitemap Route - French (fr)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllAlternatives } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllAlternatives();
  return generateLocaleCategorySitemapResponse('fr', 'alternatives', 'alternatives', pages, 0.75);
}
