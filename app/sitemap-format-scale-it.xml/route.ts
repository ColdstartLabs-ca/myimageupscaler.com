/**
 * Format × Scale Sitemap Route - Italian (it)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllFormatScale } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllFormatScale();
  return generateLocaleCategorySitemapResponse('it', 'format-scale', 'format-scale', pages, 0.8);
}
