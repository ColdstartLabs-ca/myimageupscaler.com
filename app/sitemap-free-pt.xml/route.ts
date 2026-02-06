/**
 * Free Tools Sitemap Route - Portuguese (pt)
 * Locale-specific sitemap with localized URLs and hreflang annotations
 */

import { getAllFreeTools } from '@/lib/seo/data-loader';
import { generateLocaleCategorySitemapResponse } from '@/lib/seo/locale-sitemap-handler';

export async function GET() {
  const pages = await getAllFreeTools();
  return generateLocaleCategorySitemapResponse('pt', 'free', 'free', pages, 0.85);
}
