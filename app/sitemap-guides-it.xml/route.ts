/**
 * Guides Sitemap Route - Italian (it)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllGuides } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllGuides();
  return generateLocaleCategorySitemapResponse('it', 'guides', 'guides', pages, 0.7);
}
