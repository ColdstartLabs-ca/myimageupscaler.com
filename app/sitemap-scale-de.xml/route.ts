/**
 * Scale Sitemap Route - German (de)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllScales } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllScales();
  return generateLocaleCategorySitemapResponse('de', 'scale', 'scale', pages, 0.8);
}
